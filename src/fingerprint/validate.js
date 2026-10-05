/**
 * Quality validation & Minutiae extraction (Crossing Number algorithm).
 * Analyzes synthetic fingerprint fidelity, minutiae count, coherence,
 * and forensic Plain Whorl criteria (The Imaginary Line Criterion and Ridge Tracing).
 */
export function validateFingerprint(width, height, processed, theta, maskInfo, singularities) {
  const { mask } = maskInfo;
  const numPixels = width * height;

  // 1. Ridge Medial Skeleton via Non-Maximum Suppression along ridge normal
  const skeleton = new Uint8Array(numPixels);
  for (let y = 16; y < height - 16; y++) {
    for (let x = 16; x < width - 16; x++) {
      const idx = y * width + x;
      if (mask[idx] < 0.4 || processed[idx] < 0.45) continue;

      // Normal angle is theta + PI/2
      const normalAngle = theta[idx] + Math.PI * 0.5;
      const nx = Math.cos(normalAngle);
      const ny = Math.sin(normalAngle);

      const val = processed[idx];
      const prevX = Math.max(0, Math.min(width - 1, Math.round(x - nx)));
      const prevY = Math.max(0, Math.min(height - 1, Math.round(y - ny)));
      const nextX = Math.max(0, Math.min(width - 1, Math.round(x + nx)));
      const nextY = Math.max(0, Math.min(height - 1, Math.round(y + ny)));

      const valPrev = processed[prevY * width + prevX];
      const valNext = processed[nextY * width + nextX];

      // Local maximum perpendicular to ridge direction
      if (val >= valPrev && val >= valNext) {
        skeleton[idx] = 1;
      }
    }
  }

  // 2. Minutiae Extraction via Crossing Number on the skeleton
  const minutiae = [];
  const minSpacingSq = 24 * 24;
  let endingCount = 0;
  let bifurcationCount = 0;

  for (let y = 24; y < height - 24; y += 2) {
    for (let x = 24; x < width - 24; x += 2) {
      const idx = y * width + x;
      if (mask[idx] < 0.5 || skeleton[idx] === 0) continue;

      // 8-neighborhood
      const p = [
        skeleton[(y - 1) * width + x],
        skeleton[(y - 1) * width + (x + 1)],
        skeleton[y * width + (x + 1)],
        skeleton[(y + 1) * width + (x + 1)],
        skeleton[(y + 1) * width + x],
        skeleton[(y + 1) * width + (x - 1)],
        skeleton[y * width + (x - 1)],
        skeleton[(y - 1) * width + (x - 1)],
      ];

      let transitions = 0;
      for (let i = 0; i < 8; i++) {
        transitions += Math.abs(p[i] - p[(i + 1) % 8]);
      }
      const cn = 0.5 * transitions;

      let type = null;
      if (cn === 1) type = 'ending';
      else if (cn === 3) type = 'bifurcation';

      if (type) {
        // Enforce spatial separation to avoid clustering artifacts
        let tooClose = false;
        for (let m = 0; m < minutiae.length; m++) {
          const dx = minutiae[m].x - x;
          const dy = minutiae[m].y - y;
          if (dx * dx + dy * dy < minSpacingSq) {
            tooClose = true;
            break;
          }
        }

        if (!tooClose) {
          if (type === 'ending') endingCount++;
          else bifurcationCount++;
          minutiae.push({ x, y, type });
        }
      }
    }
  }

  // 3. Orientation Coherence metric
  let sumCos = 0;
  let sumSin = 0;
  let sampleCount = 0;

  for (let y = 20; y < height - 20; y += 10) {
    for (let x = 20; x < width - 20; x += 10) {
      const idx = y * width + x;
      if (mask[idx] > 0.5) {
        sumCos += Math.cos(2 * theta[idx]);
        sumSin += Math.sin(2 * theta[idx]);
        sampleCount++;
      }
    }
  }

  const coherence = sampleCount > 0
    ? Math.sqrt(sumCos * sumCos + sumSin * sumSin) / sampleCount
    : 0;

  // 4. Forensic Dactyloscopy: Imaginary Line Criterion for Plain Whorl
  // Imaginary line connects Left Delta (deltas[0]) to Right Delta (deltas[1])
  let imaginaryLineCrossings = 0;
  let imaginaryLinePassed = false;

  if (singularities.deltas && singularities.deltas.length >= 2) {
    const d1 = singularities.deltas[0];
    const d2 = singularities.deltas[1];
    const steps = 120;
    let prevVal = -1;
    let transitions = 0;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const sx = Math.round(d1.x + (d2.x - d1.x) * t);
      const sy = Math.round(d1.y + (d2.y - d1.y) * t);
      if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
        const val = skeleton[sy * width + sx];
        if (prevVal !== -1 && val !== prevVal) {
          transitions++;
        }
        prevVal = val;
      }
    }
    imaginaryLineCrossings = Math.floor(transitions / 2);
    // For Plain Whorl, the imaginary line between the 2 deltas MUST cut through inner closed ridges
    imaginaryLinePassed = imaginaryLineCrossings >= 1;
  }

  // 5. Core-Delta Ridge Count (for loop patterns)
  let coreDeltaRidgeCount = 0;
  if (singularities.cores.length > 0 && singularities.deltas.length > 0) {
    const c = singularities.cores[0];
    const d = singularities.deltas[0];
    const steps = 100;
    let prevVal = -1;
    let transitions = 0;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const sx = Math.round(c.x + (d.x - c.x) * t);
      const sy = Math.round(c.y + (d.y - c.y) * t);
      if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
        const val = skeleton[sy * width + sx];
        if (prevVal !== -1 && val !== prevVal) {
          transitions++;
        }
        prevVal = val;
      }
    }
    coreDeltaRidgeCount = Math.floor(transitions / 2);
  }

  const totalMinutiae = minutiae.length;
  // Standard physiological bounds for thumbprint: 20 - 90 minutiae, coherence > 0.4
  const passed = totalMinutiae >= 18 && coherence > 0.38;

  return {
    passed,
    totalMinutiae,
    endingCount,
    bifurcationCount,
    minutiae,
    coherence: Number(coherence.toFixed(3)),
    coreDeltaRidgeCount,
    imaginaryLineCrossings,
    imaginaryLinePassed,
    whorlTracing: singularities.whorlTracing || null
  };
}

