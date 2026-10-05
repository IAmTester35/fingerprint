/**
 * Procedural thumbprint mask generator.
 * Creates an anatomical thumb impression mask using asymmetric superellipses,
 * lateral thumb slope (left vs right hand), joint cutoff, and organic border noise.
 */
export function generateThumbMask(width, height, params, rng, noise) {
  const mask = new Float32Array(width * height);
  const { hand = 'right', rotation = 0 } = params;

  // Anatomical thumb dimensions: elongated portrait aspect ratio (Y axis significantly longer than X axis)
  const cx = width * 0.5;
  const cy = height * 0.48;
  const rx = width * 0.25;  // 128px radius (256px wide)
  const ry = height * 0.41; // 210px radius (420px tall) -> Aspect ratio = 1.64:1

  // Slant angle: natural thumb impression leans outward
  // Right thumb leans slightly right-clockwise (+8° to +14°), left thumb counter-clockwise
  const baseTilt = (hand === 'right' ? 1 : -1) * (10 + (params.tilt || 0)) * (Math.PI / 180);
  const rotAngle = baseTilt + (rotation || 0) * (Math.PI / 180);
  const cosR = Math.cos(rotAngle);
  const sinR = Math.sin(rotAngle);

  // Joint crease cutoff (bottom of distal phalanx)
  const jointY = cy + ry * 0.88;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Transform to thumb-local rotated coordinate frame
      const dx = x - cx;
      const dy = y - cy;
      const lx = dx * cosR + dy * sinR;
      const ly = -dx * sinR + dy * cosR;

      // Asymmetric power for superellipse:
      // Apex (top, ly < 0) is rounder (n ≈ 2.2)
      // Base (bottom, ly > 0) is squarer/flatter (n ≈ 3.0)
      const n = ly < 0 ? 2.2 : 2.9;

      // Lateral asymmetry: thumb bulb is wider on the thenar/ulnar side
      const asymmetry = (hand === 'right' ? 1 : -1) * 0.08 * (ly / ry);
      const effectiveRx = rx * (1.0 + asymmetry);

      // Polar angle for boundary jitter
      const angle = Math.atan2(ly, lx);
      const borderNoise = noise.fbm(Math.cos(angle) * 2.0, Math.sin(angle) * 2.0, 3, 0.5, 2.0);
      const jitter = 1.0 + borderNoise * 0.04;

      // Normalized distance in superellipse
      const nx = Math.abs(lx / (effectiveRx * jitter));
      const ny = Math.abs(ly / (ry * jitter));
      const dist = Math.pow(Math.pow(nx, n) + Math.pow(ny, n), 1.0 / n);

      // Distal joint cutoff transition
      let jointFade = 1.0;
      if (ly > ry * 0.75) {
        jointFade = Math.max(0.0, 1.0 - (ly - ry * 0.75) / (ry * 0.16));
      }

      // Soft feathering edge: smoothstep around boundary (1.0)
      let val = 0.0;
      if (dist < 1.05) {
        val = 1.0 - smoothstep(0.88, 1.02, dist);
        val *= jointFade;
      }

      mask[y * width + x] = Math.max(0.0, Math.min(1.0, val));
    }
  }

  return {
    mask,
    center: { x: cx, y: cy },
    radii: { rx, ry },
    rotAngle
  };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}
