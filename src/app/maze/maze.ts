import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import { InfoPanelComponent } from '../info-panel/info-panel';

const CELL_PX = 16; // canvas pixels per maze cell
const NORTH = 1, SOUTH = 2, EAST = 4, WEST = 8;

type Stage = 'idle' | 'generating' | 'generated' | 'solving' | 'solved';

// ── Minimal binary min-heap ──────────────────────────────────────────────────

class MinHeap {
  private readonly keys: Float32Array;
  private readonly vals: Int32Array;
  private size = 0;

  constructor(capacity: number) {
    this.keys = new Float32Array(capacity);
    this.vals = new Int32Array(capacity);
  }

  get length() { return this.size; }

  push(key: number, val: number) {
    let i = this.size++;
    this.keys[i] = key;
    this.vals[i] = val;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(p, i);
      i = p;
    }
  }

  pop(): number {
    const val = this.vals[0];
    const last = --this.size;
    this.keys[0] = this.keys[last];
    this.vals[0] = this.vals[last];
    let i = 0;
    while (true) {
      let m = i;
      const l = 2 * i + 1, r = l + 1;
      if (l < this.size && this.keys[l] < this.keys[m]) m = l;
      if (r < this.size && this.keys[r] < this.keys[m]) m = r;
      if (m === i) break;
      this.swap(m, i);
      i = m;
    }
    return val;
  }

  private swap(a: number, b: number) {
    let t = this.keys[a]; this.keys[a] = this.keys[b]; this.keys[b] = t;
    const u = this.vals[a]; this.vals[a] = this.vals[b]; this.vals[b] = u;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-maze',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InfoPanelComponent],
  templateUrl: './maze.html',
  styleUrl: './maze.scss',
})
export class MazeComponent implements OnDestroy {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly stage = signal<Stage>('idle');
  readonly speed = signal(20);

  readonly canGenerate = computed(() => {
    const s = this.stage();
    return s !== 'generating' && s !== 'solving';
  });
  readonly canSolve = computed(() => this.stage() === 'generated');

  // ── Grid ──
  private cells = new Uint8Array(0);  // passage bitmask per cell
  private inMaze = new Uint8Array(0); // 1 if cell is part of the maze
  private rows = 0;
  private cols = 0;

  // ── Wilson's state ──
  // O(1) random pick + O(1) delete via swap-and-pop
  private unvisitedArr = new Int32Array(0);
  private unvisitedPos = new Int32Array(0); // cell → index in unvisitedArr, -1 if absent
  private unvisitedCount = 0;
  private walkPath: number[] = [];
  private walkPos = new Int32Array(0); // cell → index in walkPath, -1 if absent

  // ── A* state ──
  private heap!: MinHeap;
  private gScore = new Float32Array(0);
  private cameFrom = new Int32Array(0);
  private explored = new Uint8Array(0);
  private solutionPath: number[] = [];

  private animFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      const canvas = this.canvasRef().nativeElement;
      this.resizeObserver = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        canvas.width = width;
        canvas.height = height;
        this.initGrid();
        this.draw();
      });
      this.resizeObserver.observe(canvas);
    });
  }

  ngOnDestroy() {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    this.resizeObserver?.disconnect();
  }

  generate() {
    if (this.animFrameId !== null) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
    this.initGrid();
    this.stage.set('generating');
    this.scheduleFrame();
  }

  solve() {
    if (this.stage() !== 'generated') return;
    this.initAStar();
    this.stage.set('solving');
    this.scheduleFrame();
  }

  reset() {
    if (this.animFrameId !== null) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
    this.initGrid();
    this.stage.set('idle');
    this.draw();
  }

  onSpeedChange(event: Event) {
    this.speed.set(Number((event.target as HTMLInputElement).value));
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  private initGrid() {
    const canvas = this.canvasRef().nativeElement;
    this.cols = Math.max(2, Math.floor(canvas.width / CELL_PX));
    this.rows = Math.max(2, Math.floor(canvas.height / CELL_PX));
    const n = this.rows * this.cols;

    this.cells = new Uint8Array(n);
    this.inMaze = new Uint8Array(n);
    this.walkPath = [];
    this.walkPos = new Int32Array(n).fill(-1);
    this.solutionPath = [];
    this.explored = new Uint8Array(n);

    // Seed Wilson's — start cell 0 already in the maze
    this.unvisitedArr = new Int32Array(n - 1);
    this.unvisitedPos = new Int32Array(n).fill(-1);
    for (let i = 1; i < n; i++) {
      this.unvisitedArr[i - 1] = i;
      this.unvisitedPos[i] = i - 1;
    }
    this.unvisitedCount = n - 1;
    this.inMaze[0] = 1;
  }

  private initAStar() {
    const n = this.rows * this.cols;
    this.gScore = new Float32Array(n).fill(Infinity);
    this.cameFrom = new Int32Array(n).fill(-1);
    this.explored = new Uint8Array(n);
    this.solutionPath = [];
    this.gScore[0] = 0;
    this.heap = new MinHeap(n * 2);
    this.heap.push(this.h(0), 0);
  }

  // ── Wilson's algorithm ────────────────────────────────────────────────────

  private stepGeneration(steps: number): boolean {
    for (let s = 0; s < steps; s++) {
      if (this.unvisitedCount === 0) return true;

      // Start a new walk if needed
      if (this.walkPath.length === 0) {
        const start = this.pickUnvisited();
        this.walkPath.push(start);
        this.walkPos[start] = 0;
      }

      const curr = this.walkPath[this.walkPath.length - 1];
      const next = this.randomNeighbor(curr);

      if (this.inMaze[next]) {
        this.carveWalk(next);
        // Reset walk state
        for (const c of this.walkPath) this.walkPos[c] = -1;
        this.walkPath = [];
      } else if (this.walkPos[next] !== -1) {
        // Loop — erase back to next
        const loopAt = this.walkPos[next];
        for (let i = loopAt + 1; i < this.walkPath.length; i++) {
          this.walkPos[this.walkPath[i]] = -1;
        }
        this.walkPath.length = loopAt + 1;
      } else {
        this.walkPath.push(next);
        this.walkPos[next] = this.walkPath.length - 1;
      }
    }
    return this.unvisitedCount === 0;
  }

  private carveWalk(mazeEntry: number) {
    const path = [...this.walkPath, mazeEntry];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      if (b === a - this.cols)      { this.cells[a] |= NORTH; this.cells[b] |= SOUTH; }
      else if (b === a + this.cols) { this.cells[a] |= SOUTH; this.cells[b] |= NORTH; }
      else if (b === a + 1)         { this.cells[a] |= EAST;  this.cells[b] |= WEST;  }
      else                          { this.cells[a] |= WEST;  this.cells[b] |= EAST;  }
      this.inMaze[a] = 1;
      this.removeUnvisited(a);
    }
  }

  private pickUnvisited(): number {
    return this.unvisitedArr[(Math.random() * this.unvisitedCount) | 0];
  }

  private removeUnvisited(cell: number) {
    const pos = this.unvisitedPos[cell];
    if (pos === -1) return;
    const last = this.unvisitedArr[--this.unvisitedCount];
    this.unvisitedArr[pos] = last;
    this.unvisitedPos[last] = pos;
    this.unvisitedPos[cell] = -1;
  }

  private randomNeighbor(idx: number): number {
    const r = (idx / this.cols) | 0, c = idx % this.cols;
    const { rows, cols } = this;
    // Inline to avoid array allocation
    let count = 0;
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    if (r > 0)        { n0 = idx - cols; count++; }
    if (r < rows - 1) { if (count === 0) n0 = idx + cols; else if (count === 1) n1 = idx + cols; else n2 = idx + cols; count++; }
    if (c > 0)        { if (count === 0) n0 = idx - 1; else if (count === 1) n1 = idx - 1; else if (count === 2) n2 = idx - 1; else n3 = idx - 1; count++; }
    if (c < cols - 1) { if (count === 0) n0 = idx + 1; else if (count === 1) n1 = idx + 1; else if (count === 2) n2 = idx + 1; else n3 = idx + 1; count++; }
    const pick = (Math.random() * count) | 0;
    return pick === 0 ? n0 : pick === 1 ? n1 : pick === 2 ? n2 : n3;
  }

  // ── A* pathfinding ────────────────────────────────────────────────────────

  private stepAStar(steps: number): boolean {
    const { cols, rows, cells, gScore, cameFrom, explored, heap } = this;
    const goal = rows * cols - 1;

    for (let s = 0; s < steps; s++) {
      if (heap.length === 0) return true;
      const curr = heap.pop();
      if (explored[curr]) continue;
      explored[curr] = 1;

      if (curr === goal) {
        let c = goal;
        while (c !== -1) { this.solutionPath.push(c); c = cameFrom[c]; }
        return true;
      }

      const r = (curr / cols) | 0, col = curr % cols;
      const dirs: [number, number][] = [];
      if (cells[curr] & NORTH) dirs.push([curr - cols, 1]);
      if (cells[curr] & SOUTH) dirs.push([curr + cols, 1]);
      if (cells[curr] & EAST)  dirs.push([curr + 1, 1]);
      if (cells[curr] & WEST)  dirs.push([curr - 1, 1]);

      for (const [nb, cost] of dirs) {
        const ng = gScore[curr] + cost;
        if (ng < gScore[nb]) {
          gScore[nb] = ng;
          cameFrom[nb] = curr;
          heap.push(ng + this.h(nb), nb);
        }
      }
    }
    return false;
  }

  private h(idx: number): number {
    const r = (idx / this.cols) | 0, c = idx % this.cols;
    return (this.rows - 1 - r) + (this.cols - 1 - c);
  }

  // ── Animation loop ────────────────────────────────────────────────────────

  private scheduleFrame() {
    this.animFrameId = requestAnimationFrame(() => {
      const s = this.stage();
      let done = false;

      if (s === 'generating') done = this.stepGeneration(this.speed());
      else if (s === 'solving') done = this.stepAStar(this.speed() * 4);

      this.draw();

      if (done) {
        this.animFrameId = null;
        this.stage.set(s === 'generating' ? 'generated' : 'solved');
        return;
      }
      this.scheduleFrame();
    });
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private draw() {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || this.cols === 0) return;

    const cp = CELL_PX;
    const { rows, cols, cells, inMaze } = this;
    const s = this.stage();

    // Wall background
    ctx.fillStyle = '#0c0c18';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // In-maze cells + carved passages
    ctx.fillStyle = '#1c2245';
    ctx.beginPath();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        if (!inMaze[idx]) continue;
        const x = col * cp + 1, y = row * cp + 1, sz = cp - 1;
        ctx.rect(x, y, sz, sz);
        if ((cells[idx] & SOUTH) && row < rows - 1) ctx.rect(x, y + sz, sz, 1);
        if ((cells[idx] & EAST)  && col < cols - 1) ctx.rect(x + sz, y, 1, sz);
      }
    }
    ctx.fill();

    // Current random walk
    if (this.walkPath.length > 0) {
      ctx.fillStyle = 'rgba(55, 140, 220, 0.85)';
      ctx.beginPath();
      for (let i = 0; i < this.walkPath.length - 1; i++) {
        const idx = this.walkPath[i];
        ctx.rect((idx % cols) * cp + 1, ((idx / cols) | 0) * cp + 1, cp - 1, cp - 1);
      }
      ctx.fill();

      const head = this.walkPath[this.walkPath.length - 1];
      ctx.fillStyle = 'rgba(120, 210, 255, 1)';
      ctx.fillRect((head % cols) * cp + 1, ((head / cols) | 0) * cp + 1, cp - 1, cp - 1);
    }

    // A* explored cells
    if (s === 'solving' || s === 'solved') {
      ctx.fillStyle = 'rgba(30, 90, 190, 0.55)';
      ctx.beginPath();
      for (let i = 0; i < this.explored.length; i++) {
        if (!this.explored[i]) continue;
        ctx.rect((i % cols) * cp + 1, ((i / cols) | 0) * cp + 1, cp - 1, cp - 1);
      }
      ctx.fill();
    }

    // Solution path
    if (this.solutionPath.length > 0) {
      ctx.fillStyle = 'rgba(255, 240, 160, 0.92)';
      ctx.beginPath();
      for (let i = 0; i < this.solutionPath.length; i++) {
        const idx = this.solutionPath[i];
        const row = (idx / cols) | 0, col = idx % cols;
        const x = col * cp + 1, y = row * cp + 1, sz = cp - 1;
        ctx.rect(x, y, sz, sz);
        if (i < this.solutionPath.length - 1) {
          const next = this.solutionPath[i + 1];
          const nr = (next / cols) | 0, nc = next % cols;
          if (nr === row + 1)      ctx.rect(x, y + sz, sz, 1);
          else if (nr === row - 1) ctx.rect(x, y - 1, sz, 1);
          else if (nc === col + 1) ctx.rect(x + sz, y, 1, sz);
          else                     ctx.rect(x - 1, y, 1, sz);
        }
      }
      ctx.fill();
    }

    // Start marker (top-left, cyan)
    ctx.fillStyle = 'rgba(120, 210, 255, 1)';
    ctx.fillRect(1, 1, cp - 1, cp - 1);

    // Goal marker (bottom-right, gold)
    const goal = rows * cols - 1;
    ctx.fillStyle = 'rgba(255, 240, 160, 1)';
    ctx.fillRect((goal % cols) * cp + 1, ((goal / cols) | 0) * cp + 1, cp - 1, cp - 1);
  }
}
