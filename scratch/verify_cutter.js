import { generateFullFingerprint } from '../src/fingerprint/pipeline.js';

console.log('Testing upgraded cutter with pipeline.js across seeds and difficulties...');

const seeds = [428913, 888888, 123456, 999123, 765432];
const diffs = [
  { diff: 'easy', numReal: 4 },
  { diff: 'normal', numReal: 6 },
  { diff: 'hard', numReal: 8 }
];

let allPassed = true;

for (const d of diffs) {
  console.log(`\n--- Difficulty: ${d.diff.toUpperCase()} (Target: ${d.numReal}) ---`);
  for (const seed of seeds) {
    const res = generateFullFingerprint({
      width: 512,
      height: 512,
      seed,
      cutPuzzle: true,
      difficulty: d.diff,
      numReal: d.numReal
    });

    const p = res.puzzle;
    const isOk = p.realPieces.length === d.numReal;
    console.log(`Seed ${seed}: realPieces=${p.realPieces.length}/${d.numReal}, decoys=${p.decoyPieces.length}, pieceSize=${p.pieceSize} -> ${isOk ? 'OK' : 'FAIL'}`);
    if (!isOk) allPassed = false;
  }
}

console.log('\n=====================================');
console.log('OVERALL VERIFICATION:', allPassed ? 'ALL PASSED!' : 'SOME FAILED');
console.log('=====================================');
