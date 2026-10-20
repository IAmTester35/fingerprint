import { smoothstep } from "./mask.js";

/**
 * Orientation Field generator based on the Sherlock-Monro Zero-Pole model
 * with Vizcaya-Gerhardt correction and distal arch blending.
 */
export function generateOrientationField(
  width,
  height,
  singularities,
  maskInfo,
  params,
  noise,
) {
  const theta = new Float32Array(width * height);
  const { cores, deltas, pattern } = singularities;
  const { center, radii, rotAngle } = maskInfo;
  const { rx, ry } = radii;

  const spiralTwist = singularities.spiralTwist ?? 0.0;
  const coreAspect = singularities.coreAspect ?? 1.15;
  const baseArchK = singularities.archCurvature ?? 0.46;

  const noiseOffsetX = (cores[0]?.x || 123) * 1.37;
  const noiseOffsetY = (cores[0]?.y || 456) * 1.73;

  const isPlainArch = pattern === "plainArch";
  const cosR = Math.cos(rotAngle);
  const sinR = Math.sin(rotAngle);
  const invRx = 1.0 / rx;
  const invRy = 1.0 / ry;
  const fadeRadius = rx * 0.95;

  // Pre-classify cores to avoid string checks inside the pixel loop
  const numCores = cores.length;
  const coreIsWhorl = new Uint8Array(numCores);
  for (let i = 0; i < numCores; i++) {
    const c = cores[i];
    coreIsWhorl[i] =
      c.type === "whorlCore" || c.index === 1.0 || c.index === -1.0 ? 1 : 0;
  }
  const numDeltas = deltas.length;

  let idx = 0;
  for (let y = 0; y < height; y++) {
    const dy = y - center.y;
    const dySinR = dy * sinR;
    const dyCosR = dy * cosR;
    const noiseY = y * 0.009 + noiseOffsetY;

    for (let x = 0; x < width; x++, idx++) {
      // 1. Anatomical Arch baseline model
      const dx = x - center.x;
      const lx = dx * cosR + dySinR;
      const ly = -dx * sinR + dyCosR;

      const normX = Math.max(-1.0, Math.min(1.0, lx * invRx));
      const normY = ly * invRy;

      const archK = Math.max(0.12, baseArchK * (1.0 - normY * 0.35));
      const thetaArchLocal = Math.atan(
        archK * Math.sin(normX * (Math.PI * 0.5)),
      );
      const twoThetaArch = 2.0 * (rotAngle + thetaArchLocal);

      const cosArch = Math.cos(twoThetaArch);
      const sinArch = Math.sin(twoThetaArch);

      let vx = cosArch;
      let vy = sinArch;
      let minDist = 1000.0;

      // 2 & 3. Zero-Pole Singularity Orientation + Min Distance (Combined & Complex-multiplied)
      if (!isPlainArch && (numCores > 0 || numDeltas > 0)) {
        // Start with unit complex number (1 + 0i) representing e^(i * angleSum2)
        let zx = 1.0;
        let zy = 0.0;
        let minDistSq = Infinity;

        for (let i = 0; i < numDeltas; i++) {
          const d = deltas[i];
          const ddx = x - d.x;
          const ddy = y - d.y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < minDistSq) minDistSq = d2;

          if (d2 > 1e-6) {
            const invR = 1.0 / Math.sqrt(d2);
            const ux = ddx * invR;
            const uy = -ddy * invR; // Conjugate for -atan2
            const nextZx = zx * ux - zy * uy;
            zy = zx * uy + zy * ux;
            zx = nextZx;
          }
        }

        for (let i = 0; i < numCores; i++) {
          const c = cores[i];
          const rawDx = x - c.x;
          const rawDy = y - c.y;
          const rawD2 = rawDx * rawDx + rawDy * rawDy;
          if (rawD2 < minDistSq) minDistSq = rawD2;

          let cdx = rawDx;
          let cdy = rawDy;

          if (coreIsWhorl[i]) {
            const clx = cdx * cosR + cdy * sinR;
            const cly = (-cdx * sinR + cdy * cosR) / coreAspect;
            cdx = clx * cosR - cly * sinR;
            cdy = clx * sinR + cly * cosR;

            // Whorl (+2 * atan2): e^(i * 2θ) = ((cdx + i*cdy) / r)^2 -> No sqrt needed!
            const c2 = cdx * cdx + cdy * cdy;
            if (c2 > 1e-6) {
              const invC2 = 1.0 / c2;
              const ux = (cdx * cdx - cdy * cdy) * invC2;
              const uy = 2.0 * cdx * cdy * invC2;
              const nextZx = zx * ux - zy * uy;
              zy = zx * uy + zy * ux;
              zx = nextZx;
            }
          } else {
            // Loop (+1 * atan2)
            if (rawD2 > 1e-6) {
              const invR = 1.0 / Math.sqrt(rawD2);
              const ux = cdx * invR;
              const uy = cdy * invR;
              const nextZx = zx * ux - zy * uy;
              zy = zx * uy + zy * ux;
              zx = nextZx;
            }
          }
        }

        minDist = Math.sqrt(minDistSq);

        // Rotate twoThetaArch vector by angleSum2: (cosArch + i*sinArch) * (zx + i*zy)
        const cosZP = cosArch * zx - sinArch * zy;
        const sinZP = cosArch * zy + sinArch * zx;

        // Tạo hiệu ứng xoắn ốc tự nhiên quanh tâm Core
        const twistAngle = spiralTwist * Math.exp(-minDist / (rx * 0.65));
        const cosT = Math.cos(twistAngle);
        const sinT = Math.sin(twistAngle);
        const twistedCosZP = cosZP * cosT - sinZP * sinT;
        const twistedSinZP = cosZP * sinT + sinZP * cosT;

        const distFade = 1.0 - smoothstep(50, fadeRadius, minDist);
        const yFade = 1.0 - smoothstep(0.05, 0.7, normY);
        const wZP = Math.max(0.1, distFade * yFade);

        vx = wZP * twistedCosZP + (1.0 - wZP) * cosArch;
        vy = wZP * twistedSinZP + (1.0 - wZP) * sinArch;
      }

      // 4. Subtle organic papillary perturbation (Small-angle Taylor approximation)
      const noiseDamping = minDist < 35.0 ? minDist / 35.0 : 1.0;
      const organicNoise = noise.fbm(
        x * 0.009 + noiseOffsetX,
        noiseY,
        3,
        0.5,
        2.0,
      );
      const twoDeltaTheta = organicNoise * 0.18 * noiseDamping; // 2 * deltaTheta (biên độ 0.09)

      const cos2D = 1.0 - 0.5 * twoDeltaTheta * twoDeltaTheta;
      const sin2D = twoDeltaTheta;

      const vxRot = vx * cos2D - vy * sin2D;
      const vyRot = vx * sin2D + vy * cos2D;

      let blendedTheta = 0.5 * Math.atan2(vyRot, vxRot);
      if (blendedTheta < 0) blendedTheta += Math.PI;

      theta[idx] = blendedTheta;
    }
  }

  return theta;
}
