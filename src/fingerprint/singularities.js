/**
 * Singular Points (Cores and Deltas) generator according to dactyloscopic anatomy.
 * Handles hand orientation (Left vs Right thumb) and Henry pattern classification.
 * Strictly implements forensic criteria:
 * - Plain Whorl: 2 deltas + 1 central whorl core (index -1), Imaginary Line Criterion verified,
 *   with Ridge Tracing classification (Inner, Meet, Outer).
 * - Central Pocket Loop: 2 deltas + 1 core, imaginary delta line does NOT cut central recurve.
 * - Double Loop: 2 interlaced cores forming an S-loop + 2 deltas.
 * - Loops (Ulnar/Radial): 1 core + 1 delta.
 * - Arches (Tented/Plain): Tented has 1 core + 1 delta vertical; Plain has 0 cores + 0 deltas.
 */
export function placeSingularities(width, height, maskInfo, params, rng) {
  const { hand = 'right', pattern = 'plainWhorl', whorlTracing = 'random' } = params;
  const { center, radii, rotAngle } = maskInfo;
  const { rx, ry } = radii;

  const cores = [];
  const deltas = [];

  // Hand sign multiplier: for right hand ulnar side is +x, for left hand ulnar side is -x
  const ulnarSide = hand === 'right' ? 1 : -1;

  // Local helper to place and rotate a point into canvas space
  function toCanvas(normX, normY, type = 'core', index = -0.5) {
    const lx = normX * rx;
    const ly = normY * ry;
    const cosR = Math.cos(rotAngle);
    const sinR = Math.sin(rotAngle);
    return {
      x: center.x + lx * cosR - ly * sinR,
      y: center.y + lx * sinR + ly * cosR,
      lx, ly, normX, normY,
      type,
      index // Poincaré index: -0.5 for loop core, -1.0 for whorl core, +0.5 for delta
    };
  }

  const jx = () => rng.nextFloat(-0.025, 0.025);
  const jy = () => rng.nextFloat(-0.025, 0.025);

  // Normalized pattern selector (support both 'plainWhorl' and legacy 'whorl')
  const patternKey = (pattern === 'whorl' || pattern === 'plainWhorl') ? 'plainWhorl' : pattern;

  let resolvedTracing = whorlTracing;
  if (resolvedTracing === 'random' || !['inner', 'meet', 'outer'].includes(resolvedTracing)) {
    const r = rng.next();
    resolvedTracing = r < 0.35 ? 'meet' : (r < 0.68 ? 'inner' : 'outer');
  }

  switch (patternKey) {
    case 'plainWhorl': {
      // 1 Core at exact geometric center of innermost spiral/circle (Poincaré index -1.0)
      // Core positioned at (0, -0.02) so the delta-to-delta line crosses the inner closed recurves
      const coreX = 0.0 + jx();
      const coreY = -0.02 + jy();
      cores.push(toCanvas(coreX, coreY, 'whorlCore', -1.0));

      // 2 Deltas positioned at left and right type-line divergence points.
      // Ridge Tracing: Inner (I), Meet (M), Outer (O)
      // Base delta positions: left x ≈ -0.42, right x ≈ +0.42
      let deltaLeftY = 0.18 + jy();
      let deltaRightY = 0.18 + jy();

      if (resolvedTracing === 'inner') {
        // Lower branch of left delta traces INSIDE (above) right delta >= 3 ridges
        // Right delta is placed lower or left delta higher
        deltaLeftY = 0.14 + jy();
        deltaRightY = 0.22 + jy();
      } else if (resolvedTracing === 'outer') {
        // Lower branch of left delta traces OUTSIDE (below) right delta >= 3 ridges
        // Right delta is placed higher or left delta lower
        deltaLeftY = 0.22 + jy();
        deltaRightY = 0.14 + jy();
      } else {
        // Meet (M): Tracing runs into or within 2 ridges of right delta (balanced)
        deltaLeftY = 0.18 + jy();
        deltaRightY = 0.18 + jy();
      }

      deltas.push(toCanvas(-0.42 + jx(), deltaLeftY, 'delta', 0.5));
      deltas.push(toCanvas(0.42 + jx(), deltaRightY, 'delta', 0.5));
      break;
    }

    case 'centralPocket': {
      // Whorl core is located high in the pattern area (index -1.0)
      // Imaginary line between deltas does NOT cut any central closed recurving ridge
      const coreX = (ulnarSide * 0.05) + jx();
      const coreY = -0.18 + jy();
      cores.push(toCanvas(coreX, coreY, 'whorlCore', -1.0));

      // Deltas placed low down so the imaginary connecting line passes below the central pocket
      const delta1X = (-ulnarSide * 0.44) + jx();
      const delta1Y = 0.30 + jy();
      const delta2X = (ulnarSide * 0.38) + jx();
      const delta2Y = 0.26 + jy();

      deltas.push(toCanvas(delta1X, delta1Y, 'delta', 0.5));
      deltas.push(toCanvas(delta2X, delta2Y, 'delta', 0.5));
      break;
    }

    case 'doubleLoop': {
      // 2 distinct cores (each index -0.5) forming an S-shape / twin loop
      const c1X = (-ulnarSide * 0.12) + jx();
      const c1Y = -0.18 + jy();
      const c2X = (ulnarSide * 0.12) + jx();
      const c2Y = 0.02 + jy();
      cores.push(toCanvas(c1X, c1Y, 'loopCore', -0.5));
      cores.push(toCanvas(c2X, c2Y, 'loopCore', -0.5));

      deltas.push(toCanvas(-0.46 + jx(), 0.26 + jy(), 'delta', 0.5));
      deltas.push(toCanvas(0.46 + jx(), 0.20 + jy(), 'delta', 0.5));
      break;
    }

    case 'ulnarLoop': {
      // Loop opens toward ulnarSide (+x for right thumb, -x for left thumb)
      // Delta is located on the opposite side (-ulnarSide)
      const coreX = (ulnarSide * 0.08) + jx();
      const coreY = -0.10 + jy();
      cores.push(toCanvas(coreX, coreY, 'loopCore', -0.5));

      const deltaX = (-ulnarSide * 0.42) + jx();
      const deltaY = 0.24 + jy();
      deltas.push(toCanvas(deltaX, deltaY, 'delta', 0.5));
      break;
    }

    case 'radialLoop': {
      // Loop opens toward radial side (opposite of ulnar loop)
      const coreX = (-ulnarSide * 0.08) + jx();
      const coreY = -0.10 + jy();
      cores.push(toCanvas(coreX, coreY, 'loopCore', -0.5));

      const deltaX = (ulnarSide * 0.42) + jx();
      const deltaY = 0.24 + jy();
      deltas.push(toCanvas(deltaX, deltaY, 'delta', 0.5));
      break;
    }

    case 'tentedArch': {
      // Upright spike: 1 core and 1 delta aligned vertically close together on the midline
      cores.push(toCanvas(0.0 + jx(), -0.14 + jy(), 'loopCore', -0.5));
      deltas.push(toCanvas(0.0 + jx(), 0.18 + jy(), 'delta', 0.5));
      break;
    }

    case 'plainArch':
    default: {
      // Plain arch has no core or delta (pure wave flow)
      break;
    }
  }

  return {
    cores,
    deltas,
    pattern: patternKey,
    hand,
    whorlTracing: resolvedTracing
  };
}
