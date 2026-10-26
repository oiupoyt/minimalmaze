const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

// Import core game logic (to be implemented)
const {
  calcGridDimensions,
  GameEngine,
  loadWasmEngine,
  generateJsMazeFallback,
  calcEfficiency,
} = require("../core_logic.js");

test("Difficulty scaling calculations", () => {
  // Test difficulty 1 -> 5x5
  const d1 = calcGridDimensions(1);
  assert.equal(d1.width, 5);
  assert.equal(d1.height, 5);

  // Test difficulty 1000 -> 101x101
  const d1000 = calcGridDimensions(1000);
  assert.equal(d1000.width, 101);
  assert.equal(d1000.height, 101);

  // Test difficulty 50
  const d50 = calcGridDimensions(50);
  assert.equal(d50.width % 2, 1, "Width must be odd");
  assert.equal(d50.height % 2, 1, "Height must be odd");
  assert.ok(d50.width >= 5 && d50.width <= 101);
});

test("GameEngine movement, collision and win detection", () => {
  // 5x5 maze:
  // 1 1 1 1 1
  // 1 0 0 0 1   (1,1 is start, 3,1 is path)
  // 1 1 1 0 1   (3,2 is path)
  // 1 1 1 0 1   (3,3 is exit)
  // 1 1 1 1 1
  const width = 5;
  const height = 5;
  const grid = new Uint8Array([
    1, 1, 1, 1, 1,
    1, 0, 0, 0, 1,
    1, 1, 1, 0, 1,
    1, 1, 1, 0, 1,
    1, 1, 1, 1, 1,
  ]);
  const start = [1, 1];
  const end = [3, 3];

  const game = new GameEngine(width, height, grid, start, end);

  // Initial state
  assert.deepEqual(game.playerPos, [1, 1]);
  assert.equal(game.steps, 0);
  assert.equal(game.isWon, false);
  assert.equal(game.trail.length, 1);
  assert.deepEqual(game.trail[0], [1, 1]);

  // Try moving UP into wall -> should fail
  const upRes = game.move("UP");
  assert.equal(upRes.moved, false);
  assert.deepEqual(game.playerPos, [1, 1]);
  assert.equal(game.steps, 0);

  // Try moving LEFT into wall -> should fail
  const leftRes = game.move("LEFT");
  assert.equal(leftRes.moved, false);
  assert.deepEqual(game.playerPos, [1, 1]);

  // Move RIGHT into open path (2, 1) -> should succeed
  const r1 = game.move("RIGHT");
  assert.equal(r1.moved, true);
  assert.deepEqual(game.playerPos, [2, 1]);
  assert.equal(game.steps, 1);
  assert.equal(game.trail.length, 2);
  assert.deepEqual(game.trail[1], [2, 1]);

  // Move RIGHT to (3, 1)
  const r2 = game.move("RIGHT");
  assert.equal(r2.moved, true);
  assert.deepEqual(game.playerPos, [3, 1]);

  // Move DOWN to (3, 2)
  const d1 = game.move("DOWN");
  assert.equal(d1.moved, true);
  assert.deepEqual(game.playerPos, [3, 2]);
  assert.equal(game.isWon, false);

  // Move DOWN to (3, 3) -> reaches exit, triggers WIN
  const d2 = game.move("DOWN");
  assert.equal(d2.moved, true);
  assert.equal(d2.won, true);
  assert.equal(game.isWon, true);
  assert.deepEqual(game.playerPos, [3, 3]);

  // Moving after win should be locked
  const extraMove = game.move("UP");
  assert.equal(extraMove.moved, false);
});

test("Wasm engine integration loads and generates solvable maze", async () => {
  const wasmPath = path.resolve(__dirname, "../engine.wasm");
  const wasmBytes = fs.readFileSync(wasmPath);
  const engine = await loadWasmEngine(wasmBytes);

  const maze = engine.generate(100, 42n);
  assert.ok(maze.width > 0);
  assert.ok(maze.height > 0);
  assert.equal(maze.grid.length, maze.width * maze.height);
  assert.ok(maze.solution.length > 0);
  assert.deepEqual(maze.solution[0], [maze.startX, maze.startY]);
  assert.deepEqual(maze.solution[maze.solution.length - 1], [maze.endX, maze.endY]);
});

test("Pure JS generator fallback produces solvable maze", () => {
  const maze = generateJsMazeFallback(50, 99999);
  assert.ok(maze.width >= 5 && maze.width <= 101);
  assert.equal(maze.grid.length, maze.width * maze.height);
  assert.equal(maze.grid[maze.startY * maze.width + maze.startX], 0);
  assert.equal(maze.grid[maze.endY * maze.width + maze.endX], 0);
  assert.ok(maze.solution.length > 0);
});

test("calcEfficiency formula accuracy", () => {
  assert.equal(calcEfficiency(10, 10), 100);
  assert.equal(calcEfficiency(20, 10), 50);
  assert.equal(calcEfficiency(5, 10), 100);
  assert.equal(calcEfficiency(0, 10), 100);
});

