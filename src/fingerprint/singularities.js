/**
 * Singular Points (Cores and Deltas) generator according to dactyloscopic anatomy.
 * Handles hand orientation (Left vs Right thumb) and Henry pattern classification.
 */
export function placeSingularities(width, height, maskInfo, params, rng) {
  const {
    hand = "right",
    pattern = "plainWhorl",
    whorlTracing = "random",
  } = params;
  const { center, radii, rotAngle } = maskInfo;
  const { rx, ry } = radii;

  const cores = [];
  const deltas = [];

  // Hand sign multiplier: for right hand ulnar side is +x, for left hand ulnar side is -x
  const ulnarSide = hand === "right" ? 1 : -1;
  const cosR = Math.cos(rotAngle);
  const sinR = Math.sin(rotAngle);

  // Local helper to place and rotate a point into canvas space
  function toCanvas(normX, normY, type = "core", index = -0.5) {
    const lx = normX * rx;
    const ly = normY * ry;
    return {
      x: center.x + lx * cosR - ly * sinR,
      y: center.y + lx * sinR + ly * cosR,
      lx,
      ly,
      normX,
      normY,
      type,
      index, // Poincaré index: -0.5 for loop core, -1.0 for whorl core, +0.5 for delta
    };
  }

  const jx = () => rng.nextFloat(-0.075, 0.075);
  const jy = () => rng.nextFloat(-0.085, 0.085);

  // Normalized pattern selector
  const patternKey =
    pattern === "whorl" || pattern === "plainWhorl" ? "plainWhorl" : pattern;

  let resolvedTracing = whorlTracing;
  if (
    resolvedTracing === "random" ||
    !["inner", "meet", "outer"].includes(resolvedTracing)
  ) {
    const r = rng.next();
    resolvedTracing = r < 0.35 ? "meet" : r < 0.68 ? "inner" : "outer";
  }

  switch (patternKey) {
    case "plainWhorl": {
      // 1 Core at geometric center of innermost circle/spiral (Poincaré index -1.0)
      const coreX = 0.0 + jx();
      const coreY = -0.02 + jy();
      cores.push(toCanvas(coreX, coreY, "whorlCore", -1.0));

      // 2 Deltas positioned at left (-x) and right (+x) type-line divergence points.
      // Use shared base Y + guaranteed offset so jitter never invalidates I/M/O tracing criteria
      const baseDeltaY = 0.18 + rng.nextFloat(-0.015, 0.015);
      const traceDiff = rng.nextFloat(0.035, 0.05); // Guarantees >= 3 ridges difference for I/O
      const meetDiff = rng.nextFloat(-0.008, 0.008); // Within <= 2 ridges for Meet (M)

      let deltaLeftY = baseDeltaY + meetDiff;
      let deltaRightY = baseDeltaY - meetDiff;

      if (resolvedTracing === "inner") {
        deltaLeftY = baseDeltaY - traceDiff;
        deltaRightY = baseDeltaY + traceDiff;
      } else if (resolvedTracing === "outer") {
        deltaLeftY = baseDeltaY + traceDiff;
        deltaRightY = baseDeltaY - traceDiff;
      }

      deltas.push(toCanvas(-0.42 + jx(), deltaLeftY, "delta", 0.5));
      deltas.push(toCanvas(0.42 + jx(), deltaRightY, "delta", 0.5));
      break;
    }

    case "centralPocket": {
      // Whorl core located high in the pattern area; delta-to-delta line passes below recurves
      const coreX = ulnarSide * 0.05 + jx();
      const coreY = -0.18 + jy();
      cores.push(toCanvas(coreX, coreY, "whorlCore", -1.0));

      const delta1X = -ulnarSide * 0.44 + jx();
      const delta1Y = 0.3 + jy();
      const delta2X = ulnarSide * 0.38 + jx();
      const delta2Y = 0.26 + jy();

      deltas.push(toCanvas(delta1X, delta1Y, "delta", 0.5));
      deltas.push(toCanvas(delta2X, delta2Y, "delta", 0.5));
      break;
    }

    case "doubleLoop": {
      // 2 distinct cores forming an interlaced twin loop, mirrored properly by ulnarSide
      const c1X = -ulnarSide * 0.11 + jx();
      const c1Y = -0.16 + jy();
      const c2X = ulnarSide * 0.11 + jx();
      const c2Y = 0.02 + jy();
      cores.push(toCanvas(c1X, c1Y, "loopCore", -0.5));
      cores.push(toCanvas(c2X, c2Y, "loopCore", -0.5));

      deltas.push(
        toCanvas(-ulnarSide * 0.45 + jx(), 0.26 + jy(), "delta", 0.5),
      );
      deltas.push(toCanvas(ulnarSide * 0.45 + jx(), 0.18 + jy(), "delta", 0.5));
      break;
    }

    case "ulnarLoop": {
      // Loop opens toward ulnarSide; Delta on radial side (-ulnarSide)
      const coreX = ulnarSide * 0.08 + jx();
      const coreY = -0.1 + jy();
      cores.push(toCanvas(coreX, coreY, "loopCore", -0.5));

      const deltaX = -ulnarSide * 0.42 + jx();
      const deltaY = 0.24 + jy();
      deltas.push(toCanvas(deltaX, deltaY, "delta", 0.5));
      break;
    }

    case "radialLoop": {
      // Loop opens toward radial side (-ulnarSide); Delta on ulnarSide
      const coreX = -ulnarSide * 0.08 + jx();
      const coreY = -0.1 + jy();
      cores.push(toCanvas(coreX, coreY, "loopCore", -0.5));

      const deltaX = ulnarSide * 0.42 + jx();
      const deltaY = 0.24 + jy();
      deltas.push(toCanvas(deltaX, deltaY, "delta", 0.5));
      break;
    }

    case "tentedArch": {
      // Upright spike: Core and Delta closely aligned along vertical axis to prevent looping
      const sharedX = jx() * 0.6;
      cores.push(
        toCanvas(
          sharedX + rng.nextFloat(-0.005, 0.005),
          -0.06 + jy() * 0.5,
          "loopCore",
          -0.5,
        ),
      );
      deltas.push(
        toCanvas(
          sharedX + rng.nextFloat(-0.005, 0.005),
          0.12 + jy() * 0.5,
          "delta",
          0.5,
        ),
      );
      break;
    }

    case "plainArch":
    default: {
      break;
    }
  }

  return {
    cores,
    deltas,
    pattern: patternKey,
    hand,
    whorlTracing: resolvedTracing,
    // Mỗi vân tay có độ cuộn xoáy ốc và độ dẹt tâm khác nhau!
    spiralTwist: rng.nextFloat(-0.28, 0.28),
    coreAspect: rng.nextFloat(0.95, 1.38),
    archCurvature: rng.nextFloat(0.32, 0.62),
  };
}
