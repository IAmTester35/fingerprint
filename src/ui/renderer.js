/**
 * Canvas 2D Renderer for procedural and authentic fingerprints.
 * Features a 4-stop high-contrast Biometric Color Grading LUT, radial scanner
 * backlight vignette, encrypted micro-grid cutout slots, and full forensic overlays.
 */

export const THEMES = {
  // Default: High-Contrast Tactical Biometric Ice-Cyan (Crisp, deep & luminous)
  tactical: {
    bg: [7, 13, 20], // Deep abyssal navy #070d14
    edge: [18, 58, 84], // Deep ocean glow at ridge base #123a54
    mid: [72, 168, 200], // Crisp tactical cyan-slate #48a8c8
    peak: [232, 248, 255], // Luminous ice-white ridge crest #e8f8ff
    cutout: [4, 8, 13], // Darker recessed slot background
    accent: "#00f2fe",
  },
  // Classic GTA V / Night-Vision Phosphor Emerald
  emerald: {
    bg: [5, 14, 10], // Deepest forest black #050e0a
    edge: [14, 68, 42], // Dark emerald #0e442a
    mid: [46, 184, 114], // Phosphor green #2eb872
    peak: [220, 255, 236], // Bright mint-white crest #dcffec
    cutout: [3, 9, 6],
    accent: "#00e676",
  },
  // Thermal / Gold-Amber Forensic Scanner
  amber: {
    bg: [16, 11, 6], // Deep obsidian warm #100b06
    edge: [78, 42, 12], // Bronze shadow #4e2a0c
    mid: [215, 135, 45], // Tactical amber #d7872d
    peak: [255, 244, 218], // Warm ivory crest #fff4da
    cutout: [10, 7, 4],
    accent: "#ffab00",
  },
  // Traditional Forensic Rolled Ink on Dactyloscopic Card
  forensic: {
    bg: [242, 239, 232], // Warm archival paper #f2efe8
    edge: [165, 160, 152], // Outer ink feathering
    mid: [65, 62, 58], // Charcoal ink body
    peak: [18, 18, 20], // Deep dense carbon ink #121214
    cutout: [224, 220, 212],
    accent: "#d50000",
  },
};

// Precompute 256-level 4-stop color LUTs for instant rendering & rich tonal curves
const COLOR_LUTS = {};
for (const [name, p] of Object.entries(THEMES)) {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const val = i / 255;
    let r, g, b;

    if (val < 0.25) {
      // Base transition: bg -> edge glow
      const t = val / 0.25;
      r = p.bg[0] + (p.edge[0] - p.bg[0]) * t;
      g = p.bg[1] + (p.edge[1] - p.bg[1]) * t;
      b = p.bg[2] + (p.edge[2] - p.bg[2]) * t;
    } else if (val < 0.7) {
      // Body transition: edge -> midtone
      const t = (val - 0.25) / 0.45;
      r = p.edge[0] + (p.mid[0] - p.edge[0]) * t;
      g = p.edge[1] + (p.mid[1] - p.edge[1]) * t;
      b = p.edge[2] + (p.mid[2] - p.edge[2]) * t;
    } else {
      // Specular crest highlight: midtone -> luminous peak
      const t = (val - 0.7) / 0.3;
      r = p.mid[0] + (p.peak[0] - p.mid[0]) * t;
      g = p.mid[1] + (p.peak[1] - p.mid[1]) * t;
      b = p.mid[2] + (p.peak[2] - p.mid[2]) * t;
    }

    const idx = i * 3;
    lut[idx] = Math.round(r);
    lut[idx + 1] = Math.round(g);
    lut[idx + 2] = Math.round(b);
  }
  COLOR_LUTS[name] = lut;
}

export function renderFingerprint(canvas, result, options = {}) {
  const { width, height, processed, puzzle } = result;
  const {
    style = "tactical",
    showFlow = false,
    showSingularities = false,
    showMinutiae = false,
    solvedSlots = new Set(),
  } = options;

  const themeKey = THEMES[style] ? style : "tactical";
  const theme = THEMES[themeKey];
  const lut = COLOR_LUTS[themeKey];
  const isForensicPaper = themeKey === "forensic";

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Build cutout mask lookup for unsolved target pieces
  const cutoutMask = new Uint8Array(width * height);
  if (puzzle && puzzle.realPieces) {
    for (let i = 0; i < puzzle.realPieces.length; i++) {
      const p = puzzle.realPieces[i];
      if (!solvedSlots.has(p.orderIndex)) {
        const px = Math.max(0, p.x);
        const py = Math.max(0, p.y);
        const endX = Math.min(width, px + p.size);
        const endY = Math.min(height, py + p.size);
        for (let y = py; y < endY; y++) {
          const rowOffset = y * width;
          for (let x = px; x < endX; x++) {
            cutoutMask[rowOffset + x] = 1;
          }
        }
      }
    }
  }

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const invMaxRadiusSq = 1.0 / (cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    // Subtle CRT scanline modulation on dark themes
    const scanline = !isForensicPaper && (y & 1) === 0 ? 0.93 : 1.0;
    const rowOffset = y * width;
    const dy = y - cy;
    const dySq = dy * dy;

    for (let x = 0; x < width; x++) {
      const i = rowOffset + x;
      const pIdx = i << 2;

      // 1. Unsolved Puzzle Cutout Slot (Recessed dark well with subtle tech dot-matrix)
      if (cutoutMask[i] === 1) {
        const isGridDot = (x & 3) === 0 && (y & 3) === 0;
        const boost = isGridDot ? 12 : 0;
        data[pIdx] = Math.min(255, theme.cutout[0] + boost);
        data[pIdx + 1] = Math.min(255, theme.cutout[1] + boost);
        data[pIdx + 2] = Math.min(255, theme.cutout[2] + boost);
        data[pIdx + 3] = 255;
        continue;
      }

      const val = processed[i]; // [0, 1]

      // 2. Background & Valleys (with subtle radial scanner backlight glow)
      if (val <= 0.008) {
        const dx = x - cx;
        const normDistSq = (dx * dx + dySq) * invMaxRadiusSq;
        // Center has a subtle ambient scanner glow, edges vignette darker
        const glow = isForensicPaper
          ? 0
          : Math.max(0, 1.0 - normDistSq * 1.35) * 9.0;

        data[pIdx] = Math.min(
          255,
          Math.round((theme.bg[0] + glow * 0.4) * scanline),
        );
        data[pIdx + 1] = Math.min(
          255,
          Math.round((theme.bg[1] + glow * 0.8) * scanline),
        );
        data[pIdx + 2] = Math.min(
          255,
          Math.round((theme.bg[2] + glow * 1.1) * scanline),
        );
        data[pIdx + 3] = 255;
        continue;
      }

      // 3. Biometric Ridge Pixel via 4-stop LUT
      const lutIdx = Math.min(255, Math.max(0, (val * 255 + 0.5) | 0)) * 3;
      data[pIdx] = (lut[lutIdx] * scanline) | 0;
      data[pIdx + 1] = (lut[lutIdx + 1] * scanline) | 0;
      data[pIdx + 2] = (lut[lutIdx + 2] * scanline) | 0;
      data[pIdx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Optional Debug Overlays
  if (showFlow && result.theta) {
    const step = 20;
    const len = 6;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0, 242, 254, 0.45)";
    ctx.beginPath();
    for (let y = step; y < height - step; y += step) {
      for (let x = step; x < width - step; x += step) {
        const idx = y * width + x;
        if (result.maskInfo && result.maskInfo.mask[idx] < 0.3) continue;
        const angle = result.theta[idx];
        const dx = Math.cos(angle) * len;
        const dy = Math.sin(angle) * len;
        ctx.moveTo(x - dx, y - dy);
        ctx.lineTo(x + dx, y + dy);
      }
    }
    ctx.stroke();
  }

  if (showMinutiae && result.quality && result.quality.minutiae) {
    const minutiae = result.quality.minutiae;

    // Batch draw endings (emerald green)
    ctx.fillStyle = "#00e676";
    ctx.beginPath();
    for (let i = 0; i < minutiae.length; i++) {
      const m = minutiae[i];
      if (m.type === "ending") {
        ctx.moveTo(m.x + 2.5, m.y);
        ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    // Batch draw bifurcations (crimson pink)
    ctx.fillStyle = "#ff2a6d";
    ctx.beginPath();
    for (let i = 0; i < minutiae.length; i++) {
      const m = minutiae[i];
      if (m.type === "bifurcation") {
        ctx.moveTo(m.x + 2.5, m.y);
        ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }

  if (showSingularities && result.singularities) {
    // Draw Cores (Cyan Target Circles)
    ctx.strokeStyle = "#00f2fe";
    ctx.lineWidth = 2;
    result.singularities.cores.forEach((c) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c.x, c.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#00f2fe";
      ctx.fill();
    });

    // Draw Deltas (Amber Warning Triangles - previously missing!)
    if (result.singularities.deltas) {
      ctx.strokeStyle = "#ffab00";
      ctx.lineWidth = 2;
      const r = 9;
      result.singularities.deltas.forEach((d) => {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y - r);
        ctx.lineTo(d.x + r * 0.866, d.y + r * 0.5);
        ctx.lineTo(d.x - r * 0.866, d.y + r * 0.5);
        ctx.closePath();
        ctx.stroke();
      });
    }
  }
}

/**
 * Render individual fingerprint patch to target canvas (for puzzle piece cards)
 */
export function renderPatchToCanvas(
  targetCanvas,
  data,
  size,
  themeName = "tactical",
) {
  const themeKey = THEMES[themeName] ? themeName : "tactical";
  const lut = COLOR_LUTS[themeKey];
  const isForensicPaper = themeKey === "forensic";

  targetCanvas.width = size;
  targetCanvas.height = size;
  const ctx = targetCanvas.getContext("2d");
  const imgData = ctx.createImageData(size, size);
  const px = imgData.data;

  for (let y = 0; y < size; y++) {
    const scanline = !isForensicPaper && (y & 1) === 0 ? 0.93 : 1.0;
    const rowOffset = y * size;

    for (let x = 0; x < size; x++) {
      const i = rowOffset + x;
      const val = data[i];
      const pIdx = i << 2;

      const lutIdx = Math.min(255, Math.max(0, (val * 255 + 0.5) | 0)) * 3;
      px[pIdx] = (lut[lutIdx] * scanline) | 0;
      px[pIdx + 1] = (lut[lutIdx + 1] * scanline) | 0;
      px[pIdx + 2] = (lut[lutIdx + 2] * scanline) | 0;
      px[pIdx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
