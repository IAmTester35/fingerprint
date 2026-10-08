import { generateFullFingerprint } from './fingerprint/pipeline.js';
import { renderFingerprint, renderPatchToCanvas } from './ui/renderer.js';

// Application State
const state = {
  level: 1,
  difficulty: 'easy', // 'easy' | 'normal' | 'hard'
  targetCount: 4,     // 4 for easy, 6 for normal, 8 for hard
  seed: 428913,
  hand: 'right',
  pattern: 'plainWhorl',
  whorlTracing: 'random',
  ridgePeriod: 4.2,
  iterations: 9,
  dermalGrain: 0.35,
  breakFrequency: 0.35,
  poreFrequency: 0.40,
  overlays: {
    showSingularities: false,
    showFlow: false,
    showMinutiae: false
  },
  activeSlotIndex: 1,
  solvedSlots: new Set(),
  scoreWrong: 0,
  currentResult: null,
  piecesShuffled: []
};

const DIFFICULTY_MAP = {
  easy: { slots: 4, label: 'DỄ // 4 MỤC TIÊU' },
  normal: { slots: 6, label: 'VỪA // 6 MỤC TIÊU' },
  hard: { slots: 8, label: 'KHÓ // 8 MỤC TIÊU' }
};

// DOM Elements
const canvas = document.getElementById('main-canvas');
const loader = document.getElementById('canvas-loader');
const targetSlotsContainer = document.getElementById('target-slots-container');
const piecesGrid = document.getElementById('pieces-grid');
const alertBanner = document.getElementById('alert-banner');
const alertText = document.getElementById('alert-text');
const progressFill = document.getElementById('progress-fill');
const progressGlow = document.getElementById('progress-glow');
const progressText = document.getElementById('progress-text');
const systemStatusText = document.getElementById('system-status-text');
const scoreWrongEl = document.getElementById('score-wrong');
const hudCoordReadout = document.getElementById('hud-coord-readout');

// Header Telemetry & Difficulty Elements
const hudLevelVal = document.getElementById('hud-level-val');
const hudWrongVal = document.getElementById('hud-wrong-val');
const hudDiffBtns = document.querySelectorAll('#hud-difficulty-bar .diff-btn');
const drawerDiffBtns = document.querySelectorAll('#drawer-difficulty-control .seg-btn');

// Controls
const btnNextTarget = document.getElementById('btn-next-target');
const btnToggleConfig = document.getElementById('btn-toggle-config');
const configDrawer = document.getElementById('config-drawer');
const btnCloseDrawer = document.getElementById('btn-close-drawer');
const btnApplyConfig = document.getElementById('btn-apply-config');

// Config Form
const seedInput = document.getElementById('seed-input');
const btnRandomSeed = document.getElementById('btn-random-seed');
const patternSelect = document.getElementById('pattern-select');
const tracingSelect = document.getElementById('tracing-select');
const whorlTracingGroup = document.getElementById('whorl-tracing-group');
const periodSlider = document.getElementById('period-slider');
const periodVal = document.getElementById('period-val');
const iterationsSlider = document.getElementById('iterations-slider');
const iterationsVal = document.getElementById('iterations-val');
const breaksSlider = document.getElementById('breaks-slider');
const breaksVal = document.getElementById('breaks-val');
const grainSlider = document.getElementById('grain-slider');
const grainVal = document.getElementById('grain-val');
const poresSlider = document.getElementById('pores-slider');
const poresVal = document.getElementById('pores-val');

// Victory Modal
const victoryModal = document.getElementById('victory-modal');
const winLevel = document.getElementById('win-level');
const winDiff = document.getElementById('win-diff');
const winWrong = document.getElementById('win-wrong');
const winAccuracy = document.getElementById('win-accuracy');
const btnNextLevel = document.getElementById('btn-next-level');

function initEvents() {
  // Quick Difficulty Selector (Top HUD)
  hudDiffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const diff = btn.dataset.difficulty;
      setDifficulty(diff);
    });
  });

  // Drawer Difficulty Selector
  drawerDiffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const diff = btn.dataset.difficulty;
      setDifficulty(diff);
    });
  });

  // Next / Reroll Target
  if (btnNextTarget) {
    btnNextTarget.addEventListener('click', () => {
      state.seed = Math.floor(Math.random() * 900000) + 100000;
      seedInput.value = state.seed;
      startNewRound();
    });
  }

  // Config Drawer
  btnToggleConfig.addEventListener('click', () => {
    configDrawer.classList.toggle('open');
  });

  btnCloseDrawer.addEventListener('click', () => {
    configDrawer.classList.remove('open');
  });

  btnRandomSeed.addEventListener('click', () => {
    state.seed = Math.floor(Math.random() * 900000) + 100000;
    seedInput.value = state.seed;
  });

  if (patternSelect && whorlTracingGroup) {
    patternSelect.addEventListener('change', () => {
      if (patternSelect.value === 'plainWhorl' || patternSelect.value === 'whorl') {
        whorlTracingGroup.style.display = 'block';
      } else {
        whorlTracingGroup.style.display = 'none';
      }
    });
  }

  periodSlider.addEventListener('input', () => {
    periodVal.textContent = parseFloat(periodSlider.value).toFixed(1) + ' px';
  });

  iterationsSlider.addEventListener('input', () => {
    iterationsVal.textContent = iterationsSlider.value + ' vòng';
  });

  if (breaksSlider && breaksVal) {
    breaksSlider.addEventListener('input', () => {
      breaksVal.textContent = breaksSlider.value + '%';
    });
  }
  if (grainSlider && grainVal) {
    grainSlider.addEventListener('input', () => {
      grainVal.textContent = grainSlider.value + '%';
    });
  }
  if (poresSlider && poresVal) {
    poresSlider.addEventListener('input', () => {
      poresVal.textContent = poresSlider.value + '%';
    });
  }

  // Hand segmented control
  const handBtns = document.querySelectorAll('#hand-control .seg-btn');
  handBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      handBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.hand = btn.dataset.hand;
    });
  });

  btnApplyConfig.addEventListener('click', () => {
    state.seed = parseInt(seedInput.value, 10) || 428913;
    state.pattern = patternSelect.value;
    if (tracingSelect) {
      state.whorlTracing = tracingSelect.value;
    }
    state.ridgePeriod = parseFloat(periodSlider.value);
    state.iterations = parseInt(iterationsSlider.value, 10);
    if (breaksSlider) state.breakFrequency = parseInt(breaksSlider.value, 10) / 100;
    if (grainSlider) state.dermalGrain = parseInt(grainSlider.value, 10) / 100;
    if (poresSlider) state.poreFrequency = parseInt(poresSlider.value, 10) / 100;
    state.overlays.showSingularities = document.getElementById('check-singularities').checked;
    state.overlays.showFlow = document.getElementById('check-flow').checked;
    state.overlays.showMinutiae = document.getElementById('check-minutiae').checked;
    configDrawer.classList.remove('open');
    startNewRound();
  });

  // Victory Modal Continue (Follows Canonical GTA V Level Pattern: 4, 6, 8, 6 slots)
  btnNextLevel.addEventListener('click', () => {
    victoryModal.classList.add('hidden');
    state.level++;
    
    // Automatic difficulty progression matching reference screenshots:
    // Level 1: 4 slots (Easy, matching ui_expected.jpg)
    // Level 2: 6 slots (Normal, matching 2.png)
    // Level 3: 8 slots (Hard, matching 3.png)
    // Level 4: 6 slots (Normal, matching 4.png)
    const levelSeq = ['easy', 'normal', 'hard', 'normal'];
    const nextDiff = levelSeq[(state.level - 1) % levelSeq.length];
    state.difficulty = nextDiff;
    state.targetCount = DIFFICULTY_MAP[nextDiff].slots;

    hudDiffBtns.forEach(b => b.classList.toggle('active', b.dataset.difficulty === nextDiff));
    drawerDiffBtns.forEach(b => b.classList.toggle('active', b.dataset.difficulty === nextDiff));

    state.seed = Math.floor(Math.random() * 900000) + 100000;
    seedInput.value = state.seed;
    startNewRound();
  });

  // Realtime Coordinate Readout on Scanner Hover
  const scannerViewport = document.getElementById('scanner-viewport');
  scannerViewport.addEventListener('mousemove', (e) => {
    const rect = scannerViewport.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * (512 / rect.width)).toFixed(1);
    const y = ((e.clientY - rect.top) * (512 / rect.height)).toFixed(1);
    hudCoordReadout.textContent = `X: ${x} // Y: ${y}`;
  });
}

function setDifficulty(diff) {
  if (!DIFFICULTY_MAP[diff]) return;
  state.difficulty = diff;
  state.targetCount = DIFFICULTY_MAP[diff].slots;

  // Sync HUD and Drawer buttons
  hudDiffBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.difficulty === diff);
  });
  drawerDiffBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.difficulty === diff);
  });

  startNewRound();
}

function startNewRound() {
  loader.classList.remove('hidden');
  state.solvedSlots.clear();
  state.activeSlotIndex = 1;
  state.scoreWrong = 0;

  if (scoreWrongEl) scoreWrongEl.textContent = '0';
  if (hudWrongVal) hudWrongVal.textContent = '0';
  if (hudLevelVal) hudLevelVal.textContent = String(state.level).padStart(2, '0');

  systemStatusText.textContent = 'ĐANG GIẢI MÃ VÂN TAY';
  systemStatusText.className = 'meta-val highlight';
  updateProgressUI();

  setTimeout(() => {
    try {
      const params = {
        width: 512,
        height: 512,
        seed: state.seed,
        hand: state.hand,
        pattern: state.pattern,
        whorlTracing: state.whorlTracing,
        ridgePeriod: state.ridgePeriod,
        iterations: state.iterations,
        grainStrength: state.dermalGrain,
        breakFrequency: state.breakFrequency,
        poreFrequency: state.poreFrequency,
        cutPuzzle: true,
        difficulty: state.difficulty,
        numReal: state.targetCount
      };

      const result = generateFullFingerprint(params);
      state.currentResult = result;

      // Update actual slots from generated result
      const totalSlots = result.puzzle?.realPieces?.length || state.targetCount;
      state.targetCount = totalSlots;

      // Render Fingerprint with Authentic Tactical Forensic theme
      renderFingerprint(canvas, result, {
        style: 'tactical',
        showFlow: state.overlays.showFlow,
        showSingularities: state.overlays.showSingularities,
        showMinutiae: state.overlays.showMinutiae,
        solvedSlots: state.solvedSlots
      });

      // Prepare target slots on scanner
      renderTargetSlotsOverlay();

      // Prepare and shuffle fragment pieces
      preparePiecesGrid();

      systemStatusText.textContent = `SẴN SÀNG // CHỌN MẢNH #${state.activeSlotIndex}`;
      updateProgressUI();
    } catch (err) {
      console.error('Synthesis error:', err);
      systemStatusText.textContent = 'LỖI TỔNG HỢP';
      systemStatusText.className = 'meta-val text-danger';
    } finally {
      loader.classList.add('hidden');
    }
  }, 40);
}

function renderTargetSlotsOverlay() {
  targetSlotsContainer.innerHTML = '';
  if (!state.currentResult || !state.currentResult.puzzle) return;

  const realPieces = state.currentResult.puzzle.realPieces;
  // Sort by orderIndex 1..N
  realPieces.sort((a, b) => a.orderIndex - b.orderIndex);

  realPieces.forEach(p => {
    const slotEl = document.createElement('div');
    slotEl.className = 'target-slot';
    slotEl.dataset.order = p.orderIndex;

    // Viewport scaling for compact layout (374px / 512px)
    const scale = 374 / 512;
    slotEl.style.left = `${Math.round(p.x * scale)}px`;
    slotEl.style.top = `${Math.round(p.y * scale)}px`;
    slotEl.style.width = `${Math.round(p.size * scale)}px`;
    slotEl.style.height = `${Math.round(p.size * scale)}px`;

    // Dynamic slot number font scaling
    const scaledSize = Math.round(p.size * scale);
    if (scaledSize <= 42) {
      slotEl.style.setProperty('--slot-font-size', '1.15rem');
    } else if (scaledSize <= 48) {
      slotEl.style.setProperty('--slot-font-size', '1.3rem');
    } else {
      slotEl.style.setProperty('--slot-font-size', '1.5rem');
    }

    const isSolved = state.solvedSlots.has(p.orderIndex);
    const isActive = p.orderIndex === state.activeSlotIndex;

    if (isSolved) {
      slotEl.classList.add('solved');
      const patchCanvas = document.createElement('canvas');
      renderPatchToCanvas(patchCanvas, p.data, p.size, 'tactical');
      slotEl.appendChild(patchCanvas);

      const numSpan = document.createElement('span');
      numSpan.className = 'slot-number';
      numSpan.textContent = p.orderIndex;
      slotEl.appendChild(numSpan);

      const checkSpan = document.createElement('span');
      checkSpan.className = 'slot-badge-check';
      checkSpan.textContent = '✓';
      slotEl.appendChild(checkSpan);
    } else if (isActive) {
      slotEl.classList.add('active');
      slotEl.innerHTML = `
        <span class="slot-corner slot-corner-tl"></span>
        <span class="slot-corner slot-corner-tr"></span>
        <span class="slot-corner slot-corner-bl"></span>
        <span class="slot-corner slot-corner-br"></span>
        <span class="slot-number">${p.orderIndex}</span>
      `;
    } else {
      slotEl.classList.add('inactive');
      slotEl.innerHTML = `<span class="slot-number">${p.orderIndex}</span>`;
    }

    // Allow user to click any unsolved target slot to switch active focus
    slotEl.addEventListener('click', () => {
      if (state.solvedSlots.has(p.orderIndex)) return;
      state.activeSlotIndex = p.orderIndex;
      renderTargetSlotsOverlay();
      updatePromptStatus();
    });

    targetSlotsContainer.appendChild(slotEl);
  });
}

function preparePiecesGrid() {
  if (!state.currentResult || !state.currentResult.puzzle) return;
  const puzzle = state.currentResult.puzzle;
  piecesGrid.innerHTML = '';

  // Dynamically set card size and gaps based on real pieces count to guarantee no overflow
  const totalReal = puzzle.realPieces.length;
  if (totalReal <= 4) {
    piecesGrid.style.setProperty('--card-size', '74px');
    piecesGrid.style.setProperty('--card-gap-y', '12px');
    piecesGrid.style.setProperty('--card-gap-x', '14px');
  } else if (totalReal <= 6) {
    piecesGrid.style.setProperty('--card-size', '70px');
    piecesGrid.style.setProperty('--card-gap-y', '10px');
    piecesGrid.style.setProperty('--card-gap-x', '12px');
  } else {
    piecesGrid.style.setProperty('--card-size', '64px');
    piecesGrid.style.setProperty('--card-gap-y', '8px');
    piecesGrid.style.setProperty('--card-gap-x', '10px');
  }

  // Combine real pieces and decoys
  const allPieces = [...puzzle.realPieces, ...puzzle.decoyPieces];

  // Deterministic shuffle
  for (let i = allPieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = allPieces[i];
    allPieces[i] = allPieces[j];
    allPieces[j] = temp;
  }
  state.piecesShuffled = allPieces;

  allPieces.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className = 'piece-card';
    card.dataset.pieceIdx = idx;

    const pCanvas = document.createElement('canvas');
    renderPatchToCanvas(pCanvas, p.data, p.size, 'tactical');

    card.appendChild(pCanvas);

    // Click matching logic
    card.addEventListener('click', () => {
      handlePieceClick(p, card);
    });

    piecesGrid.appendChild(card);
  });

  updatePromptStatus();
}

function handlePieceClick(piece, card) {
  if (card.classList.contains('solved')) return;

  const totalSlots = state.currentResult?.puzzle?.realPieces?.length || state.targetCount || 4;
  const currentSlot = state.activeSlotIndex;
  const isMatch = !piece.isDecoy && piece.orderIndex === currentSlot;

  if (isMatch) {
    // CORRECT PIECE!
    state.solvedSlots.add(currentSlot);

    card.classList.add('flash-success');
    setTimeout(() => {
      card.classList.remove('flash-success');
      card.classList.add('solved');
    }, 400);

    // Flash alert banner with success
    showAlert(`✓ KHỚP VỊ TRÍ #${currentSlot} THÀNH CÔNG!`, 'success');

    // Find next unsolved slot index (1..totalSlots)
    let nextSlot = null;
    for (let i = 1; i <= totalSlots; i++) {
      if (!state.solvedSlots.has(i)) {
        nextSlot = i;
        break;
      }
    }

    if (nextSlot) {
      state.activeSlotIndex = nextSlot;
    }

    updateProgressUI();
    renderFingerprint(canvas, state.currentResult, {
      style: 'tactical',
      showFlow: state.overlays.showFlow,
      showSingularities: state.overlays.showSingularities,
      showMinutiae: state.overlays.showMinutiae,
      solvedSlots: state.solvedSlots
    });
    renderTargetSlotsOverlay();
    updatePromptStatus();

    // Check Win Condition: all totalSlots solved
    if (state.solvedSlots.size === totalSlots && totalSlots > 0) {
      triggerVictory();
    }
  } else {
    // WRONG PIECE OR DECOY!
    state.scoreWrong++;
    if (scoreWrongEl) scoreWrongEl.textContent = state.scoreWrong;
    if (hudWrongVal) hudWrongVal.textContent = state.scoreWrong;

    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 420);

    showAlert(`⚠ KHÔNG KHỚP // VUI LÒNG THỬ MẢNH KHÁC CHO VỊ TRÍ #${currentSlot}`, 'danger');
  }
}

function updatePromptStatus() {
  const totalSlots = state.currentResult?.puzzle?.realPieces?.length || state.targetCount || 4;
  if (state.solvedSlots.size === totalSlots && totalSlots > 0) {
    if (systemStatusText) {
      systemStatusText.textContent = `HOÀN TẤT // TOÀN BỘ ${totalSlots} VỊ TRÍ KHỚP`;
      systemStatusText.className = 'meta-val text-success';
    }
  } else {
    if (systemStatusText) {
      systemStatusText.textContent = `CHỌN MẢNH CHO VỊ TRÍ #${state.activeSlotIndex}`;
      systemStatusText.className = 'meta-val';
    }
  }
}

function updateProgressUI() {
  const totalSlots = state.currentResult?.puzzle?.realPieces?.length || state.targetCount || 4;
  const count = state.solvedSlots.size;
  const percent = Math.min(100, Math.round((count / totalSlots) * 100));

  progressFill.style.width = `${percent}%`;
  progressGlow.style.left = `${percent}%`;
  progressText.textContent = `${count} / ${totalSlots} VỊ TRÍ (${percent}%)`;

  if (count === totalSlots && totalSlots > 0) {
    systemStatusText.textContent = 'TRUY CẬP ĐÃ MỞ KHÓA';
    systemStatusText.className = 'meta-val text-success';
  }
}

function showAlert(text, type = 'danger') {
  alertText.textContent = text;
  alertBanner.className = `alert-banner ${type === 'success' ? 'text-success' : 'text-danger'}`;
  alertBanner.classList.remove('hidden');

  clearTimeout(alertBanner._timeout);
  alertBanner._timeout = setTimeout(() => {
    alertBanner.classList.add('hidden');
  }, 2200);
}

function triggerVictory() {
  const totalSlots = state.currentResult?.puzzle?.realPieces?.length || state.targetCount || 4;
  winLevel.textContent = String(state.level).padStart(2, '0');
  winWrong.textContent = state.scoreWrong;

  const currentDiff = DIFFICULTY_MAP[state.difficulty]?.label || `${totalSlots} MỤC TIÊU`;
  if (winDiff) winDiff.textContent = currentDiff;

  const totalAttempts = totalSlots + state.scoreWrong;
  const accuracy = Math.round((totalSlots / totalAttempts) * 100);
  if (winAccuracy) winAccuracy.textContent = `${accuracy}%`;

  setTimeout(() => {
    victoryModal.classList.remove('hidden');
  }, 700);
}

// Start application
initEvents();
startNewRound();
