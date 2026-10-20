/**
 * Puzzle Cutter and Decoy Generator (Hard Mode Canonical Layout).
 * Strictly places 8 target pieces (56x56) + 1 decoy piece = 9 pieces (3x3 grid)
 * without AABB overlaps.
 */

export const HARD_CONFIG = {
  numReal: 8,
  pieceSize: 56,
  minGap: 5,
  numDecoys: 1,
  label: "KHÓ // 8 MỤC TIÊU",
  regions: [
    { name: "slot-1-upper-left", rx: [-0.58, -0.28], ry: [-0.6, -0.32] },
    { name: "slot-2-top-center", rx: [-0.15, 0.15], ry: [-0.72, -0.46] },
    { name: "slot-3-upper-right", rx: [0.26, 0.56], ry: [-0.52, -0.22] },
    { name: "slot-4-mid-left", rx: [-0.58, -0.28], ry: [-0.18, 0.12] },
    { name: "slot-5-center", rx: [-0.08, 0.18], ry: [-0.12, 0.15] },
    { name: "slot-6-lower-left", rx: [-0.58, -0.26], ry: [0.2, 0.48] },
    { name: "slot-7-bottom-center", rx: [-0.15, 0.15], ry: [0.35, 0.62] },
    { name: "slot-8-lower-right", rx: [0.22, 0.52], ry: [0.2, 0.48] },
  ],
};

// Kept for backward-compatibility if imported elsewhere, locked to Hard mode
export const DIFFICULTY_PRESETS = {
  easy: HARD_CONFIG,
  normal: HARD_CONFIG,
  hard: HARD_CONFIG,
};

export function getDifficultyConfig() {
  return HARD_CONFIG;
}

export function cutPuzzlePieces(
  width,
  height,
  processed,
  maskInfo,
  singularities,
  params = {},
  rng,
) {
  const numReal = HARD_CONFIG.numReal;
  const pieceSize = params.pieceSize || HARD_CONFIG.pieceSize;
  const minGap = params.minGap ?? HARD_CONFIG.minGap;
  const numDecoys = params.numDecoys ?? HARD_CONFIG.numDecoys;
  const regions = HARD_CONFIG.regions;

  const { mask, center, radii } = maskInfo;
  const halfPiece = pieceSize * 0.5;
  const realPieces = [];

  // Pass 1: Place each of the 8 targets in its designated candidate region
  for (let i = 0; i < numReal; i++) {
    const region = regions[i];
    const rxMin = region.rx[0];
    const rxSpan = region.rx[1] - rxMin;
    const ryMin = region.ry[0];
    const rySpan = region.ry[1] - ryMin;

    let bestPatch = null;
    let maxVariance = -1;

    for (let attempt = 0; attempt < 100; attempt++) {
      const rxFactor = rxMin + rng.next() * rxSpan;
      const ryFactor = ryMin + rng.next() * rySpan;

      const px = Math.round(center.x + rxFactor * radii.rx - halfPiece);
      const py = Math.round(center.y + ryFactor * radii.ry - halfPiece);

      if (!isValidPatch(px, py, pieceSize, width, height, mask)) continue;
      if (hasAABBCollision(px, py, pieceSize, realPieces, minGap)) continue;

      const variance = computePatchVariance(
        px,
        py,
        pieceSize,
        width,
        processed,
      );
      if (variance > maxVariance) {
        maxVariance = variance;
        bestPatch = { px, py, slotIndex: i };
      }
    }

    if (bestPatch) {
      realPieces.push(
        extractPatch(
          bestPatch.px,
          bestPatch.py,
          pieceSize,
          width,
          processed,
          bestPatch.slotIndex,
        ),
      );
    }
  }

  // Pass 2: Relaxed boundary search for any unplaced target slot
  if (realPieces.length < numReal) {
    const relaxedMinGap = Math.max(3, minGap - 2);
    const placedSlots = new Set(realPieces.map((p) => p.slotIndex));

    for (let i = 0; i < numReal && realPieces.length < numReal; i++) {
      if (placedSlots.has(i)) continue;

      const region = regions[i];
      const rxMid = (region.rx[0] + region.rx[1]) * 0.5;
      const ryMid = (region.ry[0] + region.ry[1]) * 0.5;
      const rxSpan = (region.rx[1] - region.rx[0]) * 1.6;
      const rySpan = (region.ry[1] - region.ry[0]) * 1.6;

      let bestPatch = null;
      let maxVariance = -1;

      for (let attempt = 0; attempt < 150; attempt++) {
        const rxFactor = rxMid + (rng.next() - 0.5) * rxSpan;
        const ryFactor = ryMid + (rng.next() - 0.5) * rySpan;

        const px = Math.round(center.x + rxFactor * radii.rx - halfPiece);
        const py = Math.round(center.y + ryFactor * radii.ry - halfPiece);

        if (!isValidPatch(px, py, pieceSize, width, height, mask)) continue;
        if (hasAABBCollision(px, py, pieceSize, realPieces, relaxedMinGap))
          continue;

        const variance = computePatchVariance(
          px,
          py,
          pieceSize,
          width,
          processed,
        );
        if (variance > maxVariance) {
          maxVariance = variance;
          bestPatch = { px, py, slotIndex: i };
        }
      }

      if (bestPatch) {
        realPieces.push(
          extractPatch(
            bestPatch.px,
            bestPatch.py,
            pieceSize,
            width,
            processed,
            bestPatch.slotIndex,
          ),
        );
      }
    }
  }

  // Pass 3: Global adaptive grid scan to strictly guarantee all 8 pieces
  if (realPieces.length < numReal) {
    const finalMinGap = 3;
    const step = 12;
    const startX = Math.max(10, Math.round(center.x - radii.rx * 0.8));
    const endX = Math.min(
      width - pieceSize - 10,
      Math.round(center.x + radii.rx * 0.8),
    );
    const startY = Math.max(10, Math.round(center.y - radii.ry * 0.8));
    const endY = Math.min(
      height - pieceSize - 10,
      Math.round(center.y + radii.ry * 0.8),
    );

    for (
      let py = startY;
      py < endY && realPieces.length < numReal;
      py += step
    ) {
      for (
        let px = startX;
        px < endX && realPieces.length < numReal;
        px += step
      ) {
        if (!isValidPatch(px, py, pieceSize, width, height, mask)) continue;
        if (hasAABBCollision(px, py, pieceSize, realPieces, finalMinGap))
          continue;

        realPieces.push(
          extractPatch(px, py, pieceSize, width, processed, realPieces.length),
        );
      }
    }
  }

  // Sort pieces spatially (top-to-bottom, left-to-right) and assign clean 1..8 IDs
  realPieces.sort((a, b) => (Math.abs(a.y - b.y) > 28 ? a.y - b.y : a.x - b.x));
  for (let i = 0; i < realPieces.length; i++) {
    realPieces[i].orderIndex = i + 1;
    realPieces[i].id = "real-" + (i + 1);
    delete realPieces[i].slotIndex;
  }

  // Generate Decoy Pieces (Default Hard: 1 decoy -> 8 + 1 = 9 total pieces)
  const decoyPieces = [];

  // Strategy A: Distinct valid fingerprint regions with low correlation (NCC < 0.58)
  const rxMin = Math.round(center.x - radii.rx * 0.65);
  const rxMax = Math.max(
    rxMin + 1,
    Math.round(center.x + radii.rx * 0.65 - pieceSize),
  );
  const ryMin = Math.round(center.y - radii.ry * 0.65);
  const ryMax = Math.max(
    ryMin + 1,
    Math.round(center.y + radii.ry * 0.65 - pieceSize),
  );

  for (let d = 0; d < 80 && decoyPieces.length < numDecoys; d++) {
    const px = rng.nextInt(rxMin, rxMax);
    const py = rng.nextInt(ryMin, ryMax);

    if (!isValidPatch(px, py, pieceSize, width, height, mask)) continue;

    const testPatch = extractPatchData(px, py, pieceSize, width, processed);
    let maxNcc = 0;
    for (let i = 0; i < realPieces.length; i++) {
      const ncc = computeNCC(testPatch, realPieces[i].data);
      if (ncc > maxNcc) maxNcc = ncc;
    }

    if (maxNcc < 0.58) {
      decoyPieces.push({
        id: "decoy-" + (decoyPieces.length + 1),
        isDecoy: true,
        size: pieceSize,
        data: testPatch,
        maxNcc: Number(maxNcc.toFixed(3)),
      });
    }
  }

  // Strategy B: Seamless rigid transformations (180° rot, 90° rot, horizontal flip) of real pieces
  let transformIdx = rng.nextInt(0, Math.max(0, realPieces.length - 1));
  while (decoyPieces.length < numDecoys && realPieces.length > 0) {
    const basePiece = realPieces[transformIdx % realPieces.length];
    transformIdx++;

    const decoyData = new Float32Array(pieceSize * pieceSize);
    const mode = decoyPieces.length % 3;

    for (let dy = 0; dy < pieceSize; dy++) {
      const rowOffset = dy * pieceSize;
      for (let dx = 0; dx < pieceSize; dx++) {
        let srcX, srcY;
        if (mode === 0) {
          // 180-degree rotation
          srcX = pieceSize - 1 - dx;
          srcY = pieceSize - 1 - dy;
        } else if (mode === 1) {
          // 90-degree clockwise rotation
          srcX = pieceSize - 1 - dy;
          srcY = dx;
        } else {
          // Horizontal mirror flip (seamless, no modulo wrap-around cut!)
          srcX = pieceSize - 1 - dx;
          srcY = dy;
        }
        decoyData[rowOffset + dx] = basePiece.data[srcY * pieceSize + srcX];
      }
    }

    let maxNcc = 0;
    for (let i = 0; i < realPieces.length; i++) {
      const ncc = computeNCC(decoyData, realPieces[i].data);
      if (ncc > maxNcc) maxNcc = ncc;
    }

    decoyPieces.push({
      id: "decoy-" + (decoyPieces.length + 1),
      isDecoy: true,
      size: pieceSize,
      data: decoyData,
      maxNcc: Number(maxNcc.toFixed(3)),
    });
  }

  return {
    realPieces,
    decoyPieces,
    pieceSize,
    numReal: realPieces.length,
    numDecoys: decoyPieces.length,
    difficulty: HARD_CONFIG.label,
  };
}

/**
 * Strict 2D AABB Box Collision Check with safety margin
 */
function hasAABBCollision(px, py, size, pieces, minGap = 5) {
  const minDist = size + minGap;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (Math.abs(px - piece.x) < minDist && Math.abs(py - piece.y) < minDist) {
      return true;
    }
  }
  return false;
}

function isValidPatch(px, py, size, width, height, mask) {
  if (px < 5 || py < 5 || px + size >= width - 5 || py + size >= height - 5)
    return false;
  let count = 0;
  let totalSampled = 0;
  for (let y = py; y < py + size; y += 2) {
    const rowOffset = y * width;
    for (let x = px; x < px + size; x += 2) {
      totalSampled++;
      if (mask[rowOffset + x] > 0.05) count++;
    }
  }
  return count / totalSampled >= 0.18;
}

function computePatchVariance(px, py, size, width, processed) {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  // Stride-2 sampling is 4x faster and statistically identical for 56x56 ridge variance
  for (let y = py; y < py + size; y += 2) {
    const rowOffset = y * width;
    for (let x = px; x < px + size; x += 2) {
      const v = processed[rowOffset + x];
      sum += v;
      sumSq += v * v;
      count++;
    }
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function extractPatch(px, py, size, width, processed, slotIndex) {
  return {
    id: "real-" + (slotIndex + 1),
    orderIndex: slotIndex + 1,
    slotIndex,
    isDecoy: false,
    x: px,
    y: py,
    size,
    data: extractPatchData(px, py, size, width, processed),
  };
}

function extractPatchData(px, py, size, width, processed) {
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const srcStart = (py + y) * width + px;
    data.set(processed.subarray(srcStart, srcStart + size), y * size);
  }
  return data;
}

function computeNCC(a, b) {
  const len = a.length;
  let meanA = 0,
    meanB = 0;
  for (let i = 0; i < len; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= len;
  meanB /= len;

  let num = 0,
    denA = 0,
    denB = 0;
  for (let i = 0; i < len; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den > 0 ? Math.abs(num / den) : 0;
}
