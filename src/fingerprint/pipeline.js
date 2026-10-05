import { createRng } from '../core/prng.js';
import { createNoise2D } from '../core/noise.js';
import { generateThumbMask } from './mask.js';
import { placeSingularities } from './singularities.js';
import { generateOrientationField } from './orientation.js';
import { generateFrequencyField } from './frequency.js';
import { synthesizeRidges } from './ridges-gabor.js';
import { postProcessRidges } from './postprocess.js';
import { validateFingerprint } from './validate.js';
import { cutPuzzlePieces } from '../puzzle/cutter.js';

/**
 * End-to-end procedural fingerprint generator with telemetry benchmarks.
 */
export function generateFullFingerprint(params = {}) {
  const width = params.width || 512;
  const height = params.height || 512;
  const seed = params.seed || Math.floor(Math.random() * 10000000);

  const tStart = performance.now();
  const timings = {};

  // 1. Initialize Seeded PRNG & Simplex Noise
  const rng = createRng(seed);
  const noise = createNoise2D(rng);

  // 2. Thumb Mask
  const t0 = performance.now();
  const maskInfo = generateThumbMask(width, height, params, rng, noise);
  timings.maskMs = performance.now() - t0;

  // 3. Singular Points (Core & Delta)
  const t1 = performance.now();
  const singularities = placeSingularities(width, height, maskInfo, params, rng);
  timings.singularitiesMs = performance.now() - t1;

  // 4. Orientation Field θ(x, y)
  const t2 = performance.now();
  const theta = generateOrientationField(width, height, singularities, maskInfo, params, noise);
  timings.orientationMs = performance.now() - t2;

  // 5. Frequency Field f(x, y)
  const t3 = performance.now();
  const freqInfo = generateFrequencyField(width, height, singularities, maskInfo, params, noise);
  timings.frequencyMs = performance.now() - t3;

  // 6. Gabor Ridge Synthesis (multi-pass)
  const t4 = performance.now();
  const ridges = synthesizeRidges(width, height, theta, freqInfo, maskInfo, params, rng);
  timings.gaborMs = performance.now() - t4;

  // 7. Dermal Post-processing (pressure, pores, creases, ink)
  const t5 = performance.now();
  const postInfo = postProcessRidges(width, height, ridges.rawRidges, maskInfo, params, rng, noise, theta);
  timings.postprocessMs = performance.now() - t5;

  // 8. Quality Validation & Minutiae extraction
  const t6 = performance.now();
  const quality = validateFingerprint(width, height, postInfo.processed, theta, maskInfo, singularities);
  timings.validationMs = performance.now() - t6;

  // 9. Puzzle Cutting & Decoys (if requested)
  let puzzle = null;
  if (params.cutPuzzle) {
    const t7 = performance.now();
    puzzle = cutPuzzlePieces(width, height, postInfo.processed, maskInfo, singularities, params, rng);
    timings.puzzleMs = performance.now() - t7;
  }

  timings.totalMs = performance.now() - tStart;

  return {
    seed,
    width,
    height,
    params,
    maskInfo,
    singularities,
    theta,
    freqInfo,
    rawRidges: ridges.rawRidges,
    processed: postInfo.processed,
    pressure: postInfo.pressure,
    quality,
    puzzle,
    timings: Object.fromEntries(
      Object.entries(timings).map(([k, v]) => [k, Number(v.toFixed(1))])
    )
  };
}
