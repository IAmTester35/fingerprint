/**
 * Spatially-variant Frequency and Ridge Period generator.
 * Computes T(x, y) (pixels per ridge) and f(x, y) = 1 / T(x, y).
 */
export function generateFrequencyField(
  width,
  height,
  singularities,
  maskInfo,
  params,
  noise,
) {
  const size = width * height;
  const period = new Float32Array(size);
  const frequency = new Float32Array(size);

  const basePeriod = params.ridgePeriod ?? 4.2;
  const { cores, deltas } = singularities;
  const { center, radii, rotAngle } = maskInfo;

  // Precompute trigonometric & constant values outside the pixel loop
  const sinA = Math.sin(rotAngle);
  const cosA = Math.cos(rotAngle);
  const invRy = 1.0 / radii.ry;

  const coreRadius = 48;
  const coreRadiusSq = coreRadius * coreRadius;
  const invCoreRadius = 1.0 / coreRadius;

  const deltaRadius = 42;
  const deltaRadiusSq = deltaRadius * deltaRadius;
  const invDeltaRadius = 1.0 / deltaRadius;

  const numCores = cores.length;
  const numDeltas = deltas.length;

  let idx = 0;
  for (let y = 0; y < height; y++) {
    const dy = y - center.y;
    const dyCosA = dy * cosA;
    const noiseY = y * 0.02;

    for (let x = 0; x < width; x++, idx++) {
      const dx = x - center.x;
      const ly = -dx * sinA + dyCosA;
      const normY = ly * invRy;

      let factor = 1.0;

      // 1. Distance to cores (widens ridges slightly around core recurve)
      for (let i = 0; i < numCores; i++) {
        const c = cores[i];
        const cdx = x - c.x;
        const cdy = y - c.y;
        const distSq = cdx * cdx + cdy * cdy;
        if (distSq < coreRadiusSq) {
          const w = 1.0 - Math.sqrt(distSq) * invCoreRadius;
          factor += w * 0.1;
        }
      }

      // 2. Distance to deltas (compresses ridges slightly near triradius)
      for (let i = 0; i < numDeltas; i++) {
        const d = deltas[i];
        const ddx = x - d.x;
        const ddy = y - d.y;
        const distSq = ddx * ddx + ddy * ddy;
        if (distSq < deltaRadiusSq) {
          const w = 1.0 - Math.sqrt(distSq) * invDeltaRadius;
          factor -= w * 0.08;
        }
      }

      // 3. Vertical gradient: lower base has slightly denser ridges
      if (normY > 0.1) {
        const drop = (normY - 0.1) * 0.1;
        factor -= drop < 0.08 ? drop : 0.08;
      }

      // 4. Subtle organic noise
      const n = noise.fbm(x * 0.02, noiseY, 2, 0.5, 2.0);
      factor += n * 0.03;

      // Clamp period between [3.2, 6.2]
      let T = basePeriod * factor;
      if (T < 3.2) T = 3.2;
      else if (T > 6.2) T = 6.2;

      period[idx] = T;
      frequency[idx] = 1.0 / T;
    }
  }

  return { period, frequency };
}
