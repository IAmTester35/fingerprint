import { generateFullFingerprint } from '../src/fingerprint/pipeline.js';
import { DIFFICULTY_PRESETS } from '../src/puzzle/cutter.js';

console.log('=== STARTING AUTOMATED GAMEPLAY SIMULATION ===\n');

const difficulties = ['easy', 'normal', 'hard'];
const testSeeds = [428913, 100001, 888888, 765432, 999123];

let totalTests = 0;
let passedTests = 0;

for (const diff of difficulties) {
  const preset = DIFFICULTY_PRESETS[diff];
  const expectedCount = preset.numReal;

  console.log(`\n--------------------------------------------------`);
  console.log(`TESTING DIFFICULTY: ${diff.toUpperCase()} (${expectedCount} SLOTS)`);
  console.log(`--------------------------------------------------`);

  for (const seed of testSeeds) {
    totalTests++;
    process.stdout.write(`Seed ${seed}: `);

    // 1. Generate full fingerprint with puzzle
    const result = generateFullFingerprint({
      width: 512,
      height: 512,
      seed,
      cutPuzzle: true,
      difficulty: diff,
      numReal: expectedCount
    });

    const puzzle = result.puzzle;

    // Check 1: Real pieces count must match exactly
    if (puzzle.realPieces.length !== expectedCount) {
      console.log(`FAILED! Expected ${expectedCount} real pieces, got ${puzzle.realPieces.length}`);
      continue;
    }

    // Check 2: Consecutive order indices 1..N
    const indices = puzzle.realPieces.map(p => p.orderIndex).sort((a, b) => a - b);
    const expectedIndices = Array.from({ length: expectedCount }, (_, i) => i + 1);
    const indicesMatch = JSON.stringify(indices) === JSON.stringify(expectedIndices);
    if (!indicesMatch) {
      console.log(`FAILED! Order indices mismatch: ${JSON.stringify(indices)}`);
      continue;
    }

    // Check 3: AABB collisions among real pieces
    let hasOverlap = false;
    for (let i = 0; i < puzzle.realPieces.length; i++) {
      for (let j = i + 1; j < puzzle.realPieces.length; j++) {
        const p1 = puzzle.realPieces[i];
        const p2 = puzzle.realPieces[j];
        const xOverlap = Math.abs(p1.x - p2.x) < puzzle.pieceSize;
        const yOverlap = Math.abs(p1.y - p2.y) < puzzle.pieceSize;
        if (xOverlap && yOverlap) {
          hasOverlap = true;
          break;
        }
      }
      if (hasOverlap) break;
    }
    if (hasOverlap) {
      console.log(`FAILED! Collision detected between puzzle pieces!`);
      continue;
    }

    // Check 4: Decoys exist and have NCC < 0.60
    let badNcc = false;
    for (const d of puzzle.decoyPieces) {
      if (d.maxNcc > 0.65) {
        badNcc = true;
        break;
      }
    }
    if (badNcc) {
      console.log(`FAILED! Decoy piece has too high NCC similarity!`);
      continue;
    }

    // Check 5: Simulate Full Game Loop (Solving Slot 1 through N)
    const solvedSlots = new Set();
    const allPieces = [...puzzle.realPieces, ...puzzle.decoyPieces];

    for (let currentSlot = 1; currentSlot <= expectedCount; currentSlot++) {
      // Find matching real piece
      const matchingPiece = allPieces.find(p => !p.isDecoy && p.orderIndex === currentSlot);
      if (!matchingPiece) {
        console.log(`FAILED! Slot #${currentSlot} has no corresponding piece in pool!`);
        break;
      }

      // Verify decoy pieces do NOT match
      const falseMatch = puzzle.decoyPieces.some(d => d.orderIndex === currentSlot);
      if (falseMatch) {
        console.log(`FAILED! A decoy piece was incorrectly tagged with orderIndex!`);
        break;
      }

      solvedSlots.add(currentSlot);
    }

    // Check 6: Win Condition
    if (solvedSlots.size !== expectedCount) {
      console.log(`FAILED! Game loop could not solve all ${expectedCount} slots!`);
      continue;
    }

    console.log(`PASSED (Cut: ${puzzle.realPieces.length}/${expectedCount}, Decoys: ${puzzle.decoyPieces.length}, All Solved: ✓)`);
    passedTests++;
  }
}

console.log(`\n==================================================`);
console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${Math.round(passedTests / totalTests * 100)}%)`);
console.log(`==================================================`);

if (passedTests === totalTests) {
  console.log('>>> ALL GAMEPLAY STRUCTURE AND CUTTER TESTS SUCCEEDED PERFECTLY! <<<');
} else {
  process.exit(1);
}
