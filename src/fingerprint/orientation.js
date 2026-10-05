/**
 * Orientation Field generator based on the Sherlock-Monro Zero-Pole model
 * with Vizcaya-Gerhardt correction and distal arch blending.
 * Uses double-angle vector averaging (cos 2θ, sin 2θ) to prevent branch cut artifacts.
 * Supports Poincaré indices:
 * - Delta: +1/2
 * - Loop Core: -1/2
 * - Whorl Core: -1.0 (creates authentic concentric circles and spirals)
 */
export function generateOrientationField(width, height, singularities, maskInfo, params, noise) {
  const theta = new Float32Array(width * height);
  const { cores, deltas, pattern } = singularities;
  const { center, radii, rotAngle } = maskInfo;
  const { rx, ry } = radii;

  // Global thumb rotation offset
  const theta0 = rotAngle;
  const patternKey = (pattern === 'whorl' || pattern === 'plainWhorl') ? 'plainWhorl' : pattern;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // 1. Sherlock-Monro Zero-Pole Orientation in double-angle space
      // 2θ_ZP = 2θ0 + Σ [2 * index_k * atan2(dy, dx)]
      let angleSum2 = 0;

      // Deltas contribute index +0.5 -> multiplier +1 in 2θ
      for (let i = 0; i < deltas.length; i++) {
        const d = deltas[i];
        const dx = x - d.x;
        const dy = y - d.y;
        angleSum2 += Math.atan2(dy, dx);
      }

      // Cores: loopCore has index -0.5 (multiplier -1 in 2θ), whorlCore has index -1.0 (multiplier -2 in 2θ)
      for (let i = 0; i < cores.length; i++) {
        const c = cores[i];
        const dx = x - c.x;
        const dy = y - c.y;
        const mult = c.type === 'whorlCore' || c.index === -1.0 ? -2.0 : -1.0;
        angleSum2 += mult * Math.atan2(dy, dx);
      }

      const twoThetaZP = 2 * theta0 + angleSum2;

      // 2. Arch model for lower base and lateral margins
      // Transform to thumb-local space
      const dx = x - center.x;
      const dy = y - center.y;
      const lx = dx * Math.cos(rotAngle) + dy * Math.sin(rotAngle);
      const ly = -dx * Math.sin(rotAngle) + dy * Math.cos(rotAngle);

      // In local coordinates, arch is horizontal with downward curvature
      const normX = Math.max(-1.0, Math.min(1.0, lx / rx));
      const normY = (ly / ry);
      // Arch slope: steeper near the sides, flatter near the center and base
      const archSlope = -0.52 * Math.sin(normX * Math.PI * 0.5) * (1.0 - normY * 0.28);
      const thetaArch = rotAngle + Math.atan(archSlope);
      const twoThetaArch = 2 * thetaArch;

      // 3. Distance to closest singularity
      let minDistSq = Infinity;
      for (let i = 0; i < cores.length; i++) {
        const c = cores[i];
        const d2 = (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y);
        if (d2 < minDistSq) minDistSq = d2;
      }
      for (let i = 0; i < deltas.length; i++) {
        const d = deltas[i];
        const d2 = (x - d.x) * (x - d.x) + (y - d.y) * (y - d.y);
        if (d2 < minDistSq) minDistSq = d2;
      }

      const minDist = Math.sqrt(minDistSq);

      // Weight for blending: inside pattern area zero-pole dominates;
      // far away or at base, arch model blends in smoothly.
      let wZP = 1.0;
      if (patternKey === 'plainArch') {
        wZP = 0.0; // Plain arch is purely arch field
      } else {
        const distFade = 1.0 - smoothstep(45, rx * 0.92, minDist);
        const yFade = 1.0 - smoothstep(-0.1, 0.65, normY);
        wZP = Math.max(0.08, distFade * yFade);
      }

      // Double-angle vector blending:
      let vx = wZP * Math.cos(twoThetaZP) + (1 - wZP) * Math.cos(twoThetaArch);
      let vy = wZP * Math.sin(twoThetaZP) + (1 - wZP) * Math.sin(twoThetaArch);

      // 4. Low-frequency organic perturbation (FBM noise) applied via vector rotation (no branch cut)
      const noiseDamping = Math.min(1.0, minDist / 40.0);
      const organicNoise = noise.fbm(x * 0.007, y * 0.007, 3, 0.5, 2.0);
      const deltaTheta = organicNoise * 0.07 * noiseDamping;
      const cos2D = Math.cos(2 * deltaTheta);
      const sin2D = Math.sin(2 * deltaTheta);

      const vxRot = vx * cos2D - vy * sin2D;
      const vyRot = vx * sin2D + vy * cos2D;

      let blendedTheta = 0.5 * Math.atan2(vyRot, vxRot);

      // Keep in [0, π)
      if (blendedTheta < 0) blendedTheta += Math.PI;
      if (blendedTheta >= Math.PI) blendedTheta -= Math.PI;

      theta[idx] = blendedTheta;
    }
  }

  return theta;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

