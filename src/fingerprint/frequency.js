/**
 * Spatially-variant Frequency and Ridge Period generator.
 * Computes T(x, y) (pixels per ridge) and f(x, y) = 1 / T(x, y).
 */
export function generateFrequencyField(width, height, singularities, maskInfo, params, noise) {
  const period = new Float32Array(width * height);
  const frequency = new Float32Array(width * height);

  const basePeriod = params.ridgePeriod || 8.5;
  const { cores, deltas } = singularities;
  const { center, radii, rotAngle } = maskInfo;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // Local coordinates
      const dx = x - center.x;
      const dy = y - center.y;
      const ly = -dx * Math.sin(rotAngle) + dy * Math.cos(rotAngle);
      const normY = ly / radii.ry;

      let factor = 1.0;

      // 1. Distance to cores (widens ridges slightly above core)
      for (let i = 0; i < cores.length; i++) {
        const c = cores[i];
        const dist = Math.hypot(x - c.x, y - c.y);
        if (dist < 75) {
          const w = (1.0 - dist / 75);
          factor += w * 0.12;
        }
      }

      // 2. Distance to deltas (compresses ridges slightly near triradius)
      for (let i = 0; i < deltas.length; i++) {
        const d = deltas[i];
        const dist = Math.hypot(x - d.x, y - d.y);
        if (dist < 65) {
          const w = (1.0 - dist / 65);
          factor -= w * 0.10;
        }
      }

      // 3. Vertical gradient: lower base has denser ridges
      if (normY > 0.1) {
        factor -= Math.min(0.12, (normY - 0.1) * 0.15);
      }

      // 4. Subtle organic noise
      const n = noise.fbm(x * 0.015, y * 0.015, 2, 0.5, 2.0);
      factor += n * 0.04;

      const T = Math.max(6.0, Math.min(12.0, basePeriod * factor));
      period[idx] = T;
      frequency[idx] = 1.0 / T;
    }
  }

  return { period, frequency };
}
