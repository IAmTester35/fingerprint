/**
 * Post-processing pipeline for authentic forensic & dermal realism.
 */
export function postProcessRidges(
  width,
  height,
  rawRidges,
  maskInfo,
  params = {},
  rng,
  noise,
  theta = null,
) {
  const { mask, center, radii } = maskInfo;
  const numPixels = width * height;
  const processed = new Float32Array(numPixels);

  const {
    grainStrength = 0.32,
    breakFrequency = 0.4,
    poreFrequency = 0.35,
    pressureContrast = 0.38,
  } = params;

  const invRx = 1.0 / radii.rx;
  const invRy = 1.0 / radii.ry;
  const pCenterY = center.y - radii.ry * 0.08;

  // 1. Dermal Pressure Map
  const pressure = new Float32Array(numPixels);
  let idx = 0;
  for (let y = 0; y < height; y++) {
    const dy = (y - pCenterY) * invRy;
    const dySq = dy * dy;
    const noiseY = y * 0.01;

    for (let x = 0; x < width; x++, idx++) {
      const m = mask[idx];
      if (m <= 0) continue;

      const dx = (x - center.x) * invRx;
      const distSq = dx * dx + dySq;

      let p = Math.exp(-distSq * 0.95);
      const pNoise = noise.fbm(x * 0.01, noiseY, 2, 0.5, 2.0);
      p = Math.max(0.25, Math.min(1.0, p + pNoise * 0.12));

      pressure[idx] = p * m;
    }
  }

  // 2. Sweat Pores generation (with soft 1px halo for organic pit appearance)
  // 0 = none, 1 = pore edge (halo), 2 = pore center
  const poreField = new Uint8Array(numPixels);
  const poreStep = 4;
  for (let py = 10; py < height - 10; py += poreStep) {
    for (let px = 10; px < width - 10; px += poreStep) {
      const jx = px + rng.nextInt(-1, 1);
      const jy = py + rng.nextInt(-1, 1);
      const pIdx = jy * width + jx;

      if (mask[pIdx] > 0.4 && rawRidges[pIdx] > 0.55) {
        if (rng.next() < poreFrequency) {
          poreField[pIdx] = 2; // Center
          // Soften 4-neighbors if they are also on the ridge peak
          if (rawRidges[pIdx - 1] > 0.3 && poreField[pIdx - 1] === 0)
            poreField[pIdx - 1] = 1;
          if (rawRidges[pIdx + 1] > 0.3 && poreField[pIdx + 1] === 0)
            poreField[pIdx + 1] = 1;
          if (rawRidges[pIdx - width] > 0.3 && poreField[pIdx - width] === 0)
            poreField[pIdx - width] = 1;
          if (rawRidges[pIdx + width] > 0.3 && poreField[pIdx + width] === 0)
            poreField[pIdx + width] = 1;
        }
      }
    }
  }

  // 3. Hairline Transverse Cuts (Precompute cos/sin & bounding radius!)
  const numHairlines = rng.nextInt(6, 12);
  const hairlines = [];
  for (let h = 0; h < numHairlines; h++) {
    const len = rng.nextFloat(16, 48);
    const halfLen = len * 0.5;
    const angle = rng.nextFloat(-0.45, 0.45);
    hairlines.push({
      cx: center.x + rng.nextFloat(-radii.rx * 0.65, radii.rx * 0.65),
      cy: center.y + rng.nextFloat(-radii.ry * 0.75, radii.ry * 0.75),
      halfLen,
      maxDistSq: (halfLen + 2) * (halfLen + 2),
      cosA: Math.cos(angle),
      sinA: Math.sin(angle),
    });
  }

  const dropoutNoiseOffset = rng.nextFloat(0, 500);
  const dThresh = 0.7 - breakFrequency * 0.22;
  const baseThresh = 0.08;
  const pressureScale = pressureContrast * 0.42; // Uses pressureContrast (~0.16 when 0.38)

  // 4. Physical Dermal Ridge Rendering
  idx = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++, idx++) {
      const m = mask[idx];
      if (m <= 0.005) {
        processed[idx] = 0;
        continue;
      }

      const raw = rawRidges[idx];
      const press = pressure[idx];

      // D (Moved First!). Check valley threshold BEFORE computing expensive noises/cuts
      const threshold = baseThresh - (press - 0.5) * pressureScale;
      if (raw <= threshold) {
        processed[idx] = 0;
        continue;
      }

      // Compute base slender ridge crest profile
      const normRaw = (raw - threshold) / (1.0 - threshold + 0.001);
      let ridgeVal = Math.pow(Math.sin(normRaw * (Math.PI * 0.5)), 1.35);

      // A. Dermal Papillae Noise (Using 2*theta vector warping to avoid [0, π) branch-cut seam!)
      let grain;
      if (theta) {
        const twoAng = 2.0 * theta[idx];
        const warpX = x * 0.5 + Math.cos(twoAng) * 1.5;
        const warpY = y * 0.5 + Math.sin(twoAng) * 1.5;
        grain =
          noise.noise2D(warpX, warpY) * 0.22 +
          noise.noise2D(x * 0.95, y * 0.95) * 0.14;
      } else {
        grain =
          noise.noise2D(x * 0.5, y * 0.5) * 0.22 +
          noise.noise2D(x * 0.95, y * 0.95) * 0.14;
      }
      const grainFactor = Math.max(
        0.68,
        Math.min(1.05, 1.0 - grain * grainStrength * 0.75),
      );
      ridgeVal *= grainFactor;

      // B. Hairline Cut Attenuation (Using precomputed trig & fast bounding check)
      let cutAtten = 1.0;
      for (let h = 0; h < numHairlines; h++) {
        const hl = hairlines[h];
        const dx = x - hl.cx;
        const dy = y - hl.cy;
        if (dx * dx + dy * dy > hl.maxDistSq) continue; // Fast skip!

        const along = Math.abs(dx * hl.cosA + dy * hl.sinA);
        if (along < hl.halfLen) {
          const perp = Math.abs(-dx * hl.sinA + dy * hl.cosA);
          if (perp < 1.1) {
            const atten = perp / 1.1;
            if (atten < cutAtten) cutAtten = atten;
          }
        }
      }

      // C. Random Micro-Breaks
      const dNoise = noise.noise2D(x * 0.18 + dropoutNoiseOffset, y * 0.18);
      if (dNoise > dThresh) {
        const breakFactor = Math.max(0.0, 1.0 - (dNoise - dThresh) * 6.0);
        ridgeVal *= breakFactor;
      }

      ridgeVal *= cutAtten;

      // Apply pores (center = 0.18, soft halo edge = 0.62)
      const pore = poreField[idx];
      if (pore === 2) {
        ridgeVal *= 0.18;
      } else if (pore === 1) {
        ridgeVal *= 0.62;
      }

      // E. Natural Peripheral Dissolution
      if (m < 0.65) {
        const normM = m / 0.65;
        const scatter = (noise.noise2D(x * 0.45, y * 0.45) + 1.0) * 0.5;
        ridgeVal *= Math.pow(normM, scatter > normM * 1.1 ? 2.2 : 1.3);
      }

      // Modulate peak brightness slightly by contact pressure
      const pressureBoost = 1.0 - pressureContrast * 0.25 * (1.0 - press);
      processed[idx] = Math.max(
        0.0,
        Math.min(1.0, ridgeVal * pressureBoost * m),
      );
    }
  }

  return {
    processed,
    pressure,
  };
}
