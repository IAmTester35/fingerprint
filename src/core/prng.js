/**
 * Fast, seedable 32-bit PRNG (sfc32) with MurmurHash3 seed mixer.
 * Note: Not cryptographically secure (Do not use for security/passwords).
 */
export function createRng(seedInput) {
  const seed =
    typeof seedInput === "number" && Number.isFinite(seedInput)
      ? seedInput | 0
      : hashString(String(seedInput ?? "fingerprint-1337"));

  // MurmurHash3 32-bit finalizer (fmix32)
  function mash(v) {
    let h = v ^ 0xdeadbeef;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }

  let a = mash(seed);
  let b = mash((seed + 1013904223) | 0);
  let c = mash((seed + 1664525) | 0);
  let d = mash((seed + 214013) | 0);

  // sfc32 generator
  function next() {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (((c << 21) | (c >>> 11)) + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  // Warm-up state (trộn đều trạng thái ban đầu)
  for (let i = 0; i < 15; i++) next();

  return {
    next,
    nextInt(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    nextFloat(min, max) {
      return min + next() * (max - min);
    },
    nextGaussian(mean = 0, stdDev = 1) {
      let u = 0;
      while (u === 0) u = next(); // Tránh Math.log(0)
      const v = next();
      const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
      return mean + z * stdDev;
    },
    choice(arr) {
      if (!arr || arr.length === 0) return undefined;
      return arr[Math.floor(next() * arr.length)];
    },
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
