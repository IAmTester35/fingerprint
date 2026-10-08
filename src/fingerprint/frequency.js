/**
 * Spatially-variant Frequency and Ridge Period generator.
 * Computes T(x, y) (pixels per ridge) and f(x, y) = 1 / T(x, y).
 */
export function generateFrequencyField(width, height, singularities, maskInfo, params, noise) {
  const period = new Float32Array(width * height);
  const frequency = new Float32Array(width * height);

  const basePeriod = params.ridgePeriod || 4.2;
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

      // 1. Distance to cores (widens ridges slightly around core recurve)
      for (let i = 0; i < cores.length; i++) {
        const c = cores[i];
        const dist = Math.hypot(x - c.x, y - c.y);
        if (dist < 48) {
          const w = (1.0 - dist / 48);
          factor += w * 0.10;
        }
      }

      // 2. Distance to deltas (compresses ridges slightly near triradius)
      for (let i = 0; i < deltas.length; i++) {
        const d = deltas[i];
        const dist = Math.hypot(x - d.x, y - d.y);
        if (dist < 42) {
          const w = (1.0 - dist / 42);
          factor -= w * 0.08;
        }
      }

      // 3. Vertical gradient: lower base has slightly denser ridges
      if (normY > 0.1) {
        factor -= Math.min(0.08, (normY - 0.1) * 0.10);
      }

      // 4. Subtle organic noise
      const n = noise.fbm(x * 0.02, y * 0.02, 2, 0.5, 2.0);
      factor += n * 0.03;

      const T = Math.max(3.2, Math.min(6.2, basePeriod * factor));
      period[idx] = T;
      frequency[idx] = 1.0 / T;
    }
  }

  return { period, frequency };
}
