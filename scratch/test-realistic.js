import fs from 'fs';
import zlib from 'zlib';
import { generateFullFingerprint } from '../src/fingerprint/pipeline.js';
import { createNoise2D } from '../src/core/noise.js';
import { createRng } from '../src/core/prng.js';

// PNG encoder helper
function createPNG(width, height, rgbaBuffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const stride = width * 4;
  const rawScanlines = Buffer.alloc(height * (stride + 1));
  let dstPos = 0;
  for (let y = 0; y < height; y++) {
    rawScanlines[dstPos++] = 0;
    const srcStart = y * stride;
    rgbaBuffer.copy(rawScanlines, dstPos, srcStart, srcStart + stride);
    dstPos += stride;
  }
  const compressed = zlib.deflateSync(rawScanlines, { level: 6 });
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(12 + len);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc >>> 0, 8 + len);
  return buf;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

// Generate realistic fingerprint with imperfect dermal ridges
function renderRealisticFingerprint(result, seed = 428913) {
  const { width, height, rawRidges, maskInfo, pressure, theta } = result;
  const { mask, center, radii } = maskInfo;
  const rng = createRng(seed + 777);
  const noise = createNoise2D(rng);

  // Background color sampled directly from 2.png / 3.png / ui_expected.jpg:
  const bgR = 30, bgG = 44, bgB = 53; // Deep Tactical Surveillance Slate #1e2c35

  // Ridge Peak color sampled from 2.png:
  // soft silvery-slate ash white
  const ridgeR = 196, ridgeG = 203, ridgeB = 210;

  const rgba = Buffer.alloc(width * height * 4);

  // Pre-generate micro-break noise field for imperfect ridge continuity
  const breakMap = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      // High frequency simplex noise for random ridge breaks
      const n1 = noise.noise2D(x * 0.08, y * 0.08);
      const n2 = noise.noise2D(x * 0.22, y * 0.22);
      breakMap[idx] = n1 * 0.7 + n2 * 0.3;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const pIdx = idx * 4;

      const m = mask[idx];
      if (m <= 0.01) {
        // Pure background with subtle surveillance sensor noise
        const sensorNoise = (noise.noise2D(x * 0.5, y * 0.5) * 1.5) | 0;
        rgba[pIdx + 0] = Math.max(0, Math.min(255, bgR + sensorNoise));
        rgba[pIdx + 1] = Math.max(0, Math.min(255, bgG + sensorNoise));
        rgba[pIdx + 2] = Math.max(0, Math.min(255, bgB + sensorNoise));
        rgba[pIdx + 3] = 255;
        continue;
      }

      const raw = rawRidges[idx]; // [-1, 1]
      const press = pressure[idx]; // [0, 1]

      // 1. Organic Dermal Papillae Texture:
      // Real ridge contact creates micro-stippling along the ridge spine
      const papillaeNoise = noise.noise2D(x * 0.35, y * 0.35) * 0.25
                          + noise.noise2D(x * 0.85, y * 0.85) * 0.15;

      // 2. Micro-breaks:
      // Random breaks where ridge is interrupted (simulating dry contact / skin creases)
      const isBreak = breakMap[idx] > 0.52;
      const breakFactor = isBreak ? Math.max(0.0, 1.0 - (breakMap[idx] - 0.52) * 4.0) : 1.0;

      // 3. Dynamic Threshold based on contact pressure:
      // Higher pressure in center makes ridges wider and more connected;
      // Lower pressure near edges makes ridges thinner and broken into dots
      const threshold = -0.15 - (press - 0.5) * 0.35 + papillaeNoise * 0.3;
      
      // Ridge intensity with soft organic profile (instead of hard sigmoid clip)
      let ridgeIntensity = 0;
      if (raw > threshold) {
        // Normalized elevation above valley
        const delta = raw - threshold;
        // Soft non-linear curve matching optical reflection
        ridgeIntensity = Math.min(1.0, Math.pow(delta / (1.0 - threshold + 0.001), 0.7));
      }

      // Apply micro-breaks
      ridgeIntensity *= breakFactor;

      // 4. Peripheral Dissolution (Mép vân tay loang hạt tự nhiên):
      // As mask falls below 0.6, ridges break down into granular specks rather than solid lines
      if (m < 0.65) {
        const falloff = m / 0.65;
        const grainGate = (noise.noise2D(x * 0.6, y * 0.6) + 1.0) * 0.5; // [0, 1]
        if (grainGate > falloff * 1.1) {
          ridgeIntensity *= Math.pow(falloff, 1.5);
        } else {
          ridgeIntensity *= falloff;
        }
      }

      // 5. Sweat Pores:
      // Tiny voids along strong ridge peaks
      const poreFreq = 0.14;
      const px = Math.sin(x * poreFreq + 1.2) * Math.cos(y * poreFreq + 0.8);
      if (px > 0.88 && ridgeIntensity > 0.5) {
        ridgeIntensity *= 0.25; // Pore indentation
      }

      // 6. Color Composition:
      // Blend smoothly from deep slate background to soft silvery ash-white
      const r = bgR + (ridgeR - bgR) * ridgeIntensity;
      const g = bgG + (ridgeG - bgG) * ridgeIntensity;
      const b = bgB + (ridgeB - bgB) * ridgeIntensity;

      // Subtle surveillance monitor scanline
      const scanline = (y % 2 === 0) ? 0.97 : 1.0;

      rgba[pIdx + 0] = Math.round(r * scanline);
      rgba[pIdx + 1] = Math.round(g * scanline);
      rgba[pIdx + 2] = Math.round(b * scanline);
      rgba[pIdx + 3] = 255;
    }
  }

  return rgba;
}

// Run test
const fp = generateFullFingerprint({
  width: 512,
  height: 512,
  seed: 428913,
  pattern: 'whorl',
  ridgePeriod: 7.2,
  iterations: 10
});

const realisticRgba = renderRealisticFingerprint(fp, 428913);
const png = createPNG(512, 512, realisticRgba);
fs.writeFileSync('scratch/realistic_render.png', png);
console.log('Saved scratch/realistic_render.png');
