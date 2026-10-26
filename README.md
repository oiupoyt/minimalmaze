# MINIMALMAZE

A fast, low-latency, 2D top-down maze generation and solving web application powered by a Rust WebAssembly core engine following the **KAT Square Minimalist** design standard.

![License](https://img.shields.io/badge/license-MIT-blue)
![Rust](https://img.shields.io/badge/engine-Rust%20Wasm-orange)
![Design](https://img.shields.io/badge/theme-KAT%20Square%20Minimalist-black)

---

## Features

- **Rust WebAssembly Core (`wasm32-unknown-unknown`)**: Algorithmic Recursive Backtracker maze generation with BFS pathfinder compiled directly to WebAssembly (< 31 KB binary, sub-millisecond generation times).
- **Difficulty Scaling (1–1000)**: Smooth two-tier difficulty scaling mapping from simple 5×5 corridor mazes up to dense 101×101 labyrinths, with algorithmic corridor straightness bias adjusting dynamically.
- **Player Trail Tracking**: Electric cyan avatar (`#38bdf8`) with automated path trail highlighting visited corridors and backtrack detection.
- **Cross-Platform Low Latency Controls**:
  - **Mobile**: Fullscreen edge-tap quadrants (`▲`, `▼`, `◀`, `▶`), touch swipe gestures, and viewport auto-fit (`100dvh`).
  - **Desktop**: `WASD` & Arrow keys, direct cell click-to-step, quick hotkeys (`R` to regenerate, `F` for fullscreen).
- **High-Resolution PNG Export**: Downloadable crisp maze image exports (1024px or 2048px print resolution) supporting:
  - Printable Black & White mode (for paper puzzle printing).
  - Dark Obsidian theme mode.
  - Optional shortest-path solution overlay and player trail overlay.
- **KAT Square Minimalist Aesthetics**: Razor-sharp `border-radius: 0 !important;`, obsidian dark palette (`#0b0b0b`), JetBrains Mono monospace typography, hairline borders, and tactical tabular metrics HUD.
- **Zero Single Point of Failure**: Dual-layered engine with native Wasm streaming, embedded base64 fallback (offline `file://` compatibility), and pure JavaScript generator fallback.

---

## Directory Structure

```
minimalmaze/
├── engine/              # Rust core crate
│   ├── Cargo.toml       # Cargo manifest (cdylib + rlib)
│   └── src/
│       └── lib.rs       # Maze generation, BFS solver, PRNG, FFI exports & unit tests
├── tests/               # Test suites
│   └── game_logic.test.js # Node.js test runner suite
├── core_logic.js        # Universal core logic & Wasm wrapper
├── app.js               # Canvas 2D renderer, input handling, HUD loop
├── style.css            # KAT Square Minimalist styles
├── index.html           # Main application entry point
├── engine.wasm          # Precompiled release WebAssembly binary (31KB)
├── wasm_embedded.js     # Embedded fallback base64 binary
└── build.sh             # Build script for Rust Wasm compilation
```

---

## Quick Start

### Running Locally
You can serve the static files with any local HTTP server:

```bash
# Using Node.js
npx serve minimalmaze

# Or Python
python3 -m http.server 8080 --directory minimalmaze
```

Open `http://localhost:8080` in any modern web browser.

### Building the Rust Engine
Requires Rust toolchain with `wasm32-unknown-unknown` target:

```bash
rustup target add wasm32-unknown-unknown
./build.sh
```

---

## Controls

| Action | Mobile | Desktop |
|---|---|---|
| Move Up | Tap top screen quadrant / Swipe up | `W` or `↑` |
| Move Down | Tap bottom screen quadrant / Swipe down | `S` or `↓` |
| Move Left | Tap left screen quadrant / Swipe left | `A` or `←` |
| Move Right | Tap right screen quadrant / Swipe right | `D` or `→` |
| Regenerate | `[ REGENERATE ]` button | `R` key |
| Toggle Fullscreen | `[ FULLSCREEN ]` button | `F` key |
| Show / Hide Solution | `[ SHOW SOLUTION ]` | Click button |
| Export PNG | `[ DOWNLOAD PNG ]` | Click button |

---

## Verification & Tests

```bash
# Run Rust unit tests (solvability, scale, performance)
cd engine && cargo test

# Run JavaScript integration tests (movement, collision, wasm loading, formulas)
node --test tests/game_logic.test.js
```
