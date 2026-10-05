import fs from 'fs';
import zlib from 'zlib';
import { generateFullFingerprint } from '../src/fingerprint/pipeline.js';

// Simple PNG encoder in pure JS
function createPNG(width, height, rgbaBuffer) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // non-interlaced

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Scanlines with filter byte 0
  const stride = width * 4;
  const rawScanlines = Buffer.alloc(height * (stride + 1));
  let dstPos = 0;
  for (let y = 0; y < height; y++) {
    rawScanlines[dstPos++] = 0; // Filter 0 (None)
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

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return c ^ 0xffffffff;
}

// Generate a test fingerprint using our pipeline
const result = generateFullFingerprint({
  width: 512,
  height: 512,
  seed: 428913,
  pattern: 'ulnarLoop',
  ridgePeriod: 7.6,
  iterations: 10
});

console.log('Fingerprint generated, timings:', result.timings);

// Render with current renderer logic
const { width, height, processed } = result;
const rgba = Buffer.alloc(width * height * 4);

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const idx = y * width + x;
    const pIdx = idx * 4;
    const val = processed[idx];

    if (val > 0.08) {
      const norm = Math.min(1.0, (val - 0.08) / 0.92);
      const intensity = Math.round(100 + norm * 155);
      rgba[pIdx + 0] = Math.min(255, intensity - 10);
      rgba[pIdx + 1] = Math.min(255, intensity + 15);
      rgba[pIdx + 2] = Math.min(255, intensity + 30);
      rgba[pIdx + 3] = 255;
    } else {
      rgba[pIdx + 0] = 16;
      rgba[pIdx + 1] = 22;
      rgba[pIdx + 2] = 32;
      rgba[pIdx + 3] = 255;
    }
  }
}

const pngBuf = createPNG(width, height, rgba);
fs.writeFileSync('scratch/current_render.png', pngBuf);
console.log('Saved scratch/current_render.png');
