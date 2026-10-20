/**
 * High-Precision Iterative Spatially-Variant Gabor Ridge Synthesizer (SFinGe model).
 * Uses a 64-angle x 8-frequency 2D Gabor filter bank (17x17 symmetric kernel)
 * with dense harmonic seeding and local automatic gain control (AGC).
 */
export function synthesizeRidges(
  width,
  height,
  theta,
  freqInfo,
  maskInfo,
  params,
  rng,
) {
  const { mask } = maskInfo;
  const { iterations = 10, beta = 2.8 } = params;
  const numPixels = width * height;

  // 1. Build High-Resolution Precomputed Gabor Filter Bank (64 angles x 8 frequencies = 512 filters)
  const NUM_ANGLES = 64;
  const NUM_FREQS = 8;
  const KERNEL_RADIUS = 8; // 17x17 kernel (289 taps = 144 symmetric pairs + 1 center tap)
  const KERNEL_SIZE = KERNEL_RADIUS * 2 + 1;
  const KERNEL_LEN = KERNEL_SIZE * KERNEL_SIZE;
  const HALF_LEN = KERNEL_LEN >> 1; // 144

  const minFreq = 1.0 / 6.2;
  const maxFreq = 1.0 / 3.2;
  const invFreqSpan = (NUM_FREQS - 1) / (maxFreq - minFreq);

  // Precompute 1D pixel offset table for the first half of the kernel
  const pixelOffsets = new Int32Array(HALF_LEN);
  let pIdx = 0;
  for (let ky = -KERNEL_RADIUS; ky <= KERNEL_RADIUS; ky++) {
    for (let kx = -KERNEL_RADIUS; kx <= KERNEL_RADIUS; kx++) {
      if (pIdx < HALF_LEN) {
        pixelOffsets[pIdx++] = ky * width + kx;
      }
    }
  }

  // Flat 1D array of 512 kernels (each stores 145 values: 144 pairs + 1 center at index 144)
  const filterBank = new Array(NUM_ANGLES * NUM_FREQS);
  const fullKernel = new Float32Array(KERNEL_LEN);

  for (let a = 0; a < NUM_ANGLES; a++) {
    const angle = (a / NUM_ANGLES) * Math.PI; // [0, π)
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    for (let f = 0; f < NUM_FREQS; f++) {
      const freq = minFreq + (f / (NUM_FREQS - 1)) * (maxFreq - minFreq);
      const sigmaU = 0.5 / freq;
      const sigmaV = 0.75 / freq;
      const invSigmaU2 = 1.0 / (2.0 * sigmaU * sigmaU);
      const invSigmaV2 = 1.0 / (2.0 * sigmaV * sigmaV);
      const twoPiFreq = 2.0 * Math.PI * freq;

      let kIdx = 0;
      let mean = 0;
      for (let ky = -KERNEL_RADIUS; ky <= KERNEL_RADIUS; ky++) {
        for (let kx = -KERNEL_RADIUS; kx <= KERNEL_RADIUS; kx++) {
          const u = -kx * sinA + ky * cosA;
          const v = kx * cosA + ky * sinA;
          const val =
            Math.exp(-(u * u * invSigmaU2 + v * v * invSigmaV2)) *
            Math.cos(twoPiFreq * u);
          fullKernel[kIdx++] = val;
          mean += val;
        }
      }

      // Zero-mean DC balance & L1 normalization
      mean /= KERNEL_LEN;
      let absSum = 0;
      for (let i = 0; i < KERNEL_LEN; i++) {
        fullKernel[i] -= mean;
        absSum += Math.abs(fullKernel[i]);
      }
      const norm = absSum > 0 ? 1.0 / absSum : 1.0;

      // Store only the unique first half + center element (145 floats instead of 289)
      const halfKernel = new Float32Array(HALF_LEN + 1);
      for (let i = 0; i <= HALF_LEN; i++) {
        halfKernel[i] = fullKernel[i] * norm;
      }

      filterBank[(a << 3) | f] = halfKernel;
    }
  }

  // 2. Dense Continuous Seeding
  let src = new Float32Array(numPixels);
  let dst = new Float32Array(numPixels);

  for (let i = 0; i < numPixels; i++) {
    if (mask[i] > 0.05) {
      src[i] = rng.nextFloat(-0.45, 0.45);
    }
  }

  // Minutiae & bifurcation impulse seeds
  const seedStep = 11;
  for (let y = seedStep; y < height - seedStep; y += seedStep) {
    for (let x = seedStep; x < width - seedStep; x += seedStep) {
      const idx = y * width + x;
      if (mask[idx] > 0.35) {
        const px = Math.min(width - 1, Math.max(0, x + rng.nextInt(-3, 3)));
        const py = Math.min(height - 1, Math.max(0, y + rng.nextInt(-3, 3)));
        src[py * width + px] += rng.nextFloat(-0.75, 0.75);
      }
    }
  }

  // 3. Pre-map each pixel to a single combined 1D filterBank index
  const filterIndices = new Uint16Array(numPixels);
  const frequencies = freqInfo.frequency;

  for (let i = 0; i < numPixels; i++) {
    if (mask[i] < 0.05) continue;
    const aIdx = Math.round((theta[i] / Math.PI) * NUM_ANGLES) % NUM_ANGLES;
    const fClamped = Math.max(minFreq, Math.min(maxFreq, frequencies[i]));
    const fIdx = Math.round((fClamped - minFreq) * invFreqSpan);
    filterIndices[i] = (aIdx << 3) | fIdx;
  }

  // 4. Iterative Multi-pass Convolution using Symmetric Kernel Folding
  for (let pass = 0; pass < iterations; pass++) {
    const progress = pass / Math.max(1, iterations - 1);
    const gain = beta * (1.0 + 0.8 * progress);

    for (let y = KERNEL_RADIUS; y < height - KERNEL_RADIUS; y++) {
      const rowOffset = y * width;
      for (let x = KERNEL_RADIUS; x < width - KERNEL_RADIUS; x++) {
        const idx = rowOffset + x;
        if (mask[idx] < 0.05) {
          dst[idx] = 0;
          continue;
        }

        const halfKernel = filterBank[filterIndices[idx]];
        // Start with center tap (kx = 0, ky = 0)
        let sum = halfKernel[HALF_LEN] * src[idx];

        // Fold symmetric pairs: kernel[k] * (src[idx + offset] + src[idx - offset])
        for (let k = 0; k < HALF_LEN; k++) {
          const offset = pixelOffsets[k];
          sum += halfKernel[k] * (src[idx + offset] + src[idx - offset]);
        }

        dst[idx] = Math.tanh(gain * sum);
      }
    }

    // Ping-pong swap
    const tmp = src;
    src = dst;
    dst = tmp;
  }

  // 5. Normalization pass
  for (let i = 0; i < numPixels; i++) {
    if (mask[i] > 0.05) {
      const v = src[i] * 1.25;
      src[i] = v < -1.0 ? -1.0 : v > 1.0 ? 1.0 : v;
    } else {
      src[i] = 0;
    }
  }

  return {
    rawRidges: src,
    iterations,
  };
}
