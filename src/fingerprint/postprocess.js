/**
 * Post-processing pipeline for authentic forensic & dermal realism.
 * Simulates real-world physical and biometric capture phenomena:
 * - Flow-aligned dermal papillae micro-stippling & ink granularity
 * - Organic incipient ridge micro-breaks, hairline cuts & dry skin fissures
 * - Biological sweat pores (small pits along ridge crests)
 * - Physiological contact pressure gradient
 * - Natural peripheral dissolution (ridges softly breaking into specks at the edges)
 */
export function postProcessRidges(width, height, rawRidges, maskInfo, params = {}, rng, noise, theta = null) {
  const { mask, center, radii } = maskInfo;
  const numPixels = width * height;
  const processed = new Float32Array(numPixels);

  // Configurable realism parameters
  const {
    grainStrength = 0.32,
    breakFrequency = 0.40,
    poreFrequency = 0.35,
    pressureContrast = 0.38
  } = params;

  // 1. Dermal Pressure Map: pressure is highest at center/upper pulp, falling off smoothly toward edges
  const pressure = new Float32Array(numPixels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] <= 0) continue;

      const dx = (x - center.x) / radii.rx;
      const dy = (y - (center.y - radii.ry * 0.08)) / radii.ry;
      const distSq = dx * dx + dy * dy;

      // Smooth Gaussian contact profile
      let p = Math.exp(-distSq * 0.95);

      // Low frequency anatomical curvature
      const pNoise = noise.fbm(x * 0.01, y * 0.01, 2, 0.5, 2.0);
      p = Math.max(0.25, Math.min(1.0, p + pNoise * 0.12));

      pressure[idx] = p * mask[idx];
    }
  }

  // 2. Sweat Pores generation: placed along strong ridge peaks (rawRidges > 0.50)
  const poreField = new Uint8Array(numPixels);
  const poreStep = 4;
  for (let py = 10; py < height - 10; py += poreStep) {
    for (let px = 10; px < width - 10; px += poreStep) {
      const jx = px + rng.nextInt(-1, 1);
      const jy = py + rng.nextInt(-1, 1);
      const idx = jy * width + jx;

      if (mask[idx] > 0.4 && rawRidges[idx] > 0.50) {
        if (rng.next() < poreFrequency) {
          poreField[idx] = 1;
        }
      }
    }
  }

  // 3. Hairline Transverse Cuts & Incisions (fine dry skin cracks)
  const numHairlines = rng.nextInt(6, 12);
  const hairlines = [];
  for (let h = 0; h < numHairlines; h++) {
    hairlines.push({
      cy: center.y + rng.nextFloat(-radii.ry * 0.75, radii.ry * 0.75),
      cx: center.x + rng.nextFloat(-radii.rx * 0.65, radii.rx * 0.65),
      len: rng.nextFloat(16, 48),
      angle: rng.nextFloat(-0.45, 0.45)
    });
  }

  // Pre-generate micro-dropout map for incipient breaks
  const dropoutNoiseOffset = rng.nextFloat(0, 500);

  // 4. Physical Dermal Ridge Rendering with Slender Profile & Organic Texture
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const m = mask[idx];
      if (m <= 0.005) {
        processed[idx] = 0;
        continue;
      }

      const raw = rawRidges[idx]; // [-1, 1]
      const press = pressure[idx];

      // A. Flow-Aligned Papillae Noise (grain aligned along ridge direction theta)
      let grain = 0;
      if (theta) {
        const ang = theta[idx];
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const u = (x * cosA + y * sinA) * 0.55;
        const v = (-x * sinA + y * cosA) * 0.35;
        grain = noise.noise2D(u, v) * 0.22 + noise.noise2D(x * 0.95, y * 0.95) * 0.14;
      } else {
        grain = noise.noise2D(x * 0.5, y * 0.5) * 0.22 + noise.noise2D(x * 0.95, y * 0.95) * 0.14;
      }

      // B. Hairline Cut Attenuation (fine 1px cracks)
      let cutAtten = 1.0;
      for (let h = 0; h < hairlines.length; h++) {
        const hl = hairlines[h];
        const dx = x - hl.cx;
        const dy = y - hl.cy;
        const along = dx * Math.cos(hl.angle) + dy * Math.sin(hl.angle);
        const perp = -dx * Math.sin(hl.angle) + dy * Math.cos(hl.angle);
        if (Math.abs(along) < hl.len / 2 && Math.abs(perp) < 1.0) {
          cutAtten = Math.min(cutAtten, Math.abs(perp) / 1.0);
        }
      }

      // C. Random Micro-Breaks (incipient interruptions)
      const dNoise = noise.noise2D(x * 0.18 + dropoutNoiseOffset, y * 0.18);
      let breakFactor = 1.0;
      const dThresh = 0.70 - breakFrequency * 0.22;
      if (dNoise > dThresh) {
        breakFactor = Math.max(0.0, 1.0 - (dNoise - dThresh) * 6.0);
      }

      // D. Slender Ridge Profile (base threshold +0.08 leaves 55-60% dark valley)
      const baseThresh = 0.08;
      const threshold = baseThresh - (press - 0.5) * 0.16;

      let ridgeVal = 0;
      if (raw > threshold) {
        const u = (raw - threshold) / (1.0 - threshold + 0.001);
        // Clean, slender crest profile: ridge rises steeply to peak, valleys stay 0
        ridgeVal = Math.pow(Math.sin(u * Math.PI * 0.5), 1.35);
      }

      // Flow-aligned dermal grain modulation
      const grainFactor = Math.max(0.68, Math.min(1.05, 1.0 - grain * grainStrength * 0.75));
      ridgeVal *= grainFactor;

      // Apply imperfections
      ridgeVal *= cutAtten * breakFactor;

      // Apply pores (dark center indent)
      if (poreField[idx]) {
        ridgeVal *= 0.18;
      }

      // E. Natural Peripheral Dissolution (ridges break organically into specks at edges)
      if (m < 0.65) {
        const normM = m / 0.65;
        const scatter = (noise.noise2D(x * 0.45, y * 0.45) + 1.0) * 0.5;
        if (scatter > normM * 1.1) {
          ridgeVal *= Math.pow(normM, 2.2);
        } else {
          ridgeVal *= Math.pow(normM, 1.3);
        }
      }

      processed[idx] = Math.max(0.0, Math.min(1.0, ridgeVal * m));
    }
  }

  return {
    processed,
    pressure
  };
}
