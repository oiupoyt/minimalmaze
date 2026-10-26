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

        if diff <= 40 {
            // For low difficulties (1-40), use Backtracker with high straight bias for clear, beginner-friendly corridors
            Self::generate_backtracker(cells, width, height, &mut grid, &mut rng, diff);
        } else {
            // For higher difficulties (41-1000), use Wilson's Algorithm (Loop-Erased Random Walk)
            // producing a true Uniform Spanning Tree with maximum branch complexity and zero directional bias
            Self::generate_wilsons(cells, width, height, &mut grid, &mut rng);
        }

        // Always place start at (1, 1)
        let start_tile = (1usize, 1usize);

        // Find the deepest dead-end or cell with maximum graph distance from start using BFS
        let (end_tile, solution) = Self::find_deepest_exit_and_solution(&grid, width, height, start_tile);

        Maze {
            width,
            height,
            grid,
            start: start_tile,
            end: end_tile,
            solution,
        }
    }

    /// Wilson's Algorithm: generates an exact Uniform Spanning Tree (UST)
    fn generate_wilsons(
        cells: usize,
        width: usize,
        _height: usize,
        grid: &mut [u8],
        rng: &mut Rng,
    ) {
        let total_cells = cells * cells;
        let mut in_maze = vec![false; total_cells];
        let mut next_dir = vec![255u8; total_cells];

        // Carve all cell centers into paths
        for cy in 0..cells {
            for cx in 0..cells {
                grid[(2 * cy + 1) * width + (2 * cx + 1)] = 0;
            }
        }

        // Add an initial root cell to the maze (bottom-right or random)
        let root = rng.next_usize(total_cells);
        in_maze[root] = true;
        let mut in_maze_count = 1;

        const DIRS: [(isize, isize); 4] = [(0, -1), (1, 0), (0, 1), (-1, 0)];

        // Loop until all cells are connected
        for start_cell in 0..total_cells {
            if in_maze[start_cell] {
                continue;
            }

            // Perform loop-erased random walk
            let mut curr = start_cell;
            while !in_maze[curr] {
                let cx = curr % cells;
                let cy = curr / cells;

                // Pick a valid random neighbor direction
                let mut valid_dirs = [0usize; 4];
                let mut valid_count = 0;

                for (d, &(dx, dy)) in DIRS.iter().enumerate() {
                    let nx = cx as isize + dx;
                    let ny = cy as isize + dy;
                    if nx >= 0 && nx < cells as isize && ny >= 0 && ny < cells as isize {
                        valid_dirs[valid_count] = d;
                        valid_count += 1;
                    }
                }

                let chosen_d = valid_dirs[rng.next_usize(valid_count)];
                next_dir[curr] = chosen_d as u8;

                let nx = (cx as isize + DIRS[chosen_d].0) as usize;
                let ny = (cy as isize + DIRS[chosen_d].1) as usize;
                curr = ny * cells + nx;
            }

            // Carve the loop-erased path from start_cell into the maze
            let mut carve_curr = start_cell;
            while !in_maze[carve_curr] {
                let dir = next_dir[carve_curr] as usize;
                let cx = carve_curr % cells;
                let cy = carve_curr / cells;

                let wall_x = (cx * 2 + 1) as isize + DIRS[dir].0;
                let wall_y = (cy * 2 + 1) as isize + DIRS[dir].1;
                grid[(wall_y as usize) * width + (wall_x as usize)] = 0;

                in_maze[carve_curr] = true;
                in_maze_count += 1;

                let nx = (cx as isize + DIRS[dir].0) as usize;
                let ny = (cy as isize + DIRS[dir].1) as usize;
                carve_curr = ny * cells + nx;
            }

            if in_maze_count >= total_cells {
                break;
            }
        }
    }

    /// Recursive Backtracker with straight bias for low difficulties
    fn generate_backtracker(
        cells: usize,
        width: usize,
        _height: usize,
        grid: &mut [u8],
        rng: &mut Rng,
        diff: u32,
    ) {
        let mut visited = vec![false; cells * cells];
        let mut stack = Vec::with_capacity(cells * cells);

        visited[0] = true;
        grid[1 * width + 1] = 0;
        stack.push((0usize, 0usize, 4usize));

        let straight_bias_pct = 75 - (((diff - 1) * 40) / 40) as usize;
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
                let wall_x = (cx * 2 + 1) as isize + DIRS[dir].0;
                let wall_y = (cy * 2 + 1) as isize + DIRS[dir].1;
                grid[(wall_y as usize) * width + (wall_x as usize)] = 0;
                grid[(2 * ny + 1) * width + (2 * nx + 1)] = 0;

                visited[ny * cells + nx] = true;
                stack.push((nx, ny, dir));
            }
        }
    }

    /// Finds the dead-end with maximum shortest-path distance from start using BFS
    fn find_deepest_exit_and_solution(
        grid: &[u8],
        width: usize,
        height: usize,
        start: (usize, usize),
    ) -> ((usize, usize), Vec<(usize, usize)>) {
        let size = width * height;
        let mut dist = vec![usize::MAX; size];
        let mut prev = vec![usize::MAX; size];
        let mut queue = VecDeque::new();

        let start_idx = start.1 * width + start.0;
        dist[start_idx] = 0;
        queue.push_back(start);

        const DIRS: [(isize, isize); 4] = [(0, -1), (1, 0), (0, 1), (-1, 0)];

        let mut max_dist = 0;
        let mut best_tile = start;

        while let Some((x, y)) = queue.pop_front() {
            let curr_idx = y * width + x;
            let d = dist[curr_idx];

            let mut open_neighbors = 0;
            for &(dx, dy) in &DIRS {
                let nx = x as isize + dx;
                let ny = y as isize + dy;
                if nx >= 0 && nx < width as isize && ny >= 0 && ny < height as isize {
                    let unx = nx as usize;
                    let uny = ny as usize;
                    let next_idx = uny * width + unx;

                    if grid[next_idx] == 0 {
                        open_neighbors += 1;
                        if dist[next_idx] == usize::MAX {
                            dist[next_idx] = d + 1;
                            prev[next_idx] = curr_idx;
                            queue.push_back((unx, uny));
                        }
                    }
                }
            }

            // Prefer dead-ends (open_neighbors == 1) with maximum distance
            let is_dead_end = open_neighbors <= 1 && (x, y) != start;
            if d > max_dist && is_dead_end {
                max_dist = d;
                best_tile = (x, y);
            } else if d > max_dist && best_tile == start {
                best_tile = (x, y);
            }
        }

        // Reconstruct path to best_tile
        let mut path = Vec::new();
        let end_idx = best_tile.1 * width + best_tile.0;
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

        (best_tile, path)
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

            // Perimeter must be walls
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

    #[test]
    fn test_deep_complexity_and_full_reachability() {
        let m = Maze::generate(1000, 42);

        // 1. Solution length must be deeply winding (at least 300 steps in a 101x101 maze)
        println!("Difficulty 1000 solution length: {}", m.solution.len());
        assert!(
            m.solution.len() >= 300,
            "Solution path is too short and trivial: {} steps",
            m.solution.len()
        );

        // 2. All open cells in the maze MUST be reachable from start (no isolated pockets)
        let mut visited = vec![false; m.width * m.height];
        let mut q = std::collections::VecDeque::new();
        let start_idx = m.start.1 * m.width + m.start.0;
        visited[start_idx] = true;
        q.push_back(m.start);

        const DIRS: [(isize, isize); 4] = [(0, -1), (1, 0), (0, 1), (-1, 0)];
        let mut reachable_count = 0;

        while let Some((x, y)) = q.pop_front() {
            reachable_count += 1;
            for &(dx, dy) in &DIRS {
                let nx = x as isize + dx;
                let ny = y as isize + dy;
                if nx >= 0 && nx < m.width as isize && ny >= 0 && ny < m.height as isize {
                    let unx = nx as usize;
                    let uny = ny as usize;
                    let nidx = uny * m.width + unx;
                    if m.grid[nidx] == 0 && !visited[nidx] {
                        visited[nidx] = true;
                        q.push_back((unx, uny));
                    }
                }
            }
        }

        let total_open_cells = m.grid.iter().filter(|&&cell| cell == 0).count();
        assert_eq!(
            reachable_count, total_open_cells,
            "Unreachable passages detected! Reachable: {}, total open: {}",
            reachable_count, total_open_cells
        );
    }
}
