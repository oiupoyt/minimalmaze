/**
 * Core game and maze logic for MINIMALMAZE
 * Supports Universal Module Definition (UMD / CommonJS / Browser window)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MinimalMazeCore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Calculates maze grid dimensions for a difficulty between 1 and 1000
   */
  function calcGridDimensions(difficulty) {
    const diff = Math.max(1, Math.min(1000, Math.floor(difficulty || 1)));
    const cells = 2 + Math.floor(((diff - 1) * 48 + 499) / 999);
    const width = 2 * cells + 1;
    const height = 2 * cells + 1;
    return { width, height, cells, difficulty: diff };
  }

  /**
   * Game state engine tracking player position, trail history, steps, and win state
   */
  class GameEngine {
    constructor(width, height, grid, start, end) {
      this.width = width;
      this.height = height;
      this.grid = grid instanceof Uint8Array ? grid : new Uint8Array(grid);
      this.start = [start[0], start[1]];
      this.end = [end[0], end[1]];
      this.reset();
    }

    reset() {
      this.playerPos = [this.start[0], this.start[1]];
      this.trail = [[this.start[0], this.start[1]]];
      this.steps = 0;
      this.isWon = false;
      this.startTime = null;
      this.endTime = null;
      this.timerMode = this.timerMode || "stopwatch"; // "stopwatch" | "countdown" | "hidden"
      this.timeLimitMs = this.timeLimitMs || 0;
    }

    setTimerMode(mode, limitMs) {
      this.timerMode = mode || "stopwatch";
      this.timeLimitMs = Number(limitMs) || 0;
    }

    isTimeExpired() {
      if (this.timerMode === "countdown" && this.startTime && this.timeLimitMs > 0) {
        return (Date.now() - this.startTime) >= this.timeLimitMs;
      }
      return false;
    }

    getRemainingTimeMs() {
      if (this.timerMode === "countdown" && this.timeLimitMs > 0) {
        if (!this.startTime) return this.timeLimitMs;
        const elapsed = (this.endTime || Date.now()) - this.startTime;
        return Math.max(0, this.timeLimitMs - elapsed);
      }
      return 0;
    }

    move(direction) {
      if (this.isWon) {
        return { moved: false, won: true, pos: [...this.playerPos] };
      }

      if (this.isTimeExpired()) {
        return { moved: false, expired: true, won: false, pos: [...this.playerPos] };
      }

      let dx = 0;
      let dy = 0;
      switch (direction.toUpperCase()) {
        case "UP":
        case "ARROWUP":
        case "W":
          dy = -1;
          break;
        case "DOWN":
        case "ARROWDOWN":
        case "S":
          dy = 1;
          break;
        case "LEFT":
        case "ARROWLEFT":
        case "A":
          dx = -1;
          break;
        case "RIGHT":
        case "ARROWRIGHT":
        case "D":
          dx = 1;
          break;
        default:
          return { moved: false, won: false, pos: [...this.playerPos] };
      }

      const nx = this.playerPos[0] + dx;
      const ny = this.playerPos[1] + dy;

      // Bounds checking
      if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) {
        return { moved: false, won: false, pos: [...this.playerPos] };
      }

      // Wall collision check (0 = path, 1 = wall)
      const tileIndex = ny * this.width + nx;
      if (this.grid[tileIndex] !== 0) {
        return { moved: false, won: false, pos: [...this.playerPos] };
      }

      // Valid move
      if (this.startTime === null) {
        this.startTime = Date.now();
      }

      this.playerPos = [nx, ny];
      this.steps += 1;

      // Backtracking trail pruning:
      // If stepping onto the previous tile in trail, pop the current tile
      const prevTile = this.trail.length >= 2 ? this.trail[this.trail.length - 2] : null;
      if (prevTile && prevTile[0] === nx && prevTile[1] === ny) {
        this.trail.pop();
      } else {
        // If stepping onto any earlier visited tile on active path, prune back to that tile
        const existingIdx = this.trail.findIndex((pt) => pt[0] === nx && pt[1] === ny);
        if (existingIdx !== -1) {
          this.trail = this.trail.slice(0, existingIdx + 1);
        } else {
          this.trail.push([nx, ny]);
        }
      }

      // Check win condition
      if (nx === this.end[0] && ny === this.end[1]) {
        this.isWon = true;
        this.endTime = Date.now();
        return { moved: true, won: true, pos: [...this.playerPos] };
      }

      return { moved: true, won: false, pos: [...this.playerPos] };
    }

    getElapsedTimeMs() {
      if (!this.startTime) return 0;
      const end = this.endTime || Date.now();
      return Math.max(0, end - this.startTime);
    }
  }

  /**
   * Instantiate and wrap the Rust WebAssembly engine
   */
  async function loadWasmEngine(wasmBytesOrBuffer) {
    let wasmModule;
    if (wasmBytesOrBuffer instanceof Uint8Array || wasmBytesOrBuffer instanceof ArrayBuffer) {
      const res = await WebAssembly.instantiate(wasmBytesOrBuffer);
      wasmModule = res.instance;
    } else {
      throw new Error("Invalid wasm source provided");
    }

    const {
      generate_maze,
      get_grid_width,
      get_grid_height,
      get_grid_ptr,
      get_grid_len,
      get_solution_ptr,
      get_solution_len,
      get_start_x,
      get_start_y,
      get_end_x,
      get_end_y,
      memory,
    } = wasmModule.exports;

    return {
      generate(difficulty, seed) {
        const seedVal = typeof seed === "bigint" ? seed : BigInt(seed || Date.now());
        generate_maze(difficulty, seedVal);

        const width = get_grid_width();
        const height = get_grid_height();
        const gridPtr = get_grid_ptr();
        const gridLen = get_grid_len();
        const solPtr = get_solution_ptr();
        const solLen = get_solution_len();

        // Copy out arrays so they are stable
        const gridRaw = new Uint8Array(memory.buffer, gridPtr, gridLen);
        const grid = new Uint8Array(gridRaw);

        const solRaw = new Uint32Array(memory.buffer, solPtr, solLen);
        const solution = [];
        for (let i = 0; i < solLen; i++) {
          const val = solRaw[i];
          solution.push([val >> 16, val & 0xffff]);
        }

        return {
          width,
          height,
          grid,
          startX: get_start_x(),
          startY: get_start_y(),
          endX: get_end_x(),
          endY: get_end_y(),
          solution,
        };
      },
    };
  }

  /**
   * Pure JS maze generator fallback when WebAssembly is unavailable
   */
  function generateJsMazeFallback(difficulty, seed) {
    const { width, height, cells, difficulty: diff } = calcGridDimensions(difficulty);
    let s = (seed ? Number(seed) : Date.now()) >>> 0;
    function randNext() {
      s = (s ^ (s << 13)) >>> 0;
      s = (s ^ (s >>> 17)) >>> 0;
      s = (s ^ (s << 5)) >>> 0;
      return s;
    }
    function randInt(max) {
      return max <= 0 ? 0 : Math.floor((randNext() / 0x100000000) * max);
    }

    const grid = new Uint8Array(width * height);
    grid.fill(1); // 1 = wall

    const startCell = [0, 0];
    const startTile = [2 * startCell[0] + 1, 2 * startCell[1] + 1];

    const visited = new Uint8Array(cells * cells);
    const stack = [];

    visited[0] = 1;
    grid[startTile[1] * width + startTile[0]] = 0;
    stack.push([startCell[0], startCell[1], 4]);

    const straightBias = 75 - Math.floor(((diff - 1) * 65) / 999);
    const DIRS = [
      [0, -1], // 0: N
      [1, 0],  // 1: E
      [0, 1],  // 2: S
      [-1, 0], // 3: W
    ];

    while (stack.length > 0) {
      const [cx, cy, lastDir] = stack[stack.length - 1];
      const neighbors = [];

      for (let d = 0; d < 4; d++) {
        const nx = cx + DIRS[d][0];
        const ny = cy + DIRS[d][1];
        if (nx >= 0 && nx < cells && ny >= 0 && ny < cells) {
          if (!visited[ny * cells + nx]) {
            neighbors.push([nx, ny, d]);
          }
        }
      }

      if (neighbors.length === 0) {
        stack.pop();
      } else {
        let chosen;
        const matchingIdx = lastDir < 4 ? neighbors.findIndex((n) => n[2] === lastDir) : -1;
        if (matchingIdx !== -1 && randInt(100) < straightBias) {
          chosen = neighbors[matchingIdx];
        } else {
          chosen = neighbors[randInt(neighbors.length)];
        }

        const [nx, ny, dir] = chosen;
        const wallX = 2 * cx + 1 + DIRS[dir][0];
        const wallY = 2 * cy + 1 + DIRS[dir][1];
        grid[wallY * width + wallX] = 0;
        grid[(2 * ny + 1) * width + (2 * nx + 1)] = 0;

        visited[ny * cells + nx] = 1;
        stack.push([nx, ny, dir]);
      }
    }

    // Solve using BFS to find deepest dead-end or maximum distance tile
    const total = width * height;
    const dist = new Int32Array(total);
    dist.fill(-1);
    const prev = new Int32Array(total);
    prev.fill(-1);
    const queue = [];

    const startIdx = startTile[1] * width + startTile[0];
    dist[startIdx] = 0;
    queue.push(startIdx);

    let maxDist = 0;
    let bestEndIdx = startIdx;

    while (queue.length > 0) {
      const curr = queue.shift();
      const cx = curr % width;
      const cy = Math.floor(curr / width);
      const d = dist[curr];

      let openNeighbors = 0;
      for (let dir = 0; dir < 4; dir++) {
        const nx = cx + DIRS[dir][0];
        const ny = cy + DIRS[dir][1];
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nidx = ny * width + nx;
          if (grid[nidx] === 0) {
            openNeighbors++;
            if (dist[nidx] === -1) {
              dist[nidx] = d + 1;
              prev[nidx] = curr;
              queue.push(nidx);
            }
          }
        }
      }

      const isDeadEnd = openNeighbors <= 1 && curr !== startIdx;
      if (d > maxDist && isDeadEnd) {
        maxDist = d;
        bestEndIdx = curr;
      } else if (d > maxDist && bestEndIdx === startIdx) {
        bestEndIdx = curr;
      }
    }

    const endTile = [bestEndIdx % width, Math.floor(bestEndIdx / width)];
    const solution = [];
    let curr = bestEndIdx;
    while (curr !== -1) {
      solution.push([curr % width, Math.floor(curr / width)]);
      if (curr === startIdx) break;
      curr = prev[curr];
    }
    solution.reverse();

    return {
      width,
      height,
      grid,
      startX: startTile[0],
      startY: startTile[1],
      endX: endTile[0],
      endY: endTile[1],
      solution,
    };
  }

  /**
   * Calculates movement efficiency percentage
   */
  function calcEfficiency(actualSteps, optimalSteps) {
    if (!optimalSteps || optimalSteps <= 0) return 100;
    if (!actualSteps || actualSteps <= 0) return 100;
    const eff = Math.round((optimalSteps / actualSteps) * 100);
    return Math.max(1, Math.min(100, eff));
  }

  return {
    calcGridDimensions,
    GameEngine,
    loadWasmEngine,
    generateJsMazeFallback,
    calcEfficiency,
  };
});

