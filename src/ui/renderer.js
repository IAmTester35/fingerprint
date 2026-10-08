/**
 * Canvas 2D Renderer for procedural and authentic fingerprints.
 * Implements authentic tactical surveillance monitor styling matching GTA V / ui_expected.jpg:
 * - Surveillance Slate Monitor background (#16212b)
 * - Soft silvery ash-white dermal ridges (#cad2da) with slate midtones (#788a98)
 * - Subtle CRT scanline modulation
 * - Seamless cutout masking for unsolved puzzle slots
 */

const PALETTE = {
  bgR: 22,
  bgG: 33,
  bgB: 43,     // Deep surveillance slate #16212b
  midR: 120,
  midG: 138,
  midB: 152,  // Dermal slate midtone #788a98
  ridgeR: 202,
  ridgeG: 210,
  ridgeB: 218 // Authentic silvery ash-white #cad2da
};

function writeBiometricPixel(data, pIdx, val, isCutout, style, scanline) {
  const { bgR, bgG, bgB, midR, midG, midB, ridgeR, ridgeG, ridgeB } = PALETTE;

  if (isCutout || val <= 0.008) {
    // Valleys and cutout slots stay pure dark surveillance slate
    data[pIdx + 0] = Math.round(bgR * scanline);
    data[pIdx + 1] = Math.round(bgG * scanline);
    data[pIdx + 2] = Math.round(bgB * scanline);
    data[pIdx + 3] = 255;
    return;
  }

  if (style === 'tactical' || style === 'cyber') {
    let r, g, b;
    if (val < 0.40) {
      const t = val / 0.40;
      r = bgR + (midR - bgR) * t;
      g = bgG + (midG - bgG) * t;
      b = bgB + (midB - bgB) * t;
    } else {
      const t = (val - 0.40) / 0.60;
      r = midR + (ridgeR - midR) * t;
      g = midG + (ridgeG - midG) * t;
      b = midB + (ridgeB - midB) * t;
    }

    data[pIdx + 0] = Math.min(255, Math.round(r * scanline));
    data[pIdx + 1] = Math.min(255, Math.round(g * scanline));
    data[pIdx + 2] = Math.min(255, Math.round(b * scanline));
    data[pIdx + 3] = 255;
  } else {
    // Forensic inked print on off-white paper
    const ink = Math.round((1.0 - val) * 230 + 15);
    data[pIdx + 0] = ink;
    data[pIdx + 1] = ink;
    data[pIdx + 2] = ink;
    data[pIdx + 3] = Math.round(val * 240);
  }
}

export function renderFingerprint(canvas, result, options = {}) {
  const { width, height, processed, puzzle } = result;
  const {
    style = 'tactical',
    showFlow = false,
    showSingularities = false,
    showMinutiae = false,
    solvedSlots = new Set()
  } = options;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Background - deep tactical surveillance dark matching ui_expected.jpg
  ctx.fillStyle = `rgb(${PALETTE.bgR}, ${PALETTE.bgG}, ${PALETTE.bgB})`;
  ctx.fillRect(0, 0, width, height);

  // Build cutout mask lookup for unsolved target pieces
  const cutoutMask = new Uint8Array(width * height);
  if (puzzle && puzzle.realPieces) {
    puzzle.realPieces.forEach(p => {
      if (!solvedSlots.has(p.orderIndex)) {
        const px = Math.max(0, p.x);
        const py = Math.max(0, p.y);
        const pw = Math.min(width - px, p.size);
        const ph = Math.min(height - py, p.size);
        for (let y = py; y < py + ph; y++) {
          for (let x = px; x < px + pw; x++) {
            cutoutMask[y * width + x] = 1;
          }
        }
      }
    });
  }

  // Draw continuous biometric ridge lines with cutouts & authentic color grading
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    const scanline = (y % 2 === 0) ? 0.96 : 1.0;
    const rowOffset = y * width;

    for (let x = 0; x < width; x++) {
      const i = rowOffset + x;
      const pIdx = i * 4;
      const isCutout = cutoutMask[i] === 1;
      const val = processed[i]; // [0, 1]
      writeBiometricPixel(data, pIdx, val, isCutout, style, scanline);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Optional Debug Overlays
  if (showSingularities && result.singularities) {
    result.singularities.cores.forEach(c => {
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  if (showFlow && result.theta) {
    const step = 24;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
    for (let y = step; y < height - step; y += step) {
      for (let x = step; x < width - step; x += step) {
        const idx = y * width + x;
        if (result.maskInfo && result.maskInfo.mask[idx] < 0.3) continue;
        const angle = result.theta[idx];
        const len = 6;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(angle) * len, y - Math.sin(angle) * len);
        ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
        ctx.stroke();
      }
    }
  }

  if (showMinutiae && result.quality && result.quality.minutiae) {
    result.quality.minutiae.forEach(m => {
      ctx.fillStyle = m.type === 'ending' ? '#00e676' : '#ff3366';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

/**
 * Render individual fingerprint patch to target canvas (for puzzle piece cards)
 */
export function renderPatchToCanvas(targetCanvas, data, size, theme = 'tactical') {
  targetCanvas.width = size;
  targetCanvas.height = size;
  const ctx = targetCanvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const px = imgData.data;

  for (let y = 0; y < size; y++) {
    const scanline = (y % 2 === 0) ? 0.96 : 1.0;
    const rowOffset = y * size;

    for (let x = 0; x < size; x++) {
      const i = rowOffset + x;
      const val = data[i];
      const pIdx = i * 4;
      writeBiometricPixel(px, pIdx, val, false, theme, scanline);
    }
  }
  ctx.putImageData(imgData, 0, 0);
}
