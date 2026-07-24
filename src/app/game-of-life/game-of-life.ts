import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  signal,
  viewChild,
} from '@angular/core';
import { InfoPanelComponent } from '../info-panel/info-panel';

const CELL_SIZE = 8;
const FILL_PROBABILITY = 0.3;

@Component({
  selector: 'app-game-of-life',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InfoPanelComponent],
  templateUrl: './game-of-life.html',
  styleUrl: './game-of-life.scss',
})
export class GameOfLifeComponent implements OnDestroy {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly isRunning = signal(false);
  readonly generation = signal(0);
  readonly population = signal(0);
  readonly stepsPerFrame = signal(1);

  private grid = new Uint8Array(0);
  private nextGrid = new Uint8Array(0);
  private rows = 0;
  private cols = 0;
  private animFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      const canvas = this.canvasRef().nativeElement;

      this.resizeObserver = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        const cols = Math.floor(width / CELL_SIZE);
        const rows = Math.floor(height / CELL_SIZE);
        canvas.width = width;
        canvas.height = height;
        this.initGrid(cols, rows);
        this.draw();
      });
      this.resizeObserver.observe(canvas);
    });
  }

  ngOnDestroy() {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    this.resizeObserver?.disconnect();
  }

  togglePlay() {
    if (this.isRunning()) {
      this.isRunning.set(false);
    } else {
      this.isRunning.set(true);
      this.scheduleFrame();
    }
  }

  randomize() {
    this.fillRandom();
    this.generation.set(0);
    this.draw();
    if (!this.isRunning()) {
      return;
    } else {
      this.isRunning.set(false); // stop current run to reset timing
    }
  }

  onSpeedChange(event: Event) {
    this.stepsPerFrame.set(Number((event.target as HTMLInputElement).value));
  }

  private initGrid(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.grid = new Uint8Array(rows * cols);
    this.nextGrid = new Uint8Array(rows * cols);
    this.fillRandom();
    this.generation.set(0);
  }

  private fillRandom() {
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i] = Math.random() < FILL_PROBABILITY ? 1 : 0;
    }
    this.population.set(this.sumGrid());
  }

  private sumGrid(): number {
    let n = 0;
    for (let i = 0; i < this.grid.length; i++) n += this.grid[i];
    return n;
  }

  private step(): number {
    const { rows, cols } = this;
    let pop = 0;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const n = this.neighbors(x, y);
        const alive = this.grid[y * cols + x];
        const next = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
        this.nextGrid[y * cols + x] = next;
        pop += next;
      }
    }

    // swap buffers
    const tmp = this.grid;
    this.grid = this.nextGrid;
    this.nextGrid = tmp;

    return pop;
  }

  private neighbors(x: number, y: number): number {
    const { rows, cols, grid } = this;
    const xl = (x - 1 + cols) % cols;
    const xr = (x + 1) % cols;
    const yu = (y - 1 + rows) % rows;
    const yd = (y + 1) % rows;
    return (
      grid[yu * cols + xl] +
      grid[yu * cols + x] +
      grid[yu * cols + xr] +
      grid[y * cols + xl] +
      grid[y * cols + xr] +
      grid[yd * cols + xl] +
      grid[yd * cols + x] +
      grid[yd * cols + xr]
    );
  }

  private scheduleFrame() {
    this.animFrameId = requestAnimationFrame(() => {
      if (!this.isRunning()) {
        this.animFrameId = null;
        return;
      }
      const steps = this.stepsPerFrame();
      let pop = 0;
      for (let i = 0; i < steps; i++) pop = this.step();
      this.generation.update(n => n + steps);
      this.population.set(pop);
      this.draw();
      this.scheduleFrame();
    });
  }

  private draw() {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || this.cols === 0) return;

    const cs = CELL_SIZE;

    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.shadowBlur = 6;
    ctx.shadowColor = 'rgba(100, 200, 255, 0.5)';
    ctx.fillStyle = 'rgba(120, 210, 255, 0.9)';
    ctx.beginPath();
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] === 1) {
        const x = i % this.cols;
        const y = (i / this.cols) | 0;
        ctx.rect(x * cs, y * cs, cs, cs);
      }
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
