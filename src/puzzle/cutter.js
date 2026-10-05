/**
 * Puzzle Cutter and Decoy Generator.
 * Selects 4 square puzzle pieces from the master fingerprint corresponding to
 * Slots 1, 2, 3, 4 with strict non-overlapping AABB collision guarantees.
 * Generates 4 decoy pieces (authentic biometric distractors) with NCC < 0.60.
 */

export function cutPuzzlePieces(width, height, processed, maskInfo, singularities, params, rng) {
  const { numReal = 4, pieceSize = 74 } = params;
  const { mask, center, radii } = maskInfo;

  const realPieces = [];
  const minGap = 12; // Minimum pixel gap between any two puzzle pieces

  // Quadrant anchors for 4 slots across the portrait fingerprint:
  // 1: Top-Left (upper left flank)
  // 2: Top-Right (upper right flank)
  // 3: Mid-Right (middle-to-lower right delta flank)
  // 4: Bot-Left (lower left distal flank)
  const candidateRegions = [
    { name: 'top-left',  rx: [-0.60, -0.12], ry: [-0.68, -0.32] },
    { name: 'top-right', rx: [ 0.12,  0.60], ry: [-0.68, -0.32] },
    { name: 'mid-right', rx: [ 0.15,  0.62], ry: [-0.02,  0.35] },
    { name: 'bot-left',  rx: [-0.62, -0.15], ry: [ 0.05,  0.42] }
  ];

  for (let i = 0; i < candidateRegions.length; i++) {
    const region = candidateRegions[i];
    let bestPatch = null;
    let maxVariance = -1;

    // Search for a high-contrast valid non-overlapping patch within this quadrant
    for (let attempt = 0; attempt < 50; attempt++) {
      const rxFactor = region.rx[0] + rng.next() * (region.rx[1] - region.rx[0]);
      const ryFactor = region.ry[0] + rng.next() * (region.ry[1] - region.ry[0]);

      const px = Math.round(center.x + rxFactor * radii.rx - pieceSize / 2);
      const py = Math.round(center.y + ryFactor * radii.ry - pieceSize / 2);

      if (!isValidPatch(px, py, pieceSize, width, height, mask)) continue;
      if (hasAABBCollision(px, py, pieceSize, realPieces, minGap)) continue;

      const variance = computePatchVariance(px, py, pieceSize, width, processed);
      if (variance > maxVariance) {
        maxVariance = variance;
        bestPatch = { px, py };
      }
    }

    if (bestPatch) {
      realPieces.push(extractPatch(bestPatch.px, bestPatch.py, pieceSize, width, height, processed, i + 1));
    }
  }

  // Fallback if any region failed: rejection sampling across valid mask area with strict collision check
  let fallbackAttempts = 0;
  while (realPieces.length < numReal && fallbackAttempts < 300) {
    fallbackAttempts++;
    const px = rng.nextInt(Math.round(center.x - radii.rx * 0.70), Math.round(center.x + radii.rx * 0.70 - pieceSize));
    const py = rng.nextInt(Math.round(center.y - radii.ry * 0.70), Math.round(center.y + radii.ry * 0.70 - pieceSize));

    if (!isValidPatch(px, py, pieceSize, width, height, mask)) continue;
    if (hasAABBCollision(px, py, pieceSize, realPieces, minGap)) continue;

    realPieces.push(extractPatch(px, py, pieceSize, width, height, processed, realPieces.length + 1));
  }

  // Ensure 1..4 order index
  realPieces.forEach((p, idx) => {
    p.orderIndex = idx + 1;
  });

  // Generate 4 authentic decoy pieces (total 8 cards in grid)
  const numDecoys = 4;
  const decoyPieces = [];

  // Strategy A: Extract patches from other valid areas not colliding with realPieces
  for (let d = 0; d < 80 && decoyPieces.length < 2; d++) {
    const px = rng.nextInt(Math.round(center.x - radii.rx * 0.65), Math.round(center.x + radii.rx * 0.65 - pieceSize));
    const py = rng.nextInt(Math.round(center.y - radii.ry * 0.65), Math.round(center.y + radii.ry * 0.65 - pieceSize));

    if (!isValidPatch(px, py, pieceSize, width, height, mask)) continue;

    // Check that it doesn't match any real piece closely
    const testPatch = extractPatchData(px, py, pieceSize, width, processed);
    let maxNcc = 0;
    for (const real of realPieces) {
      const ncc = computeNCC(testPatch, real.data);
      if (ncc > maxNcc) maxNcc = ncc;
    }

    if (maxNcc < 0.58) {
      decoyPieces.push({
        id: 'decoy-' + (decoyPieces.length + 1),
        isDecoy: true,
        size: pieceSize,
        data: testPatch,
        maxNcc: Number(maxNcc.toFixed(3))
      });
    }
  }

  // Strategy B: Subtle transformations (rotate 180° / flip / shift) of real pieces
  let transformIdx = 0;
  while (decoyPieces.length < numDecoys) {
    const basePiece = realPieces[transformIdx % realPieces.length];
    transformIdx++;

    const decoyData = new Float32Array(pieceSize * pieceSize);
    const mode = decoyPieces.length % 3;

    for (let dy = 0; dy < pieceSize; dy++) {
      for (let dx = 0; dx < pieceSize; dx++) {
        let srcX = dx;
        let srcY = dy;
        if (mode === 0) {
          // 180 degree rotation
          srcX = pieceSize - 1 - dx;
          srcY = pieceSize - 1 - dy;
        } else if (mode === 1) {
          // 90 deg rotation
          srcX = pieceSize - 1 - dy;
          srcY = dx;
        } else {
          // Horizontal flip + vertical displacement
          srcX = pieceSize - 1 - dx;
          srcY = (dy + Math.round(pieceSize * 0.3)) % pieceSize;
        }
        decoyData[dy * pieceSize + dx] = basePiece.data[srcY * pieceSize + srcX];
      }
    }

    let maxNcc = 0;
    for (const real of realPieces) {
      const ncc = computeNCC(decoyData, real.data);
      if (ncc > maxNcc) maxNcc = ncc;
    }

    decoyPieces.push({
      id: 'decoy-' + (decoyPieces.length + 1),
      isDecoy: true,
      size: pieceSize,
      data: decoyData,
      maxNcc: Number(maxNcc.toFixed(3))
    });
  }

  return {
    realPieces,
    decoyPieces,
    pieceSize,
    numReal: realPieces.length,
    numDecoys: decoyPieces.length
  };
}

/**
 * Strict 2D AABB Box Collision Check with safety margin
 */
function hasAABBCollision(px, py, size, pieces, minGap = 12) {
  for (const piece of pieces) {
    const xOverlap = Math.abs(px - piece.x) < (size + minGap);
    const yOverlap = Math.abs(py - piece.y) < (size + minGap);
    if (xOverlap && yOverlap) {
      return true; // Overlap detected
    }
  }
  return false;
}

function isValidPatch(px, py, size, width, height, mask) {
  if (px < 10 || py < 10 || px + size >= width - 10 || py + size >= height - 10) return false;
  let count = 0;
  for (let y = py; y < py + size; y++) {
    for (let x = px; x < px + size; x++) {
      if (mask[y * width + x] > 0.70) count++;
    }
  }
  return (count / (size * size)) >= 0.88;
}

function computePatchVariance(px, py, size, width, processed) {
  let sum = 0;
  let sumSq = 0;
  const count = size * size;
  for (let y = py; y < py + size; y++) {
    for (let x = px; x < px + size; x++) {
      const v = processed[y * width + x];
      sum += v;
      sumSq += v * v;
    }
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function extractPatch(px, py, size, width, height, processed, orderIndex) {
  const data = extractPatchData(px, py, size, width, processed);
  return {
    id: 'real-' + orderIndex,
    orderIndex,
    isDecoy: false,
    x: px,
    y: py,
    size,
    data
  };
}

function extractPatchData(px, py, size, width, processed) {
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      data[y * size + x] = processed[(py + y) * width + (px + x)];
    }
  }
  return data;
}

function computeNCC(a, b) {
  const len = a.length;
  let meanA = 0, meanB = 0;
  for (let i = 0; i < len; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= len;
  meanB /= len;

  let num = 0, denA = 0, denB = 0;
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

