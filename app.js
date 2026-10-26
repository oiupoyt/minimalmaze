/**
 * MINIMALMAZE - Application Runtime & Ultra-Low Latency Canvas Renderer
 */
(function () {
  "use strict";

  const { calcGridDimensions, GameEngine, loadWasmEngine, generateJsMazeFallback, calcEfficiency } =
    window.MinimalMazeCore;

  // DOM Elements
  const canvas = document.getElementById("mazeCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const viewportContainer = document.getElementById("viewportContainer");
  const canvasWrapper = document.getElementById("canvasWrapper");

  // Hero Timer & Status
  const heroTimerContainer = document.getElementById("heroTimerContainer");
  const timerModeTag = document.getElementById("timerModeTag");
  const heroTime = document.getElementById("heroTime");
  const btnCycleTimer = document.getElementById("btnCycleTimer");

  // Tactical HUD
  const hudDiff = document.getElementById("hudDiff");
  const hudGrid = document.getElementById("hudGrid");
  const hudSteps = document.getElementById("hudSteps");

  // Controls & Inputs
  const diffSlider = document.getElementById("diffSlider");
  const diffInput = document.getElementById("diffInput");
  const diffValueDisplay = document.getElementById("diffValueDisplay");
  const presetButtons = document.querySelectorAll(".btn-preset");
  const btnRegenerate = document.getElementById("btnRegenerate");
  const btnResetPlayer = document.getElementById("btnResetPlayer");
  const btnToggleSolution = document.getElementById("btnToggleSolution");
  const btnFullscreen = document.getElementById("btnFullscreen");
  const btnDownloadPng = document.getElementById("btnDownloadPng");

  // Timer Mode Controls
  const btnModeStopwatch = document.getElementById("btnModeStopwatch");
  const btnModeCountdown = document.getElementById("btnModeCountdown");
  const btnModeHidden = document.getElementById("btnModeHidden");
  const countdownLimitRow = document.getElementById("countdownLimitRow");
  const countdownLimitInput = document.getElementById("countdownLimitInput");
  const btnAutoCountdown = document.getElementById("btnAutoCountdown");

  // Edge Touch Buttons
  const tapUp = document.getElementById("tapUp");
  const tapDown = document.getElementById("tapDown");
  const tapLeft = document.getElementById("tapLeft");
  const tapRight = document.getElementById("tapRight");

  // Win & Expired Banners
  const winBanner = document.getElementById("winBanner");
  const winTime = document.getElementById("winTime");
  const winSteps = document.getElementById("winSteps");
  const winOptimal = document.getElementById("winOptimal");
  const winEff = document.getElementById("winEff");
  const btnNextLevel = document.getElementById("btnNextLevel");
  const btnPlayAgain = document.getElementById("btnPlayAgain");
  const btnWinDownload = document.getElementById("btnWinDownload");

  const expiredBanner = document.getElementById("expiredBanner");
  const btnRetryExpired = document.getElementById("btnRetryExpired");
  const btnSwitchStopwatch = document.getElementById("btnSwitchStopwatch");

  // Export Modal
  const exportModal = document.getElementById("exportModal");
  const btnExportClose = document.getElementById("btnExportClose");
  const btnCancelDownload = document.getElementById("btnCancelDownload");
  const btnConfirmDownload = document.getElementById("btnConfirmDownload");
  const chkIncludeSolution = document.getElementById("chkIncludeSolution");
  const chkIncludePlayerTrail = document.getElementById("chkIncludePlayerTrail");

  // Offscreen static canvas for zero-latency blitting
  const staticCanvas = document.createElement("canvas");
  const staticCtx = staticCanvas.getContext("2d", { alpha: false });

  // State Variables
  let wasmEngine = null;
  let currentDifficulty = 50;
  let currentMaze = null;
  let game = null;
  let showSolution = false;
  let animFrameId = null;
  let lastTouchPos = null;

  // Timer State: "stopwatch" | "countdown" | "hidden"
  let timerMode = "stopwatch";
  let countdownLimitSec = 60;

  // Calculate a balanced countdown limit based on difficulty
  function getAutoCountdownSec(diff) {
    if (diff <= 10) return 15;
    if (diff <= 50) return 30;
    if (diff <= 150) return 60;
    if (diff <= 350) return 120;
    if (diff <= 650) return 240;
    return 360;
  }

  // Timing format helper (MM:SS.t)
  function formatTime(ms) {
    const totalSecs = ms / 1000;
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.floor(totalSecs % 60);
    const tenths = Math.floor((ms % 1000) / 100);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
  }

  // Initialize WebAssembly Engine
  async function initWasm() {
    // 1. Try streaming/fetch of engine.wasm
    try {
      const response = await fetch("engine.wasm");
      if (response.ok) {
        const bytes = await response.arrayBuffer();
        wasmEngine = await loadWasmEngine(bytes);
        return;
      }
    } catch (e) {
      console.warn("Direct fetch of engine.wasm failed, falling back to embedded binary...", e);
    }

    // 2. Try embedded base64 fallback (for file:// protocol)
    if (window.__EMBEDDED_WASM_BASE64__) {
      try {
        const binStr = atob(window.__EMBEDDED_WASM_BASE64__);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        wasmEngine = await loadWasmEngine(bytes);
        return;
      } catch (e) {
        console.error("Embedded wasm load failed:", e);
      }
    }

    // 3. Fallback to pure JavaScript engine
    console.info("Using pure JavaScript engine fallback");
    wasmEngine = {
      generate(diff, seed) {
        return generateJsMazeFallback(diff, seed);
      },
    };
  }

  // Set Timer Mode
  function setTimerMode(mode) {
    timerMode = mode;
    btnModeStopwatch.classList.toggle("active", mode === "stopwatch");
    btnModeCountdown.classList.toggle("active", mode === "countdown");
    btnModeHidden.classList.toggle("active", mode === "hidden");

    if (mode === "countdown") {
      countdownLimitRow.classList.remove("hidden");
      timerModeTag.textContent = "COUNTDOWN";
      btnCycleTimer.textContent = "[ TIMER: DOWN ]";
      heroTimerContainer.classList.remove("hidden");
    } else if (mode === "hidden") {
      countdownLimitRow.classList.add("hidden");
      btnCycleTimer.textContent = "[ TIMER: HIDE ]";
      heroTimerContainer.classList.add("hidden");
    } else {
      countdownLimitRow.classList.add("hidden");
      timerModeTag.textContent = "STOPWATCH";
      btnCycleTimer.textContent = "[ TIMER: WATCH ]";
      heroTimerContainer.classList.remove("hidden");
    }

    if (game) {
      game.setTimerMode(mode, countdownLimitSec * 1000);
      updateTimerDisplay();
    }
  }

  function cycleTimerMode() {
    if (timerMode === "stopwatch") setTimerMode("countdown");
    else if (timerMode === "countdown") setTimerMode("hidden");
    else setTimerMode("stopwatch");
  }

  // Generate Maze & Reset Game State
  function createMaze(difficulty) {
    currentDifficulty = Math.max(1, Math.min(1000, Math.floor(difficulty || currentDifficulty)));
    updateDifficultyUI();

    const seed = BigInt(Math.floor(Math.random() * 1000000000) + 1);
    currentMaze = wasmEngine.generate(currentDifficulty, seed);

    game = new GameEngine(
      currentMaze.width,
      currentMaze.height,
      currentMaze.grid,
      [currentMaze.startX, currentMaze.startY],
      [currentMaze.endX, currentMaze.endY]
    );

    // Auto-update countdown limit if in auto mode
    countdownLimitSec = parseInt(countdownLimitInput.value, 10) || getAutoCountdownSec(currentDifficulty);
    countdownLimitInput.value = countdownLimitSec;
    game.setTimerMode(timerMode, countdownLimitSec * 1000);

    showSolution = false;
    btnToggleSolution.textContent = "[ SHOW SOLUTION ]";
    winBanner.classList.add("hidden");
    expiredBanner.classList.add("hidden");
    heroTimerContainer.classList.remove("warning");

    hudDiff.textContent = currentDifficulty;
    hudGrid.textContent = `${currentMaze.width}x${currentMaze.height}`;
    hudSteps.textContent = "0";
    updateTimerDisplay();

    rebuildStaticCacheAndRender();
  }

  function updateDifficultyUI() {
    diffSlider.value = currentDifficulty;
    diffInput.value = currentDifficulty;
    diffValueDisplay.textContent = String(currentDifficulty).padStart(3, "0");
  }

  // Handle Player Movement
  function handleMove(direction) {
    if (!game || game.isWon || game.isTimeExpired()) return;

    const result = game.move(direction);
    if (result.moved) {
      hudSteps.textContent = game.steps;
      renderDynamic();

      if (result.won) {
        onGameWin();
      }
    } else if (result.expired) {
      onTimeExpired();
    }
  }

  function onGameWin() {
    const elapsedMs = game.getElapsedTimeMs();
    const optimalLen = currentMaze.solution ? currentMaze.solution.length - 1 : 0;
    const eff = calcEfficiency(game.steps, optimalLen);

    winTime.textContent = formatTime(elapsedMs);
    winSteps.textContent = game.steps;
    winOptimal.textContent = optimalLen;
    winEff.textContent = `${eff}%`;

    // Auto-reveal optimal route
    showSolution = true;
    btnToggleSolution.textContent = "[ HIDE SOLUTION ]";
    renderDynamic();

    winBanner.classList.remove("hidden");
  }

  function onTimeExpired() {
    expiredBanner.classList.remove("hidden");
    heroTimerContainer.classList.add("warning");
    heroTime.textContent = "00:00.0";
    renderDynamic();
  }

  // Pre-render static background (passages, walls, subconscious grid, start/end marks)
  // Run ONLY on maze generation or viewport resize for maximum performance!
  function rebuildStaticCacheAndRender() {
    if (!currentMaze) return;

    const rect = viewportContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const padding = 24;
    const availW = Math.max(100, rect.width - padding);
    const availH = Math.max(100, rect.height - padding);

    const size = Math.min(availW, availH);
    const cellSize = Math.floor(size / currentMaze.width);
    const actualWidth = cellSize * currentMaze.width;
    const actualHeight = cellSize * currentMaze.height;

    // Set canvas dimensions
    canvas.width = Math.floor(actualWidth * dpr);
    canvas.height = Math.floor(actualHeight * dpr);
    canvas.style.width = `${actualWidth}px`;
    canvas.style.height = `${actualHeight}px`;

    // Offscreen canvas setup
    staticCanvas.width = canvas.width;
    staticCanvas.height = canvas.height;

    const w = currentMaze.width;
    const h = currentMaze.height;
    const drawCellSize = cellSize * dpr;

    // 1. Clear background (Passages)
    staticCtx.fillStyle = "#0a0a0a";
    staticCtx.fillRect(0, 0, staticCanvas.width, staticCanvas.height);

    // 2. Draw Walls
    staticCtx.fillStyle = "#1e1e1e";
    const grid = currentMaze.grid;
    for (let y = 0; y < h; y++) {
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        if (grid[rowOffset + x] === 1) {
          staticCtx.fillRect(
            Math.floor(x * drawCellSize),
            Math.floor(y * drawCellSize),
            Math.ceil(drawCellSize),
            Math.ceil(drawCellSize)
          );
        }
      }
    }

    // 3. Subtle Subconscious Hairline Grid (tiny faint white lines for each box)
    staticCtx.strokeStyle = "rgba(255, 255, 255, 0.045)";
    staticCtx.lineWidth = 1;
    staticCtx.beginPath();
    for (let x = 0; x <= w; x++) {
      const px = Math.floor(x * drawCellSize) + 0.5;
      staticCtx.moveTo(px, 0);
      staticCtx.lineTo(px, staticCanvas.height);
    }
    for (let y = 0; y <= h; y++) {
      const py = Math.floor(y * drawCellSize) + 0.5;
      staticCtx.moveTo(0, py);
      staticCtx.lineTo(staticCanvas.width, py);
    }
    staticCtx.stroke();

    // 4. Start & End Markers
    // Start (Emerald)
    staticCtx.fillStyle = "rgba(16, 185, 129, 0.28)";
    staticCtx.fillRect(
      Math.floor(currentMaze.startX * drawCellSize),
      Math.floor(currentMaze.startY * drawCellSize),
      Math.ceil(drawCellSize),
      Math.ceil(drawCellSize)
    );
    staticCtx.strokeStyle = "#10b981";
    staticCtx.lineWidth = Math.max(1, drawCellSize * 0.12);
    staticCtx.strokeRect(
      Math.floor(currentMaze.startX * drawCellSize) + 0.5,
      Math.floor(currentMaze.startY * drawCellSize) + 0.5,
      Math.ceil(drawCellSize) - 1,
      Math.ceil(drawCellSize) - 1
    );

    // End / Exit (Amber / Target)
    staticCtx.fillStyle = "rgba(245, 158, 11, 0.28)";
    staticCtx.fillRect(
      Math.floor(currentMaze.endX * drawCellSize),
      Math.floor(currentMaze.endY * drawCellSize),
      Math.ceil(drawCellSize),
      Math.ceil(drawCellSize)
    );
    staticCtx.strokeStyle = "#f59e0b";
    staticCtx.lineWidth = Math.max(1, drawCellSize * 0.12);
    staticCtx.strokeRect(
      Math.floor(currentMaze.endX * drawCellSize) + 0.5,
      Math.floor(currentMaze.endY * drawCellSize) + 0.5,
      Math.ceil(drawCellSize) - 1,
      Math.ceil(drawCellSize) - 1
    );

    renderDynamic();
  }

  // Dynamic Layer: Blits cached static canvas and draws active trail and player cube (< 0.05ms)
  function renderDynamic() {
    if (!currentMaze || !game) return;

    // 1. Instant GPU blit of entire static maze
    ctx.drawImage(staticCanvas, 0, 0);

    const dpr = window.devicePixelRatio || 1;
    const w = currentMaze.width;
    const rect = canvas.getBoundingClientRect();
    const cellSize = (rect.width * dpr) / w;

    // 2. Shortest Path Solution (Auto-revealed on win or when toggled)
    if (showSolution && currentMaze.solution && currentMaze.solution.length > 0) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = Math.max(2 * dpr, cellSize * 0.32);
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";
      ctx.beginPath();
      for (let i = 0; i < currentMaze.solution.length; i++) {
        const [sx, sy] = currentMaze.solution[i];
        const px = (sx + 0.5) * cellSize;
        const py = (sy + 0.5) * cellSize;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // 3. Player Trail (Prunes automatically on backtrack)
    if (game.trail && game.trail.length > 1) {
      ctx.fillStyle = "rgba(56, 189, 248, 0.24)";
      for (let i = 0; i < game.trail.length; i++) {
        const [tx, ty] = game.trail[i];
        ctx.fillRect(
          Math.floor(tx * cellSize),
          Math.floor(ty * cellSize),
          Math.ceil(cellSize),
          Math.ceil(cellSize)
        );
      }

      ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
      ctx.lineWidth = Math.max(1.5 * dpr, cellSize * 0.28);
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";
      ctx.beginPath();
      for (let i = 0; i < game.trail.length; i++) {
        const [tx, ty] = game.trail[i];
        const px = (tx + 0.5) * cellSize;
        const py = (ty + 0.5) * cellSize;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // 4. Player Cube (Simplified, razor-sharp clean solid cyan square)
    const [px, py] = game.playerPos;
    const pMargin = Math.max(1 * dpr, cellSize * 0.14);
    const pSize = Math.max(2 * dpr, cellSize - 2 * pMargin);
    const playerLeft = Math.floor(px * cellSize + pMargin);
    const playerTop = Math.floor(py * cellSize + pMargin);

    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(playerLeft, playerTop, pSize, pSize);
  }

  // Update Hero Timer UI
  function updateTimerDisplay() {
    if (!game) return;

    if (timerMode === "countdown") {
      const remainingMs = game.getRemainingTimeMs();
      heroTime.textContent = formatTime(remainingMs);
      if (game.startTime && remainingMs <= 10000 && remainingMs > 0) {
        heroTimerContainer.classList.add("warning");
      } else {
        heroTimerContainer.classList.remove("warning");
      }
    } else if (timerMode === "stopwatch") {
      const elapsedMs = game.getElapsedTimeMs();
      heroTime.textContent = formatTime(elapsedMs);
      heroTimerContainer.classList.remove("warning");
    }
  }

  // Animation Frame Loop for Timer
  function startLoop() {
    function tick() {
      if (game && !game.isWon && game.startTime) {
        if (timerMode === "countdown" && game.isTimeExpired()) {
          onTimeExpired();
        } else {
          updateTimerDisplay();
        }
      }
      animFrameId = requestAnimationFrame(tick);
    }
    animFrameId = requestAnimationFrame(tick);
  }

  // Keyboard Navigation
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") {
      if (e.key === "Enter") {
        e.target.blur();
        createMaze(parseInt(diffInput.value, 10));
      }
      return;
    }

    switch (e.key) {
      case "ArrowUp":
      case "w":
      case "W":
        e.preventDefault();
        handleMove("UP");
        break;
      case "ArrowDown":
      case "s":
      case "S":
        e.preventDefault();
        handleMove("DOWN");
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        e.preventDefault();
        handleMove("LEFT");
        break;
      case "ArrowRight":
      case "d":
      case "D":
        e.preventDefault();
        handleMove("RIGHT");
        break;
      case "r":
      case "R":
        e.preventDefault();
        createMaze();
        break;
      case "f":
      case "F":
        e.preventDefault();
        toggleFullscreen();
        break;
      case "t":
      case "T":
        e.preventDefault();
        cycleTimerMode();
        break;
      case "Escape":
        exportModal.classList.add("hidden");
        break;
    }
  });

  // Mobile / Touch Controls
  function bindTouchButton(btn, direction) {
    if (!btn) return;
    const trigger = (e) => {
      e.preventDefault();
      handleMove(direction);
    };
    btn.addEventListener("touchstart", trigger, { passive: false });
    btn.addEventListener("mousedown", trigger);
  }

  bindTouchButton(tapUp, "UP");
  bindTouchButton(tapDown, "DOWN");
  bindTouchButton(tapLeft, "LEFT");
  bindTouchButton(tapRight, "RIGHT");

  // Swipe Gestures on Canvas
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        lastTouchPos = { x: t.clientX, y: t.clientY };
      }
    },
    { passive: true }
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      if (!lastTouchPos || e.changedTouches.length === 0) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - lastTouchPos.x;
      const dy = t.clientY - lastTouchPos.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const threshold = 16;

      if (Math.max(absX, absY) > threshold) {
        if (absX > absY) {
          handleMove(dx > 0 ? "RIGHT" : "LEFT");
        } else {
          handleMove(dy > 0 ? "DOWN" : "UP");
        }
      }
      lastTouchPos = null;
    },
    { passive: true }
  );

  // Direct Click on Maze to Step
  canvas.addEventListener("click", (e) => {
    if (!currentMaze || !game || game.isWon || game.isTimeExpired()) return;
    const rect = canvas.getBoundingClientRect();
    const cellSize = rect.width / currentMaze.width;
    const clickX = Math.floor((e.clientX - rect.left) / cellSize);
    const clickY = Math.floor((e.clientY - rect.top) / cellSize);

    const [px, py] = game.playerPos;
    const dx = clickX - px;
    const dy = clickY - py;

    if (Math.abs(dx) + Math.abs(dy) === 1) {
      if (dx === 1) handleMove("RIGHT");
      else if (dx === -1) handleMove("LEFT");
      else if (dy === 1) handleMove("DOWN");
      else if (dy === -1) handleMove("UP");
    }
  });

  // UI Button Events
  btnRegenerate.addEventListener("click", () => createMaze());
  btnResetPlayer.addEventListener("click", () => {
    if (game) {
      game.reset();
      hudSteps.textContent = "0";
      updateTimerDisplay();
      winBanner.classList.add("hidden");
      expiredBanner.classList.add("hidden");
      heroTimerContainer.classList.remove("warning");
      renderDynamic();
    }
  });

  btnToggleSolution.addEventListener("click", () => {
    showSolution = !showSolution;
    btnToggleSolution.textContent = showSolution ? "[ HIDE SOLUTION ]" : "[ SHOW SOLUTION ]";
    renderDynamic();
  });

  // Timer Mode Selectors
  btnModeStopwatch.addEventListener("click", () => setTimerMode("stopwatch"));
  btnModeCountdown.addEventListener("click", () => setTimerMode("countdown"));
  btnModeHidden.addEventListener("click", () => setTimerMode("hidden"));
  btnCycleTimer.addEventListener("click", cycleTimerMode);

  countdownLimitInput.addEventListener("change", (e) => {
    countdownLimitSec = Math.max(5, parseInt(e.target.value, 10) || 60);
    if (game) game.setTimerMode("countdown", countdownLimitSec * 1000);
    updateTimerDisplay();
  });

  btnAutoCountdown.addEventListener("click", () => {
    countdownLimitSec = getAutoCountdownSec(currentDifficulty);
    countdownLimitInput.value = countdownLimitSec;
    if (game) game.setTimerMode("countdown", countdownLimitSec * 1000);
    updateTimerDisplay();
  });

  btnRetryExpired.addEventListener("click", () => {
    if (game) {
      game.reset();
      expiredBanner.classList.add("hidden");
      heroTimerContainer.classList.remove("warning");
      hudSteps.textContent = "0";
      updateTimerDisplay();
      renderDynamic();
    }
  });

  btnSwitchStopwatch.addEventListener("click", () => {
    setTimerMode("stopwatch");
    if (game) {
      game.reset();
      expiredBanner.classList.add("hidden");
      heroTimerContainer.classList.remove("warning");
      hudSteps.textContent = "0";
      updateTimerDisplay();
      renderDynamic();
    }
  });

  // Difficulty slider & input syncing
  diffSlider.addEventListener("input", (e) => {
    currentDifficulty = parseInt(e.target.value, 10);
    updateDifficultyUI();
  });
  diffSlider.addEventListener("change", () => createMaze(currentDifficulty));

  diffInput.addEventListener("change", (e) => {
    currentDifficulty = Math.max(1, Math.min(1000, parseInt(e.target.value, 10) || 50));
    updateDifficultyUI();
    createMaze(currentDifficulty);
  });

  // Difficulty presets
  presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const diff = parseInt(btn.dataset.diff, 10);
      createMaze(diff);
    });
  });

  // Fullscreen Toggle
  function toggleFullscreen() {
    const root = document.getElementById("app");
    if (!document.fullscreenElement) {
      if (root.requestFullscreen) {
        root.requestFullscreen().catch(() => {
          root.classList.toggle("fullscreen");
          rebuildStaticCacheAndRender();
        });
      } else {
        root.classList.toggle("fullscreen");
        rebuildStaticCacheAndRender();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      root.classList.remove("fullscreen");
    }
  }

  btnFullscreen.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => {
    const root = document.getElementById("app");
    if (document.fullscreenElement) {
      btnFullscreen.textContent = "[ EXIT FULLSCREEN ]";
    } else {
      root.classList.remove("fullscreen");
      btnFullscreen.textContent = "[ FULLSCREEN ]";
    }
    setTimeout(rebuildStaticCacheAndRender, 50);
  });

  // Win Actions
  btnNextLevel.addEventListener("click", () => {
    const nextDiff = Math.min(1000, currentDifficulty + 50);
    createMaze(nextDiff);
  });
  btnPlayAgain.addEventListener("click", () => {
    if (game) {
      game.reset();
      winBanner.classList.add("hidden");
      hudSteps.textContent = "0";
      showSolution = false;
      btnToggleSolution.textContent = "[ SHOW SOLUTION ]";
      updateTimerDisplay();
      renderDynamic();
    }
  });
  btnWinDownload.addEventListener("click", () => {
    openExportModal();
  });

  // Export Modal Management
  function openExportModal() {
    exportModal.classList.remove("hidden");
  }
  function closeExportModal() {
    exportModal.classList.add("hidden");
  }

  btnDownloadPng.addEventListener("click", openExportModal);
  btnExportClose.addEventListener("click", closeExportModal);
  btnCancelDownload.addEventListener("click", closeExportModal);

  // PNG High-Res Generator & Download
  btnConfirmDownload.addEventListener("click", () => {
    const styleChoice = document.querySelector('input[name="exportStyle"]:checked').value;
    const targetResolution = parseInt(
      document.querySelector('input[name="exportScale"]:checked').value,
      10
    );
    const withSolution = chkIncludeSolution.checked;
    const withTrail = chkIncludePlayerTrail.checked;

    generatePngExport({
      style: styleChoice,
      resolution: targetResolution,
      includeSolution: withSolution,
      includeTrail: withTrail,
    });

    closeExportModal();
  });

  function generatePngExport({ style, resolution, includeSolution, includeTrail }) {
    if (!currentMaze) return;

    const exportCanvas = document.createElement("canvas");
    const expCtx = exportCanvas.getContext("2d");

    const w = currentMaze.width;
    const h = currentMaze.height;
    const cellSize = Math.floor(resolution / w);
    const finalSize = cellSize * w;

    exportCanvas.width = finalSize;
    exportCanvas.height = finalSize;

    const isPrint = style === "print";

    // Colors
    const bgFill = isPrint ? "#ffffff" : "#0b0b0b";
    const wallFill = isPrint ? "#000000" : "#1e1e1e";
    const startFill = "#10b981";
    const endFill = isPrint ? "#dc2626" : "#f59e0b";
    const trailFill = isPrint ? "rgba(0, 0, 0, 0.15)" : "rgba(56, 189, 248, 0.3)";
    const trailLine = isPrint ? "rgba(0, 0, 0, 0.6)" : "rgba(56, 189, 248, 0.85)";
    const solLine = isPrint ? "#2563eb" : "#ef4444";

    // 1. Background
    expCtx.fillStyle = bgFill;
    expCtx.fillRect(0, 0, finalSize, finalSize);

    // 2. Walls
    expCtx.fillStyle = wallFill;
    for (let y = 0; y < h; y++) {
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        if (currentMaze.grid[rowOffset + x] === 1) {
          expCtx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }

    // 3. Subtle Subconscious Grid Lines
    expCtx.strokeStyle = isPrint ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.05)";
    expCtx.lineWidth = 1;
    expCtx.beginPath();
    for (let x = 0; x <= w; x++) {
      const px = x * cellSize + 0.5;
      expCtx.moveTo(px, 0);
      expCtx.lineTo(px, finalSize);
    }
    for (let y = 0; y <= h; y++) {
      const py = y * cellSize + 0.5;
      expCtx.moveTo(0, py);
      expCtx.lineTo(finalSize, py);
    }
    expCtx.stroke();

    // 4. Start & End
    expCtx.fillStyle = startFill;
    expCtx.fillRect(
      currentMaze.startX * cellSize,
      currentMaze.startY * cellSize,
      cellSize,
      cellSize
    );

    expCtx.fillStyle = endFill;
    expCtx.fillRect(
      currentMaze.endX * cellSize,
      currentMaze.endY * cellSize,
      cellSize,
      cellSize
    );

    // 5. Solution path if requested
    if (includeSolution && currentMaze.solution && currentMaze.solution.length > 0) {
      expCtx.strokeStyle = solLine;
      expCtx.lineWidth = Math.max(2, cellSize * 0.32);
      expCtx.lineCap = "square";
      expCtx.lineJoin = "miter";
      expCtx.beginPath();
      for (let i = 0; i < currentMaze.solution.length; i++) {
        const [sx, sy] = currentMaze.solution[i];
        const px = (sx + 0.5) * cellSize;
        const py = (sy + 0.5) * cellSize;
        if (i === 0) expCtx.moveTo(px, py);
        else expCtx.lineTo(px, py);
      }
      expCtx.stroke();
    }

    // 6. Player trail if requested
    if (includeTrail && game && game.trail && game.trail.length > 0) {
      expCtx.fillStyle = trailFill;
      for (let i = 0; i < game.trail.length; i++) {
        const [tx, ty] = game.trail[i];
        expCtx.fillRect(tx * cellSize, ty * cellSize, cellSize, cellSize);
      }
      expCtx.strokeStyle = trailLine;
      expCtx.lineWidth = Math.max(2, cellSize * 0.28);
      expCtx.lineCap = "square";
      expCtx.lineJoin = "miter";
      expCtx.beginPath();
      for (let i = 0; i < game.trail.length; i++) {
        const [tx, ty] = game.trail[i];
        const px = (tx + 0.5) * cellSize;
        const py = (ty + 0.5) * cellSize;
        if (i === 0) expCtx.moveTo(px, py);
        else expCtx.lineTo(px, py);
      }
      expCtx.stroke();
    }

    // Trigger download
    const filename = `minimalmaze-diff${currentDifficulty}-${w}x${h}-${Date.now()}.png`;
    const link = document.createElement("a");
    link.download = filename;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }

  // Handle Window Resize
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuildStaticCacheAndRender, 60);
  });

  // App Initialization
  async function boot() {
    await initWasm();
    createMaze(50);
    startLoop();
  }

  boot();
})();
