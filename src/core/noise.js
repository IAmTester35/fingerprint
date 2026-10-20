/**
 * 2D Simplex Noise generator initialized with custom PRNG.
 */
export function createNoise2D(rng) {
  const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
  const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

  // Mảng phẳng 1D chứa 12 vector 2D chuẩn (tránh nested array lookup)
  const grad2 = new Int8Array([
    1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0,
    -1,
  ]);

  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = rng.nextInt(0, i);
    const temp = p[i];
    p[i] = p[j];
    p[j] = temp;
  }

  const perm = new Uint8Array(512);
  // Lưu sẵn index đã nhân 2 để tra cứu thẳng vào mảng phẳng grad2
  const permGradIndex2 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permGradIndex2[i] = (perm[i] % 12) * 2;
  }

  function noise2D(xin, yin) {
    let n0 = 0,
      n1 = 0,
      n2 = 0;

    // Skew the input space to determine which simplex cell we're in
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    // Determine which simplex we are in
    let i1, j1;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    // Calculate the contribution from the three corners
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      const gi0 = permGradIndex2[ii + perm[jj]];
      n0 = t0 * t0 * (grad2[gi0] * x0 + grad2[gi0 + 1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      const gi1 = permGradIndex2[ii + i1 + perm[jj + j1]];
      n1 = t1 * t1 * (grad2[gi1] * x1 + grad2[gi1 + 1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      const gi2 = permGradIndex2[ii + 1 + perm[jj + 1]];
      n2 = t2 * t2 * (grad2[gi2] * x2 + grad2[gi2 + 1] * y2);
    }

    // Scale the return value to fit nicely into [-1, 1]
    return 70.0 * (n0 + n1 + n2);
  }

  function fbm(x, y, octaves = 3, persistence = 0.5, lacunarity = 2.0) {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    for (let o = 0; o < octaves; o++) {
      total += noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return maxValue === 0 ? 0 : total / maxValue;
  }

  return { noise2D, fbm };
}
