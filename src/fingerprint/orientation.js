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

  const patternKey = (pattern === 'whorl' || pattern === 'plainWhorl') ? 'plainWhorl' : pattern;
  const cosR = Math.cos(rotAngle);
  const sinR = Math.sin(rotAngle);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // 1. Anatomical Arch baseline model (transverse curvature over distal phalanx)
      const dx = x - center.x;
      const dy = y - center.y;
      const lx = dx * cosR + dy * sinR;
      const ly = -dx * sinR + dy * cosR;

      const normX = Math.max(-1.0, Math.min(1.0, lx / rx));
      const normY = ly / ry;

      // Flatter arch at the base flexure crease, crowning curve over the apex
      const archK = Math.max(0.12, 0.46 * (1.0 - normY * 0.35));
      const thetaArchLocal = Math.atan(archK * Math.sin(normX * Math.PI * 0.5));
      const thetaArch = rotAngle + thetaArchLocal;
      const twoThetaArch = 2 * thetaArch;

      // 2. Zero-Pole Singularity Orientation (Cappelli & Sherlock-Monro model)
      // Poincaré indices in 2θ space:
      // Loop Core (+1/2 index) -> +1 * atan2
      // Whorl Core (+1.0 index) -> +2 * atan2
      // Delta (-1/2 index)      -> -1 * atan2
      let angleSum2 = 0;

      for (let i = 0; i < deltas.length; i++) {
        const d = deltas[i];
        angleSum2 -= Math.atan2(y - d.y, x - d.x);
      }

      for (let i = 0; i < cores.length; i++) {
        const c = cores[i];
        let cdx = x - c.x;
        let cdy = y - c.y;

        // Elliptical whorl core scaling to match elongated thumb anatomy
        const isWhorl = c.type === 'whorlCore' || c.index === 1.0 || c.index === -1.0;
        if (isWhorl) {
          const clx = cdx * cosR + cdy * sinR;
          const cly = -cdx * sinR + cdy * cosR;
          const scaledCly = cly / 1.15;
          cdx = clx * cosR - scaledCly * sinR;
          cdy = clx * sinR + scaledCly * cosR;
        }

        const mult = isWhorl ? 2.0 : 1.0;
        angleSum2 += mult * Math.atan2(cdy, cdx);
      }

      const twoThetaZP = twoThetaArch + angleSum2;

      // 3. Distance to singularities for natural boundary transition
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

      let wZP = 1.0;
      if (patternKey === 'plainArch') {
        wZP = 0.0;
      } else {
        const distFade = 1.0 - smoothstep(50, rx * 0.95, minDist);
        const yFade = 1.0 - smoothstep(0.05, 0.70, normY);
        wZP = Math.max(0.10, distFade * yFade);
      }

      // Double-angle vector blending:
      let vx = wZP * Math.cos(twoThetaZP) + (1 - wZP) * Math.cos(twoThetaArch);
      let vy = wZP * Math.sin(twoThetaZP) + (1 - wZP) * Math.sin(twoThetaArch);

      // 4. Subtle organic papillary perturbation via double-angle rotation
      const noiseDamping = Math.min(1.0, minDist / 35.0);
      const organicNoise = noise.fbm(x * 0.008, y * 0.008, 3, 0.5, 2.0);
      const deltaTheta = organicNoise * 0.05 * noiseDamping;
      const cos2D = Math.cos(2 * deltaTheta);
      const sin2D = Math.sin(2 * deltaTheta);

      const vxRot = vx * cos2D - vy * sin2D;
      const vyRot = vx * sin2D + vy * cos2D;

      let blendedTheta = 0.5 * Math.atan2(vyRot, vxRot);

      // Normalize into [0, π)
      while (blendedTheta < 0) blendedTheta += Math.PI;
      while (blendedTheta >= Math.PI) blendedTheta -= Math.PI;

      theta[idx] = blendedTheta;
    }
  }

  return theta;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

