import fs from 'fs';
import zlib from 'zlib';
import { generateFullFingerprint } from '../src/fingerprint/pipeline.js';
import { createNoise2D } from '../src/core/noise.js';
import { createRng } from '../src/core/prng.js';

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

export function synthesizeRealisticDermalLayer(result, seed = 428913) {
  const { width, height, rawRidges, maskInfo, pressure, theta } = result;
  const { mask, center, radii } = maskInfo;
  const rng = createRng(seed + 999);
  const noise = createNoise2D(rng);

  // Exact GTA V / Surveillance Slate Monitor Palette
  const bgR = 24, bgG = 35, bgB = 44; // #18232c - surveillance slate background
  const ridgeR = 202, ridgeG = 210, ridgeB = 218; // #cad2da - authentic silvery ash-white
  const midR = 120, midG = 138, midB = 152; // #788a98 - dermal midtones

  const rgba = Buffer.alloc(width * height * 4);

  // Generate organic pore locations on strong ridges
  const poreField = new Uint8Array(width * height);
  const poreStep = 6;
  for (let py = 12; py < height - 12; py += poreStep) {
    for (let px = 12; px < width - 12; px += poreStep) {
      const jx = px + rng.nextInt(-2, 2);
      const jy = py + rng.nextInt(-2, 2);
      const idx = jy * width + jx;
      if (mask[idx] > 0.4 && rawRidges[idx] > 0.45 && rng.next() < 0.35) {
        poreField[idx] = 1;
        poreField[idx + 1] = 1;
        poreField[(jy + 1) * width + jx] = 1;
      }
    }
  }

  // Pre-generate micro-breaks (fine transverse hairline cuts)
  const numHairlines = 8;
  const hairlines = [];
  for (let h = 0; h < numHairlines; h++) {
    hairlines.push({
      cy: center.y + rng.nextFloat(-radii.ry * 0.7, radii.ry * 0.7),
      cx: center.x + rng.nextFloat(-radii.rx * 0.5, radii.rx * 0.5),
      len: rng.nextFloat(15, 45),
      angle: rng.nextFloat(-0.4, 0.4)
    });
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const pIdx = idx * 4;

      const m = mask[idx];
      if (m <= 0.005) {
        // Background with subtle surveillance scanline
        const scanline = (y % 2 === 0) ? 0.96 : 1.0;
        rgba[pIdx + 0] = Math.round(bgR * scanline);
        rgba[pIdx + 1] = Math.round(bgG * scanline);
        rgba[pIdx + 2] = Math.round(bgB * scanline);
        rgba[pIdx + 3] = 255;
        continue;
      }

      const raw = rawRidges[idx]; // [-1, 1]
      const press = pressure[idx]; // [0, 1]
      const ang = theta[idx];
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);

      // 1. Flow-Aligned Papillae Noise (grain aligned along the ridge direction)
      const u = (x * cosA + y * sinA) * 0.45;
      const v = (-x * sinA + y * cosA) * 0.25;
      const grainAlongRidge = noise.noise2D(u, v) * 0.22;
      const microGrain = noise.noise2D(x * 0.8, y * 0.8) * 0.12;
      const papillaeNoise = grainAlongRidge + microGrain;

      // 2. Micro-breaks & Incipient Gaps
      // Irregular transverse cracks
      let crackAtten = 1.0;
      for (let h = 0; h < hairlines.length; h++) {
        const hl = hairlines[h];
        const dx = x - hl.cx;
        const dy = y - hl.cy;
        const along = dx * Math.cos(hl.angle) + dy * Math.sin(hl.angle);
        const perp = -dx * Math.sin(hl.angle) + dy * Math.cos(hl.angle);
        if (Math.abs(along) < hl.len / 2 && Math.abs(perp) < 1.2) {
          crackAtten = Math.min(crackAtten, Math.abs(perp) / 1.2);
        }
      }

      // Random micro-dropout (dermal pore / dry skin void)
      const dropoutNoise = noise.noise2D(x * 0.12, y * 0.12);
      const dropout = (dropoutNoise > 0.58) ? Math.max(0.0, 1.0 - (dropoutNoise - 0.58) * 5.0) : 1.0;

      // 3. Dynamic Threshold based on pressure & papillae
      // Pressure increases ridge width in center, decreases at edges
      const threshold = -0.10 - (press - 0.5) * 0.40 + papillaeNoise * 0.25;

      let ridgeIntensity = 0;
      if (raw > threshold) {
        const delta = raw - threshold;
        // Non-linear response modeling optical ridge reflection
        ridgeIntensity = Math.min(1.0, Math.pow(delta / (1.0 - threshold + 0.001), 0.72));
      }

      // Apply imperfections
      ridgeIntensity *= crackAtten * dropout;

      // Apply pores
      if (poreField[idx]) {
        ridgeIntensity *= 0.18;
      }

      // 4. Natural Peripheral Dissolution (Mép vân tay loang hạt tự nhiên)
      // When mask m is falling off towards the periphery, break ridges into scattered specks
      if (m < 0.65) {
        const normM = m / 0.65;
        const scatterGate = (noise.noise2D(x * 0.45, y * 0.45) + 1.0) * 0.5;
        if (scatterGate > normM * 1.05) {
          ridgeIntensity *= Math.pow(normM, 1.8);
        } else {
          ridgeIntensity *= Math.pow(normM, 1.2);
        }
      }

      // 5. Palette Transfer: Deep Slate -> Midtone Slate-Grey -> Silvery Ash-White
      let r, g, b;
      if (ridgeIntensity < 0.5) {
        const t = ridgeIntensity / 0.5;
        r = bgR + (midR - bgR) * t;
        g = bgG + (midG - bgG) * t;
        b = bgB + (midB - bgB) * t;
      } else {
        const t = (ridgeIntensity - 0.5) / 0.5;
        r = midR + (ridgeR - midR) * t;
        g = midG + (ridgeG - midG) * t;
        b = midB + (ridgeB - midB) * t;
      }

      // CRT Scanline emulation (subtle dark alternation on even/odd rows)
      const scanline = (y % 2 === 0) ? 0.96 : 1.0;

      rgba[pIdx + 0] = Math.round(r * scanline);
      rgba[pIdx + 1] = Math.round(g * scanline);
      rgba[pIdx + 2] = Math.round(b * scanline);
      rgba[pIdx + 3] = 255;
    }
  }

  return rgba;
}

// Test with 3 different patterns: Whorl, Ulnar Loop, Plain Arch
const patterns = ['whorl', 'ulnarLoop', 'plainArch'];
for (const p of patterns) {
  const fp = generateFullFingerprint({
    width: 512,
    height: 512,
    seed: 428913,
    pattern: p,
    ridgePeriod: 7.2,
    iterations: 10
  });

  const rgba = synthesizeRealisticDermalLayer(fp, 428913);
  const png = createPNG(512, 512, rgba);
  fs.writeFileSync('scratch/realistic_' + p + '.png', png);
  console.log('Saved scratch/realistic_' + p + '.png');
}
