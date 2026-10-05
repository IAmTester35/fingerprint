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

  // Draw Ridges with authentic stippled dot-matrix biometric texture matching ui_expected.jpg
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const pIdx = i * 4;
      const val = processed[i]; // [0, 1]

      if (style === 'tactical' || style === 'cyber') {
        if (val > 0.12) {
          // Stippled dot noise factor for GTA V fingerprint aesthetic
          const hash = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1.0;
          const stippleThreshold = 0.88 - val * 0.78;

          if (hash > stippleThreshold) {
            // Bright silver-white stipple pixel
            const intensity = 170 + Math.round(hash * 70);
            data[pIdx + 0] = Math.min(255, intensity + 10); // R
            data[pIdx + 1] = Math.min(255, intensity + 20); // G
            data[pIdx + 2] = Math.min(255, intensity + 30); // B
            data[pIdx + 3] = 255;
          } else {
            // Background deep navy dark
            data[pIdx + 0] = 16;
            data[pIdx + 1] = 22;
            data[pIdx + 2] = 32;
            data[pIdx + 3] = 255;
          }
        } else {
          // Background deep navy dark
          data[pIdx + 0] = 16;
          data[pIdx + 1] = 22;
          data[pIdx + 2] = 32;
          data[pIdx + 3] = 255;
        }
      } else {
        // Inked print on off-white paper
        const ink = Math.round((1.0 - val) * 230 + 15);
        data[pIdx + 0] = ink;
        data[pIdx + 1] = ink;
        data[pIdx + 2] = ink;
        data[pIdx + 3] = Math.round(val * 240);
      }
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

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const val = data[i];
      const pIdx = i * 4;

      if (theme === 'tactical' || theme === 'cyber') {
        if (val > 0.12) {
          const hash = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1.0;
          const stippleThreshold = 0.88 - val * 0.78;

          if (hash > stippleThreshold) {
            const intensity = 170 + Math.round(hash * 70);
            px[pIdx + 0] = Math.min(255, intensity + 10);
            px[pIdx + 1] = Math.min(255, intensity + 20);
            px[pIdx + 2] = Math.min(255, intensity + 30);
            px[pIdx + 3] = 255;
          } else {
            px[pIdx + 0] = 16;
            px[pIdx + 1] = 22;
            px[pIdx + 2] = 32;
            px[pIdx + 3] = 255;
          }
        } else {
          px[pIdx + 0] = 16;
          px[pIdx + 1] = 22;
          px[pIdx + 2] = 32;
          px[pIdx + 3] = 255;
        }
      } else {
        const ink = Math.round((1.0 - val) * 230 + 15);
        px[pIdx + 0] = ink;
        px[pIdx + 1] = ink;
        px[pIdx + 2] = ink;
        px[pIdx + 3] = Math.round(val * 240);
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}
