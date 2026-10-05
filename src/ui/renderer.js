/**
 * Canvas 2D Renderer for procedural fingerprints.
 * Implements the authentic forensic tactical styling shown in ui_expected.jpg.
 */

export function renderFingerprint(canvas, result, options = {}) {
  const { width, height, processed } = result;
  const {
    style = 'tactical',
    showFlow = false,
    showSingularities = false,
    showMinutiae = false
  } = options;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Background - deep tactical surveillance dark matching ui_expected.jpg
  ctx.fillStyle = '#101620';
  ctx.fillRect(0, 0, width, height);

  // Mask out cut-out regions from the master fingerprint canvas
  const cutoutMask = new Uint8Array(width * height);
  if (result.puzzle && result.puzzle.realPieces) {
    result.puzzle.realPieces.forEach(p => {
      for (let dy = 0; dy < p.size; dy++) {
        for (let dx = 0; dx < p.size; dx++) {
          const py = p.y + dy;
          const px = p.x + dx;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            cutoutMask[py * width + px] = 1;
          }
        }
      }
    });
  }

  // Draw Ridges with realistic biometric palette matching ui_expected.jpg
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let i = 0; i < width * height; i++) {
    const pIdx = i * 4;
    if (cutoutMask[i] === 1) {
      // Missing cut-out fragment: render blank dark background
      data[pIdx + 0] = 16;
      data[pIdx + 1] = 22;
      data[pIdx + 2] = 32;
      data[pIdx + 3] = 255;
      continue;
    }

    const val = processed[i]; // [0, 1]

    if (style === 'tactical' || style === 'cyber') {
      // Authentic silver-white / steel forensic biometric ridges matching ui_expected.jpg
      data[pIdx + 0] = Math.round(val * 210 + 16); // R
      data[pIdx + 1] = Math.round(val * 220 + 22); // G
      data[pIdx + 2] = Math.round(val * 230 + 32); // B
      data[pIdx + 3] = 255;
    } else {
      // Inked print on off-white paper
      const ink = Math.round((1.0 - val) * 230 + 15);
      data[pIdx + 0] = ink;
      data[pIdx + 1] = ink;
      data[pIdx + 2] = ink;
      data[pIdx + 3] = Math.round(val * 240);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Optional Debug Overlays (only if enabled via config drawer)
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

  for (let i = 0; i < size * size; i++) {
    const val = data[i];
    const pIdx = i * 4;

    if (theme === 'tactical' || theme === 'cyber') {
      px[pIdx + 0] = Math.round(val * 210 + 16);
      px[pIdx + 1] = Math.round(val * 220 + 22);
      px[pIdx + 2] = Math.round(val * 230 + 32);
      px[pIdx + 3] = 255;
    } else {
      const ink = Math.round((1.0 - val) * 230 + 15);
      px[pIdx + 0] = ink;
      px[pIdx + 1] = ink;
      px[pIdx + 2] = ink;
      px[pIdx + 3] = Math.round(val * 240);
    }
  }
  ctx.putImageData(imgData, 0, 0);
}
