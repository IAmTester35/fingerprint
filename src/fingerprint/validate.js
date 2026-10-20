/**
 * Quality validation & Minutiae extraction (Crossing Number algorithm).
 * Analyzes synthetic fingerprint fidelity, minutiae count, local coherence,
 * and forensic Plain Whorl criteria (The Imaginary Line Criterion and Ridge Counting).
 */
export function validateFingerprint(
  width,
  height,
  processed,
  theta,
  maskInfo,
  singularities,
) {
  const { mask } = maskInfo;
  const numPixels = width * height;

  // 1. Directional Ridge Crest Detection (Strict 1-pixel NMS along normal)
  const skeleton = new Uint8Array(numPixels);
  for (let y = 16; y < height - 16; y++) {
    const rowOffset = y * width;
    for (let x = 16; x < width - 16; x++) {
      const idx = rowOffset + x;
      if (mask[idx] < 0.45 || processed[idx] < 0.4) continue;

      // Normal vector perpendicular to ridge (theta + PI/2): cos(θ+π/2) = -sin(θ), sin(θ+π/2) = cos(θ)
      const ang = theta[idx];
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);

      // Quantize normal step to 8-connected neighbor (-1, 0, 1)
      const dx = Math.round(nx);
      const dy = Math.round(ny);
      const stepOffset = dy * width + dx;

      const val = processed[idx];
      const valPrev = processed[idx - stepOffset];
      const valNext = processed[idx + stepOffset];

      // Asymmetric tie-breaking (val > valPrev && val >= valNext) prevents 2-pixel thick flat plateaus!
      if (val > valPrev && val >= valNext) {
        skeleton[idx] = 1;
      }
    }
  }

  // 2. Minutiae Extraction via Rutovitz Crossing Number (Scan every pixel, not += 2!)
  const minutiae = [];
  const minSpacingSq = 12 * 12;
  let endingCount = 0;
  let bifurcationCount = 0;

  for (let y = 24; y < height - 24; y++) {
    const rowOffset = y * width;
    for (let x = 24; x < width - 24; x++) {
      const idx = rowOffset + x;
      if (skeleton[idx] === 0 || mask[idx] < 0.55) continue;

      // 8-neighborhood clockwise around (x, y)
      const p0 = skeleton[idx - width];
      const p1 = skeleton[idx - width + 1];
      const p2 = skeleton[idx + 1];
      const p3 = skeleton[idx + width + 1];
      const p4 = skeleton[idx + width];
      const p5 = skeleton[idx + width - 1];
      const p6 = skeleton[idx - 1];
      const p7 = skeleton[idx - width - 1];

      // Isolated pixel check
      const neighborSum = p0 + p1 + p2 + p3 + p4 + p5 + p6 + p7;
      if (neighborSum === 0) continue;

      const transitions =
        Math.abs(p0 - p1) +
        Math.abs(p1 - p2) +
        Math.abs(p2 - p3) +
        Math.abs(p3 - p4) +
        Math.abs(p4 - p5) +
        Math.abs(p5 - p6) +
        Math.abs(p6 - p7) +
        Math.abs(p7 - p0);

      const cn = transitions >> 1; // 0.5 * transitions

      let type = null;
      // cn === 1 with neighborSum === 1 is a true ridge ending
      if (cn === 1 && neighborSum === 1) type = "ending";
      // cn === 3 with neighborSum >= 3 is a true ridge bifurcation
      else if (cn === 3 && neighborSum >= 3) type = "bifurcation";

      if (type) {
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
          if (type === "ending") endingCount++;
          else bifurcationCount++;
          minutiae.push({ x, y, type, angle: theta[idx] });
        }
      }
    }
  }

  // 3. Local Orientation Coherence metric (Evaluates smoothness within local 9x9 patches)
  let totalLocalCoherence = 0;
  let patchCount = 0;

  for (let y = 24; y < height - 24; y += 12) {
    for (let x = 24; x < width - 24; x += 12) {
      const centerIdx = y * width + x;
      if (mask[centerIdx] > 0.5) {
        let sumCos = 0;
        let sumSin = 0;
        // Sample 3x3 grid around patch center (step 4px)
        for (let dy = -4; dy <= 4; dy += 4) {
          for (let dx = -4; dx <= 4; dx += 4) {
            const twoAng = 2.0 * theta[(y + dy) * width + (x + dx)];
            sumCos += Math.cos(twoAng);
            sumSin += Math.sin(twoAng);
          }
        }
        totalLocalCoherence +=
          Math.sqrt(sumCos * sumCos + sumSin * sumSin) / 9.0;
        patchCount++;
      }
    }
  }

  const coherence = patchCount > 0 ? totalLocalCoherence / patchCount : 0;

  // Helper: Accurate pixel-by-pixel ridge counter along a line segment
  function countRidgesAlongLine(p1, p2) {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(1, Math.ceil(dist)); // 1 step per pixel prevents skipping ridges!
    let inRidge = false;
    let ridgeCount = 0;

    // Exclude 3 pixels right at the singularity endpoints
    const startStep = Math.min(3, Math.floor(steps * 0.1));
    const endStep = Math.max(startStep, steps - startStep);

    for (let i = startStep; i <= endStep; i++) {
      const t = i / steps;
      const sx = Math.round(p1.x + (p2.x - p1.x) * t);
      const sy = Math.round(p1.y + (p2.y - p1.y) * t);
      if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
        const isRidge = processed[sy * width + sx] > 0.35;
        if (isRidge && !inRidge) {
          ridgeCount++;
          inRidge = true;
        } else if (!isRidge && inRidge) {
          inRidge = false;
        }
      }
    }
    return ridgeCount;
  }

  // 4. Forensic Dactyloscopy: Imaginary Line Criterion for Plain Whorl
  let imaginaryLineCrossings = 0;
  let imaginaryLinePassed = false;

  if (singularities.deltas && singularities.deltas.length >= 2) {
    imaginaryLineCrossings = countRidgesAlongLine(
      singularities.deltas[0],
      singularities.deltas[1],
    );
    imaginaryLinePassed = imaginaryLineCrossings >= 1;
  }

  // 5. Core-Delta Ridge Count (for loop & whorl patterns)
  let coreDeltaRidgeCount = 0;
  if (singularities.cores.length > 0 && singularities.deltas.length > 0) {
    coreDeltaRidgeCount = countRidgesAlongLine(
      singularities.cores[0],
      singularities.deltas[0],
    );
  }

  const totalMinutiae = minutiae.length;
  const passed = totalMinutiae >= 18 && coherence > 0.75;

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
    whorlTracing: singularities.whorlTracing || null,
  };
}
