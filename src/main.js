import { generateFullFingerprint } from "./fingerprint/pipeline.js";
import { renderFingerprint, renderPatchToCanvas } from "./ui/renderer.js";

const HARD_TARGET_COUNT = 8;
const HARD_LABEL = "KHÓ // 8 MỤC TIÊU";
const PATTERNS_POOL = [
  "plainWhorl",
  "ulnarLoop",
  "radialLoop",
  "doubleLoop",
  "centralPocket",
  "tentedArch",
];

// Application State (Locked to Hard Mode: 8 targets)
const state = {
  level: 1,
  difficulty: "hard",
  targetCount: HARD_TARGET_COUNT,
  seed: Math.floor(Math.random() * 900000) + 100000,
  hand: Math.random() < 0.5 ? "right" : "left",
  pattern: PATTERNS_POOL[Math.floor(Math.random() * PATTERNS_POOL.length)],
  whorlTracing: "random",
  rotation: (Math.random() - 0.5) * 16, // Xoay ngẫu nhiên từ -8° đến +8°
  aspectRatio: 1.18 + Math.random() * 0.22, // Ngón tay bầu hoặc thon dài khác nhau
  ridgePeriod: Number((3.8 + Math.random() * 0.9).toFixed(1)), // Độ thưa vân từ 3.8px - 4.7px
  iterations: 9,
  dermalGrain: 0.35,
  breakFrequency: 0.35,
  poreFrequency: 0.4,
  overlays: {
    showSingularities: false,
    showFlow: false,
    showMinutiae: false,
  },
  activeSlotIndex: 1,
  solvedSlots: new Set(),
  scoreWrong: 0,
  currentResult: null,
  piecesShuffled: [],
};

// DOM Elements
const canvas = document.getElementById("main-canvas");
const loader = document.getElementById("canvas-loader");
const targetSlotsContainer = document.getElementById("target-slots-container");
const piecesGrid = document.getElementById("pieces-grid");
const alertBanner = document.getElementById("alert-banner");
const alertText = document.getElementById("alert-text");
const progressFill = document.getElementById("progress-fill");
const progressGlow = document.getElementById("progress-glow");
const progressText = document.getElementById("progress-text");
const systemStatusText = document.getElementById("system-status-text");
const scoreWrongEl = document.getElementById("score-wrong");
const hudCoordReadout = document.getElementById("hud-coord-readout");

// Header Telemetry Elements
const hudLevelVal = document.getElementById("hud-level-val");
const hudWrongVal = document.getElementById("hud-wrong-val");
const hudDiffBtns = document.querySelectorAll("#hud-difficulty-bar .diff-btn");
const drawerDiffBtns = document.querySelectorAll(
  "#drawer-difficulty-control .seg-btn",
);

// Controls
const btnNextTarget = document.getElementById("btn-next-target");
const btnToggleConfig = document.getElementById("btn-toggle-config");
const configDrawer = document.getElementById("config-drawer");
const btnCloseDrawer = document.getElementById("btn-close-drawer");
const btnApplyConfig = document.getElementById("btn-apply-config");

// Config Form
const seedInput = document.getElementById("seed-input");
const btnRandomSeed = document.getElementById("btn-random-seed");
const patternSelect = document.getElementById("pattern-select");
const tracingSelect = document.getElementById("tracing-select");
const whorlTracingGroup = document.getElementById("whorl-tracing-group");
const periodSlider = document.getElementById("period-slider");
const periodVal = document.getElementById("period-val");
const iterationsSlider = document.getElementById("iterations-slider");
const iterationsVal = document.getElementById("iterations-val");
const breaksSlider = document.getElementById("breaks-slider");
const breaksVal = document.getElementById("breaks-val");
const grainSlider = document.getElementById("grain-slider");
const grainVal = document.getElementById("grain-val");
const poresSlider = document.getElementById("pores-slider");
const poresVal = document.getElementById("pores-val");

// Victory Modal
const victoryModal = document.getElementById("victory-modal");
const winLevel = document.getElementById("win-level");
const winDiff = document.getElementById("win-diff");
const winWrong = document.getElementById("win-wrong");
const winAccuracy = document.getElementById("win-accuracy");
const btnNextLevel = document.getElementById("btn-next-level");

function initEvents() {
  // Lock any existing difficulty UI buttons to 'hard' (or hide Easy/Normal buttons)
  hudDiffBtns.forEach((btn) => {
    const isHard = btn.dataset.difficulty === "hard";
    btn.classList.toggle("active", isHard);
    if (!isHard) btn.style.display = "none";
  });

  drawerDiffBtns.forEach((btn) => {
    const isHard = btn.dataset.difficulty === "hard";
    btn.classList.toggle("active", isHard);
    if (!isHard) btn.style.display = "none";
  });

  // Next / Reroll Target
  if (btnNextTarget) {
    btnNextTarget.addEventListener("click", () => {
      randomizeBiometrics();
      startNewRound();
    });
  }

  // Config Drawer
  if (btnToggleConfig && configDrawer) {
    btnToggleConfig.addEventListener("click", () => {
      configDrawer.classList.toggle("open");
    });
  }

  if (btnCloseDrawer && configDrawer) {
    btnCloseDrawer.addEventListener("click", () => {
      configDrawer.classList.remove("open");
    });
  }

  if (btnRandomSeed && seedInput) {
    btnRandomSeed.addEventListener("click", () => {
      state.seed = Math.floor(Math.random() * 900000) + 100000;
      seedInput.value = state.seed;
    });
  }

  if (patternSelect && whorlTracingGroup) {
    patternSelect.addEventListener("change", () => {
      const isWhorl =
        patternSelect.value === "plainWhorl" || patternSelect.value === "whorl";
      whorlTracingGroup.style.display = isWhorl ? "block" : "none";
    });
  }

  if (periodSlider && periodVal) {
    periodSlider.addEventListener("input", () => {
      periodVal.textContent = parseFloat(periodSlider.value).toFixed(1) + " px";
    });
  }

  if (iterationsSlider && iterationsVal) {
    iterationsSlider.addEventListener("input", () => {
      iterationsVal.textContent = iterationsSlider.value + " vòng";
    });
  }

  if (breaksSlider && breaksVal) {
    breaksSlider.addEventListener("input", () => {
      breaksVal.textContent = breaksSlider.value + "%";
    });
  }
  if (grainSlider && grainVal) {
    grainSlider.addEventListener("input", () => {
      grainVal.textContent = grainSlider.value + "%";
    });
  }
  if (poresSlider && poresVal) {
    poresSlider.addEventListener("input", () => {
      poresVal.textContent = poresSlider.value + "%";
    });
  }

  // Hand segmented control
  const handBtns = document.querySelectorAll("#hand-control .seg-btn");
  handBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      handBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.hand = btn.dataset.hand;
    });
  });

  if (btnApplyConfig) {
    btnApplyConfig.addEventListener("click", () => {
      const parsedSeed = parseInt(seedInput.value, 10);
      state.seed = Number.isFinite(parsedSeed) ? parsedSeed : 428913;
      state.pattern = patternSelect.value;
      if (tracingSelect) {
        state.whorlTracing = tracingSelect.value;
      }
      state.ridgePeriod = parseFloat(periodSlider.value);
      state.iterations = parseInt(iterationsSlider.value, 10);
      if (breaksSlider)
        state.breakFrequency = parseInt(breaksSlider.value, 10) / 100;
      if (grainSlider)
        state.dermalGrain = parseInt(grainSlider.value, 10) / 100;
      if (poresSlider)
        state.poreFrequency = parseInt(poresSlider.value, 10) / 100;

      const chkSing = document.getElementById("check-singularities");
      const chkFlow = document.getElementById("check-flow");
      const chkMin = document.getElementById("check-minutiae");
      if (chkSing) state.overlays.showSingularities = chkSing.checked;
      if (chkFlow) state.overlays.showFlow = chkFlow.checked;
      if (chkMin) state.overlays.showMinutiae = chkMin.checked;

      configDrawer.classList.remove("open");
      startNewRound();
    });
  }

  // Victory Modal Continue (Always Hard Mode - 8 Slots)
  if (btnNextLevel) {
    btnNextLevel.addEventListener("click", () => {
      victoryModal.classList.add("hidden");
      state.level++;
      randomizeBiometrics();
      startNewRound();
    });
  }

  // Realtime Coordinate Readout on Scanner Hover
  const scannerViewport = document.getElementById("scanner-viewport");
  if (scannerViewport && hudCoordReadout) {
    scannerViewport.addEventListener("mousemove", (e) => {
      const rect = scannerViewport.getBoundingClientRect();
      const x = ((e.clientX - rect.left) * (512 / rect.width)).toFixed(1);
      const y = ((e.clientY - rect.top) * (512 / rect.height)).toFixed(1);
      hudCoordReadout.textContent = `X: ${x} // Y: ${y}`;
    });
  }

  syncDrawerUI();
}

function startNewRound() {
  loader.classList.remove("hidden");
  state.solvedSlots.clear();
  state.activeSlotIndex = 1;
  state.scoreWrong = 0;
  state.targetCount = HARD_TARGET_COUNT;

  if (scoreWrongEl) scoreWrongEl.textContent = "0";
  if (hudWrongVal) hudWrongVal.textContent = "0";
  if (hudLevelVal)
    hudLevelVal.textContent = String(state.level).padStart(2, "0");

  systemStatusText.textContent = "ĐANG GIẢI MÃ VÂN TAY";
  systemStatusText.className = "meta-val highlight";
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
        rotation: state.rotation,
        aspectRatio: state.aspectRatio,
        ridgePeriod: state.ridgePeriod,
        iterations: state.iterations,
        grainStrength: state.dermalGrain,
        breakFrequency: state.breakFrequency,
        poreFrequency: state.poreFrequency,
        cutPuzzle: true,
        difficulty: "hard",
        numReal: HARD_TARGET_COUNT,
      };

      const result = generateFullFingerprint(params);
      state.currentResult = result;
      state.targetCount =
        result.puzzle?.realPieces?.length || HARD_TARGET_COUNT;

      // Render Fingerprint with Authentic Tactical Forensic theme
      renderFingerprint(canvas, result, {
        style: "tactical",
        showFlow: state.overlays.showFlow,
        showSingularities: state.overlays.showSingularities,
        showMinutiae: state.overlays.showMinutiae,
        solvedSlots: state.solvedSlots,
      });

      // Prepare target slots on scanner
      renderTargetSlotsOverlay();

      // Prepare and shuffle fragment pieces
      preparePiecesGrid();

      systemStatusText.textContent = `SẴN SÀNG // CHỌN MẢNH #${state.activeSlotIndex}`;
      updateProgressUI();
    } catch (err) {
      console.error("Synthesis error:", err);
      systemStatusText.textContent = "LỖI TỔNG HỢP";
      systemStatusText.className = "meta-val text-danger";
    } finally {
      loader.classList.add("hidden");
    }
  }, 40);
}

function renderTargetSlotsOverlay() {
  targetSlotsContainer.innerHTML = "";
  if (!state.currentResult || !state.currentResult.puzzle) return;

  const realPieces = state.currentResult.puzzle.realPieces;
  realPieces.sort((a, b) => a.orderIndex - b.orderIndex);

  // Dynamically read viewport width (fallback to 374px if hidden/unmounted)
  const viewportWidth =
    targetSlotsContainer.clientWidth || canvas.clientWidth || 374;
  const scale = viewportWidth / 512;

  realPieces.forEach((p) => {
    const slotEl = document.createElement("div");
    slotEl.className = "target-slot";
    slotEl.dataset.order = p.orderIndex;

    const scaledSize = Math.round(p.size * scale);
    slotEl.style.left = `${Math.round(p.x * scale)}px`;
    slotEl.style.top = `${Math.round(p.y * scale)}px`;
    slotEl.style.width = `${scaledSize}px`;
    slotEl.style.height = `${scaledSize}px`;
    slotEl.style.setProperty(
      "--slot-font-size",
      scaledSize <= 42 ? "1.15rem" : "1.3rem",
    );

    const isSolved = state.solvedSlots.has(p.orderIndex);
    const isActive = p.orderIndex === state.activeSlotIndex;

    if (isSolved) {
      slotEl.classList.add("solved");
      const patchCanvas = document.createElement("canvas");
      renderPatchToCanvas(patchCanvas, p.data, p.size, "tactical");
      slotEl.appendChild(patchCanvas);

      const numSpan = document.createElement("span");
      numSpan.className = "slot-number";
      numSpan.textContent = p.orderIndex;
      slotEl.appendChild(numSpan);

      const checkSpan = document.createElement("span");
      checkSpan.className = "slot-badge-check";
      checkSpan.textContent = "✓";
      slotEl.appendChild(checkSpan);
    } else if (isActive) {
      slotEl.classList.add("active");
      slotEl.innerHTML = `
        <span class="slot-corner slot-corner-tl"></span>
        <span class="slot-corner slot-corner-tr"></span>
        <span class="slot-corner slot-corner-bl"></span>
        <span class="slot-corner slot-corner-br"></span>
        <span class="slot-number">${p.orderIndex}</span>
      `;
    } else {
      slotEl.classList.add("inactive");
      slotEl.innerHTML = `<span class="slot-number">${p.orderIndex}</span>`;
    }

    // Allow user to click any unsolved target slot to switch active focus
    slotEl.addEventListener("click", () => {
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
  piecesGrid.innerHTML = "";

  // Hard mode 9-card grid (3x3 layout) dimensions
  piecesGrid.style.setProperty("--card-size", "64px");
  piecesGrid.style.setProperty("--card-gap-y", "8px");
  piecesGrid.style.setProperty("--card-gap-x", "10px");

  // Combine 8 real pieces and 1 decoy
  const allPieces = [...puzzle.realPieces, ...puzzle.decoyPieces];

  // Fisher-Yates shuffle
  for (let i = allPieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = allPieces[i];
    allPieces[i] = allPieces[j];
    allPieces[j] = temp;
  }
  state.piecesShuffled = allPieces;

  allPieces.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "piece-card";
    card.dataset.pieceIdx = idx;

    const pCanvas = document.createElement("canvas");
    renderPatchToCanvas(pCanvas, p.data, p.size, "tactical");
    card.appendChild(pCanvas);

    card.addEventListener("click", () => {
      handlePieceClick(p, card);
    });

    piecesGrid.appendChild(card);
  });

  updatePromptStatus();
}

function handlePieceClick(piece, card) {
  // Prevent race condition if user double-clicks during the 400ms flash animation!
  if (card.classList.contains("solved") || card.dataset.locked === "true")
    return;

  const totalSlots = state.targetCount;
  const currentSlot = state.activeSlotIndex;
  const isMatch = !piece.isDecoy && piece.orderIndex === currentSlot;

  if (isMatch) {
    // Lock card immediately to block accidental double-clicks
    card.dataset.locked = "true";
    state.solvedSlots.add(currentSlot);

    card.classList.add("flash-success");
    setTimeout(() => {
      card.classList.remove("flash-success");
      card.classList.add("solved");
    }, 400);

    showAlert(`✓ KHỚP VỊ TRÍ #${currentSlot} THÀNH CÔNG!`, "success");

    // Find next unsolved slot starting from currentSlot + 1 (wrapping around to 1)
    let nextSlot = null;
    for (let offset = 1; offset <= totalSlots; offset++) {
      const candidate = ((currentSlot - 1 + offset) % totalSlots) + 1;
      if (!state.solvedSlots.has(candidate)) {
        nextSlot = candidate;
        break;
      }
    }

    if (nextSlot !== null) {
      state.activeSlotIndex = nextSlot;
    }

    updateProgressUI();
    renderFingerprint(canvas, state.currentResult, {
      style: "tactical",
      showFlow: state.overlays.showFlow,
      showSingularities: state.overlays.showSingularities,
      showMinutiae: state.overlays.showMinutiae,
      solvedSlots: state.solvedSlots,
    });
    renderTargetSlotsOverlay();
    updatePromptStatus();

    // Check Win Condition: all 8 slots solved
    if (state.solvedSlots.size === totalSlots && totalSlots > 0) {
      triggerVictory();
    }
  } else {
    // WRONG PIECE OR DECOY!
    state.scoreWrong++;
    if (scoreWrongEl) scoreWrongEl.textContent = state.scoreWrong;
    if (hudWrongVal) hudWrongVal.textContent = state.scoreWrong;

    card.classList.add("shake");
    setTimeout(() => card.classList.remove("shake"), 420);

    showAlert(
      `⚠ KHÔNG KHỚP // VUI LÒNG THỬ MẢNH KHÁC CHO VỊ TRÍ #${currentSlot}`,
      "danger",
    );
  }
}

function updatePromptStatus() {
  const totalSlots = state.targetCount;
  if (!systemStatusText) return;

  if (state.solvedSlots.size === totalSlots && totalSlots > 0) {
    systemStatusText.textContent = "ĐÃ MỞ KHÓA";
    systemStatusText.className = "meta-val text-success";
  } else {
    systemStatusText.textContent = `MỤC TIÊU #${state.activeSlotIndex}`;
    systemStatusText.className = "meta-val";
  }
}

function updateProgressUI() {
  const totalSlots = state.targetCount;
  const count = state.solvedSlots.size;
  const percent = Math.min(100, Math.round((count / totalSlots) * 100));

  progressFill.style.width = `${percent}%`;
  progressGlow.style.left = `${percent}%`;
  progressText.textContent = `${count} / ${totalSlots}`;
}

function showAlert(text, type = "danger") {
  alertText.textContent = text;
  alertBanner.className = `alert-banner ${type === "success" ? "text-success" : "text-danger"}`;
  alertBanner.classList.remove("hidden");

  clearTimeout(alertBanner._timeout);
  alertBanner._timeout = setTimeout(() => {
    alertBanner.classList.add("hidden");
  }, 2200);
}

function syncDrawerUI() {
  if (seedInput) seedInput.value = state.seed;
  if (patternSelect) {
    patternSelect.value = state.pattern;
    if (whorlTracingGroup) {
      const isWhorl =
        state.pattern === "plainWhorl" || state.pattern === "whorl";
      whorlTracingGroup.style.display = isWhorl ? "block" : "none";
    }
  }
  if (periodSlider) periodSlider.value = state.ridgePeriod;
  if (periodVal) periodVal.textContent = state.ridgePeriod.toFixed(1) + " px";
  const handBtns = document.querySelectorAll("#hand-control .seg-btn");
  handBtns.forEach((b) =>
    b.classList.toggle("active", b.dataset.hand === state.hand),
  );
}

function randomizeBiometrics() {
  state.seed = Math.floor(Math.random() * 900000) + 100000;
  state.hand = Math.random() < 0.5 ? "right" : "left";
  // Đảm bảo màn mới không trùng kiểu vân của màn vừa chơi
  const otherPatterns = PATTERNS_POOL.filter((p) => p !== state.pattern);
  state.pattern =
    otherPatterns[Math.floor(Math.random() * otherPatterns.length)];
  state.whorlTracing = "random";
  state.rotation = (Math.random() - 0.5) * 18;
  state.aspectRatio = 1.18 + Math.random() * 0.22;
  state.ridgePeriod = Number((3.8 + Math.random() * 0.9).toFixed(1));

  // Đồng bộ lại lên giao diện Drawer nếu người dùng mở ra xem
  syncDrawerUI();
}

function triggerVictory() {
  const totalSlots = state.targetCount;
  winLevel.textContent = String(state.level).padStart(2, "0");
  winWrong.textContent = state.scoreWrong;

  if (winDiff) winDiff.textContent = HARD_LABEL;

  const totalAttempts = totalSlots + state.scoreWrong;
  const accuracy = Math.round((totalSlots / totalAttempts) * 100);
  if (winAccuracy) winAccuracy.textContent = `${accuracy}%`;

  setTimeout(() => {
    victoryModal.classList.remove("hidden");
  }, 700);
}

// Start application
initEvents();
startNewRound();
