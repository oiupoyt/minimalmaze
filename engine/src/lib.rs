use std::collections::VecDeque;
use std::sync::Mutex;

/// Fast, dependency-free XorShift64 PRNG
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(mut seed: u64) -> Self {
        if seed == 0 {
            seed = 0x853c49e6748fea9b;
        }
        Self { state: seed }
    }

    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        x
    }

    #[inline]
    pub fn next_usize(&mut self, max: usize) -> usize {
        if max == 0 {
            0
        } else {
            (self.next_u64() % (max as u64)) as usize
        }
    }
}

pub struct Maze {
    pub width: usize,
    pub height: usize,
    pub grid: Vec<u8>, // 1 = wall, 0 = path
    pub start: (usize, usize),
    pub end: (usize, usize),
    pub solution: Vec<(usize, usize)>,
}

impl Maze {
    pub fn generate(difficulty: u32, seed: u64) -> Self {
        let diff = difficulty.clamp(1, 1000);
        
        // Scale cells: difficulty 1 -> 2x2 cells (5x5 grid); difficulty 1000 -> 50x50 cells (101x101 grid)
        let cells = 2 + (((diff as u64 - 1) * 48 + 499) / 999) as usize;
        let width = 2 * cells + 1;
        let height = 2 * cells + 1;

        let mut grid = vec![1u8; width * height];
        let mut rng = Rng::new(seed);

        let start_cell = (0usize, 0usize);
        let end_cell = (cells - 1, cells - 1);

        let start_tile = (2 * start_cell.0 + 1, 2 * start_cell.1 + 1);
        let end_tile = (2 * end_cell.0 + 1, 2 * end_cell.1 + 1);

        // Recursive Backtracker using explicit stack
        let mut visited = vec![false; cells * cells];
        let mut stack = Vec::with_capacity(cells * cells);

        let start_idx = start_cell.1 * cells + start_cell.0;
        visited[start_idx] = true;
        grid[start_tile.1 * width + start_tile.0] = 0;
        stack.push((start_cell.0, start_cell.1, 4usize)); // (cx, cy, last_dir)

        // Straightness bias decreases with difficulty:
        // Difficulty 1: 75% straight preference; Difficulty 1000: 10% straight preference
        let straight_bias_pct = 75 - (((diff - 1) * 65) / 999) as usize;

        // Directions: 0=North, 1=East, 2=South, 3=West
        const DIRS: [(isize, isize); 4] = [(0, -1), (1, 0), (0, 1), (-1, 0)];

        while let Some(&(cx, cy, last_dir)) = stack.last() {
            let mut neighbors = Vec::with_capacity(4);

            for (dir_idx, &(dx, dy)) in DIRS.iter().enumerate() {
                let nx = cx as isize + dx;
                let ny = cy as isize + dy;

                if nx >= 0 && nx < cells as isize && ny >= 0 && ny < cells as isize {
                    let unx = nx as usize;
                    let uny = ny as usize;
                    if !visited[uny * cells + unx] {
                        neighbors.push((unx, uny, dir_idx));
                    }
                }
            }

            if neighbors.is_empty() {
                stack.pop();
            } else {
                // Check if last direction is still available and apply straight bias
                let chosen_idx = if last_dir < 4 && rng.next_usize(100) < straight_bias_pct {
                    if let Some(pos) = neighbors.iter().position(|&(_, _, d)| d == last_dir) {
                        pos
                    } else {
                        rng.next_usize(neighbors.len())
                    }
                } else {
                    rng.next_usize(neighbors.len())
                };

                let (nx, ny, dir) = neighbors[chosen_idx];

                // Carve wall between (cx, cy) and (nx, ny)
                let wall_x = (cx * 2 + 1) as isize + DIRS[dir].0;
                let wall_y = (cy * 2 + 1) as isize + DIRS[dir].1;
                grid[(wall_y as usize) * width + (wall_x as usize)] = 0;

                // Carve cell
                let next_tile_x = 2 * nx + 1;
                let next_tile_y = 2 * ny + 1;
                grid[next_tile_y * width + next_tile_x] = 0;

                visited[ny * cells + nx] = true;
                stack.push((nx, ny, dir));
            }
        }

        // Compute shortest path solution using BFS
        let solution = Self::solve_bfs(&grid, width, height, start_tile, end_tile);

        Maze {
            width,
            height,
            grid,
            start: start_tile,
            end: end_tile,
            solution,
        }
    }

    fn solve_bfs(
        grid: &[u8],
        width: usize,
        height: usize,
        start: (usize, usize),
        end: (usize, usize),
    ) -> Vec<(usize, usize)> {
        let size = width * height;
        let mut prev = vec![usize::MAX; size];
        let mut visited = vec![false; size];
        let mut queue = VecDeque::new();

        let start_idx = start.1 * width + start.0;
        let end_idx = end.1 * width + end.0;

        visited[start_idx] = true;
        queue.push_back(start);

        const DIRS: [(isize, isize); 4] = [(0, -1), (1, 0), (0, 1), (-1, 0)];

        while let Some((x, y)) = queue.pop_front() {
            let curr_idx = y * width + x;
            if curr_idx == end_idx {
                break;
            }

            for &(dx, dy) in &DIRS {
                let nx = x as isize + dx;
                let ny = y as isize + dy;

                if nx >= 0 && nx < width as isize && ny >= 0 && ny < height as isize {
                    let unx = nx as usize;
                    let uny = ny as usize;
                    let next_idx = uny * width + unx;

                    if grid[next_idx] == 0 && !visited[next_idx] {
                        visited[next_idx] = true;
                        prev[next_idx] = curr_idx;
                        queue.push_back((unx, uny));
                    }
                }
            }
        }

        // Reconstruct path
        let mut path = Vec::new();
        if visited[end_idx] {
            let mut curr = end_idx;
            while curr != usize::MAX {
                let px = curr % width;
                let py = curr / width;
                path.push((px, py));
                if curr == start_idx {
                    break;
                }
                curr = prev[curr];
            }
            path.reverse();
        }

        path
    }
}

// Global state for WebAssembly FFI
struct GlobalState {
    maze: Option<Maze>,
    packed_solution: Vec<u32>,
}

static STATE: Mutex<GlobalState> = Mutex::new(GlobalState {
    maze: None,
    packed_solution: Vec::new(),
});

#[no_mangle]
pub extern "C" fn generate_maze(difficulty: u32, seed: u64) -> u32 {
    let maze = Maze::generate(difficulty, seed);
    let mut state = STATE.lock().unwrap();

    let mut packed = Vec::with_capacity(maze.solution.len());
    for &(x, y) in &maze.solution {
        packed.push(((x as u32) << 16) | (y as u32));
    }
    state.packed_solution = packed;
    state.maze = Some(maze);

    1 // Success status
}

#[no_mangle]
pub extern "C" fn get_grid_width() -> u32 {
    let state = STATE.lock().unwrap();
    state.maze.as_ref().map(|m| m.width as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn get_grid_height() -> u32 {
    let state = STATE.lock().unwrap();
    state.maze.as_ref().map(|m| m.height as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn get_grid_ptr() -> *const u8 {
    let state = STATE.lock().unwrap();
    state
        .maze
        .as_ref()
        .map(|m| m.grid.as_ptr())
        .unwrap_or(std::ptr::null())
}

#[no_mangle]
pub extern "C" fn get_grid_len() -> u32 {
    let state = STATE.lock().unwrap();
    state.maze.as_ref().map(|m| m.grid.len() as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn get_solution_ptr() -> *const u32 {
    let state = STATE.lock().unwrap();
    state.packed_solution.as_ptr()
}

#[no_mangle]
pub extern "C" fn get_solution_len() -> u32 {
    let state = STATE.lock().unwrap();
    state.packed_solution.len() as u32
}

#[no_mangle]
pub extern "C" fn get_start_x() -> u32 {
    let state = STATE.lock().unwrap();
    state.maze.as_ref().map(|m| m.start.0 as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn get_start_y() -> u32 {
    let state = STATE.lock().unwrap();
    state.maze.as_ref().map(|m| m.start.1 as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn get_end_x() -> u32 {
    let state = STATE.lock().unwrap();
    state.maze.as_ref().map(|m| m.end.0 as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn get_end_y() -> u32 {
    let state = STATE.lock().unwrap();
    state.maze.as_ref().map(|m| m.end.1 as u32).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dimensions_scale() {
        let m1 = Maze::generate(1, 42);
        assert_eq!(m1.width, 5);
        assert_eq!(m1.height, 5);

        let m1000 = Maze::generate(1000, 42);
        assert_eq!(m1000.width, 101);
        assert_eq!(m1000.height, 101);
    }

    #[test]
    fn test_solvability_and_perimeter() {
        for diff in [1, 10, 50, 100, 500, 1000] {
            let m = Maze::generate(diff, 1234567);
            
            // Perimeter must be walls (except if openings are added, but here internal tiles are used)
            for x in 0..m.width {
                assert_eq!(m.grid[0 * m.width + x], 1, "Top wall broken at x={x}");
                assert_eq!(m.grid[(m.height - 1) * m.width + x], 1, "Bottom wall broken at x={x}");
            }
            for y in 0..m.height {
                assert_eq!(m.grid[y * m.width + 0], 1, "Left wall broken at y={y}");
                assert_eq!(m.grid[y * m.width + (m.width - 1)], 1, "Right wall broken at y={y}");
            }

            // Start and end must be paths
            assert_eq!(m.grid[m.start.1 * m.width + m.start.0], 0, "Start is not path");
            assert_eq!(m.grid[m.end.1 * m.width + m.end.0], 0, "End is not path");

            // Solution must not be empty
            assert!(!m.solution.is_empty(), "Maze at diff {diff} has no solution!");
            assert_eq!(m.solution.first().copied(), Some(m.start));
            assert_eq!(m.solution.last().copied(), Some(m.end));

            // Verify each step in solution is adjacent and path
            for window in m.solution.windows(2) {
                let a = window[0];
                let b = window[1];
                let dx = (a.0 as isize - b.0 as isize).abs();
                let dy = (a.1 as isize - b.1 as isize).abs();
                assert_eq!(dx + dy, 1, "Non-adjacent step in solution: {a:?} -> {b:?}");
                assert_eq!(m.grid[b.1 * m.width + b.0], 0, "Solution passes through wall at {b:?}");
            }
        }
    }

    #[test]
    fn test_generation_performance() {
        use std::time::Instant;
        let start = Instant::now();
        let _ = Maze::generate(1000, 99999);
        let elapsed = start.elapsed();
        println!("Difficulty 1000 generation elapsed: {elapsed:?}");
        assert!(elapsed.as_millis() < 50, "Maze generation took too long: {elapsed:?}");
    }
}
