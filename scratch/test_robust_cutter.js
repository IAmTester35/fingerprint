import { createRng } from '../src/core/prng.js';
import { createNoise2D } from '../src/core/noise.js';
import { generateThumbMask } from '../src/fingerprint/mask.js';
import { placeSingularities } from '../src/fingerprint/singularities.js';
import { generateOrientationField } from '../src/fingerprint/orientation.js';
import { generateFrequencyField } from '../src/fingerprint/frequency.js';
import { synthesizeRidges } from '../src/fingerprint/ridges-gabor.js';
import { postProcessRidges } from '../src/fingerprint/postprocess.js';

function getDifficultyConfig(numReal = 4) {
  if (numReal <= 4) {
    return {
      numReal: 4,
      pieceSize: 70,
      minGap: 8,
      numDecoys: 2,
      regions: [
        { name: 'slot-1-upper-left',  rx: [-0.60, -0.30], ry: [-0.55, -0.25] },
        { name: 'slot-2-top-center',  rx: [-0.15,  0.15], ry: [-0.70, -0.42] },
        { name: 'slot-3-mid-right',   rx: [ 0.28,  0.58], ry: [-0.30,  0.05] },
        { name: 'slot-4-lower-left',  rx: [-0.52, -0.22], ry: [ 0.10,  0.42] }
      ]
    };
  } else if (numReal <= 6) {
    return {
      numReal: 6,
      pieceSize: 62,
      minGap: 6,
      numDecoys: 2,
      regions: [
        { name: 'slot-1-upper-left',   rx: [-0.58, -0.28], ry: [-0.58, -0.30] },
        { name: 'slot-2-top-center',   rx: [-0.15,  0.15], ry: [-0.72, -0.45] },
        { name: 'slot-3-upper-right',  rx: [ 0.28,  0.58], ry: [-0.48, -0.20] },
        { name: 'slot-4-mid-left',     rx: [-0.58, -0.28], ry: [-0.15,  0.15] },
        { name: 'slot-5-center',       rx: [-0.05,  0.22], ry: [-0.12,  0.18] },
        { name: 'slot-6-lower-left',   rx: [-0.58, -0.25], ry: [ 0.22,  0.50] }
      ]
    };
  } else {
    return {
      numReal: 8,
      pieceSize: 54,
      minGap: 5,
      numDecoys: 1,
      regions: [
        { name: 'slot-1-upper-left',   rx: [-0.58, -0.28], ry: [-0.60, -0.32] },
        { name: 'slot-2-top-center',   rx: [-0.15,  0.15], ry: [-0.72, -0.46] },
        { name: 'slot-3-upper-right',  rx: [ 0.26,  0.56], ry: [-0.52, -0.22] },
        { name: 'slot-4-mid-left',     rx: [-0.58, -0.28], ry: [-0.18,  0.12] },
        { name: 'slot-5-center',       rx: [-0.08,  0.18], ry: [-0.12,  0.15] },
        { name: 'slot-6-lower-left',   rx: [-0.58, -0.26], ry: [ 0.20,  0.48] },
        { name: 'slot-7-bottom-center', rx: [-0.15,  0.15], ry: [ 0.35,  0.62] },
        { name: 'slot-8-lower-right',  rx: [ 0.22,  0.52], ry: [ 0.20,  0.48] }
      ]
    };
  }
}

function hasAABBCollision(px, py, size, pieces, minGap) {
  for (const piece of pieces) {
    const xOverlap = Math.abs(px - piece.x) < (size + minGap);
    const yOverlap = Math.abs(py - piece.y) < (size + minGap);
    if (xOverlap && yOverlap) return true;
  }
  return false;
}

function isValidPatch(px, py, size, width, height, mask) {
  if (px < 5 || py < 5 || px + size >= width - 5 || py + size >= height - 5) return false;
  let count = 0;
  for (let y = py; y < py + size; y++) {
    for (let x = px; x < px + size; x++) {
      if (mask[y * width + x] > 0.05) count++;
    }
  }
  return (count / (size * size)) >= 0.18;
}

function computePatchVariance(px, py, size, width, processed) {
  let sum = 0, sumSq = 0;
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

function extractPatchData(px, py, size, width, processed) {
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      data[y * size + x] = processed[(py + y) * width + (px + x)];
    }
  }
  return data;
}

function extractPatch(px, py, size, width, height, processed, orderIndex) {
  return {
    id: 'real-' + orderIndex,
    orderIndex,
    isDecoy: false,
    x: px,
    y: py,
    size,
    data: extractPatchData(px, py, size, width, processed)
  };
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

function robustCutPuzzlePieces(width, height, processed, maskInfo, singularities, params, rng) {
  const reqNumReal = params.numReal || 4;
  const config = getDifficultyConfig(reqNumReal);
  const numReal = config.numReal;
  const pieceSize = params.pieceSize || config.pieceSize;
  let minGap = config.minGap;
  const { mask, center, radii } = maskInfo;

  const realPieces = [];

  // Pass 1: Try placing each piece in its dedicated candidate region
  for (let i = 0; i < config.regions.length && realPieces.length < numReal; i++) {
    const region = config.regions[i];
    let bestPatch = null;
    let maxVariance = -1;

    for (let attempt = 0; attempt < 80; attempt++) {
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
      realPieces.push(extractPatch(bestPatch.px, bestPatch.py, pieceSize, width, height, processed, realPieces.length + 1));
    }
  }

  // Pass 2: Relaxed boundary search for any unplaced slot
  if (realPieces.length < numReal) {
    const currentMinGap = Math.max(3, minGap - 2);
    for (let i = realPieces.length; i < numReal; i++) {
      const region = config.regions[i % config.regions.length];
      let bestPatch = null;
      let maxVariance = -1;

      for (let attempt = 0; attempt < 120; attempt++) {
        // Expand search range by 50%
        const rxMid = (region.rx[0] + region.rx[1]) / 2;
        const ryMid = (region.ry[0] + region.ry[1]) / 2;
        const rxSpan = (region.rx[1] - region.rx[0]) * 1.5;
        const rySpan = (region.ry[1] - region.ry[0]) * 1.5;

        const rxFactor = rxMid + (rng.next() - 0.5) * rxSpan;
        const ryFactor = ryMid + (rng.next() - 0.5) * rySpan;

        const px = Math.round(center.x + rxFactor * radii.rx - pieceSize / 2);
        const py = Math.round(center.y + ryFactor * radii.ry - pieceSize / 2);

        if (!isValidPatch(px, py, pieceSize, width, height, mask)) continue;
        if (hasAABBCollision(px, py, pieceSize, realPieces, currentMinGap)) continue;

        const variance = computePatchVariance(px, py, pieceSize, width, processed);
        if (variance > maxVariance) {
          maxVariance = variance;
          bestPatch = { px, py };
        }
      }

      if (bestPatch) {
        realPieces.push(extractPatch(bestPatch.px, bestPatch.py, pieceSize, width, height, processed, realPieces.length + 1));
      }
    }
  }

  // Pass 3: Global grid scan fallback if needed
  if (realPieces.length < numReal) {
    const finalMinGap = 3;
    const step = 8;
    const startX = Math.max(10, Math.round(center.x - radii.rx * 0.75));
    const endX = Math.min(width - pieceSize - 10, Math.round(center.x + radii.rx * 0.75));
    const startY = Math.max(10, Math.round(center.y - radii.ry * 0.75));
    const endY = Math.min(height - pieceSize - 10, Math.round(center.y + radii.ry * 0.75));

    for (let py = startY; py < endY && realPieces.length < numReal; py += step) {
      for (let px = startX; px < endX && realPieces.length < numReal; px += step) {
        if (!isValidPatch(px, py, pieceSize, width, height, mask)) continue;
        if (hasAABBCollision(px, py, pieceSize, realPieces, finalMinGap)) continue;

        realPieces.push(extractPatch(px, py, pieceSize, width, height, processed, realPieces.length + 1));
      }
    }
  }

  // Normalize orderIndex 1..N
  realPieces.forEach((p, idx) => {
    p.orderIndex = idx + 1;
  });

  // Generate authentic decoy pieces
  const numDecoys = config.numDecoys;
  const decoyPieces = [];

  // Strategy A: Distinct valid fingerprint regions with NCC < 0.58
  for (let d = 0; d < 100 && decoyPieces.length < numDecoys; d++) {
    const px = rng.nextInt(Math.round(center.x - radii.rx * 0.65), Math.max(center.x, Math.round(center.x + radii.rx * 0.65 - pieceSize)));
    const py = rng.nextInt(Math.round(center.y - radii.ry * 0.65), Math.max(center.y, Math.round(center.y + radii.ry * 0.65 - pieceSize)));

    if (!isValidPatch(px, py, pieceSize, width, height, mask)) continue;

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

  // Strategy B: Subtle transformations if Strategy A didn't reach numDecoys
  let transformIdx = 0;
  while (decoyPieces.length < numDecoys && realPieces.length > 0) {
    const basePiece = realPieces[transformIdx % realPieces.length];
    transformIdx++;

    const decoyData = new Float32Array(pieceSize * pieceSize);
    const mode = decoyPieces.length % 3;

    for (let dy = 0; dy < pieceSize; dy++) {
      for (let dx = 0; dx < pieceSize; dx++) {
        let srcX = dx;
        let srcY = dy;
        if (mode === 0) {
          srcX = pieceSize - 1 - dx;
          srcY = pieceSize - 1 - dy;
        } else if (mode === 1) {
          srcX = pieceSize - 1 - dy;
          srcY = dx;
        } else {
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

// RUN COMPREHENSIVE TESTS
console.log('Running 30 random seed tests across Easy (4), Normal (6), and Hard (8)...');
const testSeeds = [
  428913, 100001, 234567, 888888, 999123, 765432, 123456, 555555, 333221, 654987,
  112233, 445566, 778899, 987654, 321654, 654321, 147258, 258369, 369147, 741852,
  852963, 963741, 159357, 357159, 456789, 789123, 987123, 654789, 321987, 852741
];

for (const targetCount of [4, 6, 8]) {
  console.log(`\nTesting targetCount = ${targetCount}...`);
  let success = 0;
  for (const seed of testSeeds) {
    const rng = createRng(seed);
    const noise = createNoise2D(rng);
    const maskInfo = generateThumbMask(512, 512, {}, rng, noise);
    const singularities = placeSingularities(512, 512, maskInfo, {}, rng);
    const theta = generateOrientationField(512, 512, singularities, maskInfo, {}, noise);
    const freqInfo = generateFrequencyField(512, 512, singularities, maskInfo, {}, noise);
    const ridges = synthesizeRidges(512, 512, theta, freqInfo, maskInfo, {}, rng);
    const postInfo = postProcessRidges(512, 512, ridges.rawRidges, maskInfo, {}, rng, noise);

    const puzzle = robustCutPuzzlePieces(512, 512, postInfo.processed, maskInfo, singularities, { numReal: targetCount }, rng);

    if (puzzle.realPieces.length === targetCount) {
      success++;
    } else {
      console.warn(`Seed ${seed}: Expected ${targetCount}, got ${puzzle.realPieces.length}`);
    }
  }
  console.log(`Result for ${targetCount} targets: ${success}/${testSeeds.length} (100% = ${success === testSeeds.length})`);
}
