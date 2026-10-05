import { generateFullFingerprint } from '../src/fingerprint/pipeline.js';

console.log('Testing fingerprint puzzle cutter across different modes and seeds...');

const seeds = [428913, 100001, 234567, 888888, 999123, 765432, 123456, 555555, 333221, 654987];
const testModes = [
  { name: 'easy', numReal: 4, pieceSize: 74 },
  { name: 'normal', numReal: 6, pieceSize: 64 },
  { name: 'hard', numReal: 8, pieceSize: 58 }
];

for (const mode of testModes) {
  console.log(`\n=== Testing ${mode.name.toUpperCase()} (numReal=${mode.numReal}, pieceSize=${mode.pieceSize}) ===`);
  let successCount = 0;
  for (const seed of seeds) {
    try {
      const res = generateFullFingerprint({
        width: 512,
        height: 512,
        seed,
        cutPuzzle: true,
        numReal: mode.numReal,
        pieceSize: mode.pieceSize
      });
      const puzzle = res.puzzle;
      if (puzzle.realPieces.length === mode.numReal) {
        successCount++;
      } else {
        console.warn(`Seed ${seed}: Expected ${mode.numReal} real pieces, got ${puzzle.realPieces.length}`);
      }
    } catch (e) {
      console.error(`Seed ${seed} error:`, e.message);
    }
  }
  console.log(`Result: ${successCount}/${seeds.length} succeeded for ${mode.name}`);
}
