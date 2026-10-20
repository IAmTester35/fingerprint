/**
 * Procedural thumbprint mask generator.
 * Creates an anatomical thumb impression mask using asymmetric superellipses,
 * lateral thumb slope (left vs right hand), joint cutoff, and organic border noise.
 */
export function generateThumbMask(width, height, params, rng, noise) {
  const mask = new Float32Array(width * height);
  const { hand = "right", rotation = 0 } = params;
  const handSign = hand === "right" ? 1 : -1;

  // Anatomical thumb dimensions: natural thumb impression aspect ratio (~1.29:1)
  const cx = width * 0.5;
  const cy = height * 0.49;
  const rx = params.rx || width * 0.275;
  const ry = params.ry || rx * (params.aspectRatio || 1.29);
  const invRy = 1.0 / ry;

  // Slant angle: natural thumb impression leans outward
  const baseTilt = handSign * (10 + (params.tilt || 0)) * (Math.PI / 180);
  const rotAngle = baseTilt + (rotation || 0) * (Math.PI / 180);
  const cosR = Math.cos(rotAngle);
  const sinR = Math.sin(rotAngle);

  const jointStart = ry * 0.75;
  const invJointSpan = 1.0 / (ry * 0.16);

  let idx = 0;
  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    const dySinR = dy * sinR;
    const dyCosR = dy * cosR;

    for (let x = 0; x < width; x++, idx++) {
      const dx = x - cx;
      const lx = dx * cosR + dySinR;
      const ly = -dx * sinR + dyCosR;

      // Early exit 1: Phía dưới nếp gấp đốt ngón tay hoàn toàn (jointFade <= 0)
      if (ly >= jointStart + ry * 0.16) {
        mask[idx] = 0.0;
        continue;
      }

      // Lateral asymmetry (bất đối xứng trái/phải) + slight vertical taper (thon dần lên đỉnh)
      const lateralBulge = (lx >= 0 ? handSign : -handSign) * 0.05;
      const verticalTaper = 0.04 * (ly * invRy);
      const effectiveRx = rx * (1.0 + lateralBulge + verticalTaper);

      const rawNx = Math.abs(lx / effectiveRx);
      const rawNy = Math.abs(ly * invRy);

      // Early exit 2: Ngoài vùng biên chắc chắn bằng 0 (kể cả khi jitter đạt max +4%)
      if (rawNx > 1.15 || rawNy > 1.15) {
        mask[idx] = 0.0;
        continue;
      }

      // Distal joint cutoff transition
      let jointFade = 1.0;
      if (ly > jointStart) {
        jointFade = 1.0 - (ly - jointStart) * invJointSpan;
      }

      // Early exit 3: Sâu bên trong tâm ngón tay chắc chắn bằng 1.0 * jointFade
      // (Với n >= 2.2, nếu cả rawNx và rawNy đều < 0.55 thì dist chắc chắn < 0.88)
      if (rawNx < 0.55 && rawNy < 0.55) {
        mask[idx] = jointFade;
        continue;
      }

      // Chỉ những pixel gần vùng rìa mới cần tính toán fbm noise và hàm mũ Math.pow
      const rLen = Math.sqrt(lx * lx + ly * ly) || 1.0;
      const cosA = lx / rLen; // Tương đương Math.cos(Math.atan2(ly, lx))
      const sinA = ly / rLen; // Tương đương Math.sin(Math.atan2(ly, lx))

      const borderNoise = noise.fbm(cosA * 2.0, sinA * 2.0, 3, 0.5, 2.0);
      const invJitter = 1.0 / (1.0 + borderNoise * 0.04);

      const nx = rawNx * invJitter;
      const ny = rawNy * invJitter;
      const n = ly < 0 ? 2.2 : 2.9;
      const dist = Math.pow(Math.pow(nx, n) + Math.pow(ny, n), 1.0 / n);

      let val = 0.0;
      if (dist < 1.02) {
        val = (1.0 - smoothstep(0.88, 1.02, dist)) * jointFade;
      }

      mask[idx] = val;
    }
  }

  return {
    mask,
    center: { x: cx, y: cy },
    radii: { rx, ry },
    rotAngle,
  };
}

export function smoothstep(edge0, edge1, x) {
  if (x <= edge0) return 0.0;
  if (x >= edge1) return 1.0;
  const t = (x - edge0) / (edge1 - edge0);
  return t * t * (3.0 - 2.0 * t);
}
