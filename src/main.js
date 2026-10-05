import { generateFullFingerprint } from './fingerprint/pipeline.js';
import { renderFingerprint, renderPatchToCanvas } from './ui/renderer.js';

// Application State
const state = {
  level: 1,
  seed: 428913,
  hand: 'right',
  pattern: 'plainWhorl',
  whorlTracing: 'random',
  ridgePeriod: 8.5,
  iterations: 10,
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

// DOM Elements
const canvas = document.getElementById('main-canvas');
const loader = document.getElementById('canvas-loader');
const targetSlotsContainer = document.getElementById('target-slots-container');
const piecesGrid = document.getElementById('pieces-grid');
const activeSlotNumEl = document.getElementById('active-slot-num');
const selectionStatusEl = document.getElementById('selection-status-text');
const alertBanner = document.getElementById('alert-banner');
const alertText = document.getElementById('alert-text');
const progressFill = document.getElementById('progress-fill');
const progressGlow = document.getElementById('progress-glow');
const progressText = document.getElementById('progress-text');
const systemStatusText = document.getElementById('system-status-text');
const scoreWrongEl = document.getElementById('score-wrong');
const levelBadge = document.getElementById('level-badge');
const hudCoordReadout = document.getElementById('hud-coord-readout');

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

// Victory Modal
const victoryModal = document.getElementById('victory-modal');
const winLevel = document.getElementById('win-level');
const winWrong = document.getElementById('win-wrong');
const btnNextLevel = document.getElementById('btn-next-level');

function initEvents() {
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
    state.overlays.showSingularities = document.getElementById('check-singularities').checked;
    state.overlays.showFlow = document.getElementById('check-flow').checked;
    state.overlays.showMinutiae = document.getElementById('check-minutiae').checked;
    configDrawer.classList.remove('open');
    startNewRound();
  });

  // Victory Modal Continue
  btnNextLevel.addEventListener('click', () => {
    victoryModal.classList.add('hidden');
    state.level++;
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

function startNewRound() {
  loader.classList.remove('hidden');
  state.solvedSlots.clear();
  state.activeSlotIndex = 1;
  state.scoreWrong = 0;
  scoreWrongEl.textContent = '0';
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
        cutPuzzle: true,
        numReal: 4,
        pieceSize: 74
      };

      const result = generateFullFingerprint(params);
      state.currentResult = result;

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

      // Prepare and shuffle 8 fragment pieces (4 real + 4 decoys)
      preparePiecesGrid();

      systemStatusText.textContent = 'SẴN SÀNG // CHỌN MẢNH';
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
  // Sort by orderIndex 1..4
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

  // Check if clicked piece matches the currently active target slot
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

    // Find next unsolved slot index (1..4)
    let nextSlot = null;
    for (let i = 1; i <= 4; i++) {
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

    // Check Win Condition: all 4 slots solved
    if (state.solvedSlots.size === 4) {
      triggerVictory();
    }
  } else {
    // WRONG PIECE OR DECOY!
    state.scoreWrong++;
    scoreWrongEl.textContent = state.scoreWrong;

    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 420);

    showAlert(`⚠ KHÔNG KHỚP // VUI LÒNG THỬ MẢNH KHÁC CHO VỊ TRÍ #${currentSlot}`, 'danger');
  }
}

function updatePromptStatus() {
  if (state.solvedSlots.size === 4) {
    if (systemStatusText) {
      systemStatusText.textContent = 'HOÀN TẤT // TOÀN BỘ 4 VỊ TRÍ KHỚP';
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
  const count = state.solvedSlots.size;
  const percent = Math.round((count / 4) * 100);

  progressFill.style.width = `${percent}%`;
  progressGlow.style.left = `${percent}%`;
  progressText.textContent = `${count} / 4 VỊ TRÍ (${percent}%)`;

  if (count === 4) {
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
  winLevel.textContent = String(state.level).padStart(2, '0');
  winWrong.textContent = state.scoreWrong;

  setTimeout(() => {
    victoryModal.classList.remove('hidden');
  }, 700);
}

// Start application
initEvents();
startNewRound();
