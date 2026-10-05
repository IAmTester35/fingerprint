/**
 * Post-processing pipeline for photographic and forensic realism.
 * Simulates dermal dynamics:
 * - High-definition ridge-valley thresholding with sub-pixel antialiasing
 * - Microscopic sweat pores along central ridge peaks
 * - Fine transverse flexion creases
 * - Dermal contact pressure gradient
 */
export function postProcessRidges(width, height, rawRidges, maskInfo, params, rng, noise) {
  const { mask, center, radii } = maskInfo;
  const numPixels = width * height;
  const processed = new Float32Array(numPixels);

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
      p = Math.max(0.3, Math.min(1.0, p + pNoise * 0.12));

      pressure[idx] = p * mask[idx];
    }
  }

  // 2. Transverse Creases (fine joint lines and epidermal incisions)
  const creaseMask = new Float32Array(numPixels);
  creaseMask.fill(1.0);

  // Joint crease near the base
  const numCreases = rng.nextInt(1, 3);
  for (let c = 0; c < numCreases; c++) {
    const baseY = center.y + radii.ry * (0.70 + c * 0.09) + rng.nextFloat(-4, 4);
    const amp = rng.nextFloat(6, 14);
    const freq = 0.012 + rng.nextFloat(0, 0.004);
    const phase = rng.nextFloat(0, Math.PI * 2);

    for (let x = 0; x < width; x++) {
      const lineY = baseY + Math.sin(x * freq + phase) * amp;
      const startY = Math.max(0, Math.floor(lineY - 2));
      const endY = Math.min(height - 1, Math.ceil(lineY + 2));

      for (let y = startY; y <= endY; y++) {
        const d = Math.abs(y - lineY);
        if (d < 1.6) {
          const idx = y * width + x;
          const fade = d / 1.6;
          creaseMask[idx] = Math.min(creaseMask[idx], fade);
        }
      }
    }
  }

  // 3. Sweat Pores generation: placed strictly on strong ridge crests (rawRidges > 0.55)
  const poreMask = new Uint8Array(numPixels);
  const poreStep = 7;
  for (let y = 14; y < height - 14; y += poreStep) {
    for (let x = 14; x < width - 14; x += poreStep) {
      const jx = x + rng.nextInt(-2, 2);
      const jy = y + rng.nextInt(-2, 2);
      const idx = jy * width + jx;

      if (mask[idx] > 0.55 && rawRidges[idx] > 0.55) {
        if (rng.next() < 0.28) {
          // Draw 1px pore with subpixel falloff
          for (let py = -1; py <= 1; py++) {
            for (let px = -1; px <= 1; px++) {
              const r2 = px * px + py * py;
              if (r2 <= 2) {
                poreMask[(jy + py) * width + (jx + px)] = 1;
              }
            }
          }
        }
      }
    }
  }

  // 4. Crisp Forensic Dermal Thresholding & Synthesis
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const m = mask[idx];
      if (m <= 0) {
        processed[idx] = 0;
        continue;
      }

      let ridgeVal = rawRidges[idx];

      // Contact pressure modulates ridge width (ridge-valley duty cycle)
      const press = pressure[idx];
      const threshold = 0.0 - (press - 0.5) * 0.28;

      // Microscopic dermal ink boundary texture (applied to threshold, not blurred output)
      const inkJitter = noise.noise2D(x * 0.18, y * 0.18) * 0.04;
      const distFromThreshold = (ridgeVal - (threshold + inkJitter));

      // Crisp subpixel sigmoid edge transition (high sharpness with smooth 1px antialiasing)
      const edgeSharpness = 16.0;
      let v = 1.0 / (1.0 + Math.exp(-edgeSharpness * distFromThreshold));

      // Pore micro-indentation
      if (poreMask[idx]) {
        v *= 0.10;
      }

      // Crease interruption
      v *= creaseMask[idx];

      // Composite with mask
      processed[idx] = v * m;
    }
  }

  return {
    processed,
    pressure,
    creaseMask
  };
}

