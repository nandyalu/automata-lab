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

const DIRS = [
  { dx: 0, dy: -1 }, // North
  { dx: 1, dy: 0 }, // East
  { dx: 0, dy: 1 }, // South
  { dx: -1, dy: 0 }, // West
] as const;

const CELL_SIZE = 8;

@Component({
  selector: 'app-langtons-ant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InfoPanelComponent],
  templateUrl: './langtons-ant.html',
  styleUrl: './langtons-ant.scss',
})
export class LangtonAntComponent implements OnDestroy {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly isRunning = signal(false);
  readonly stepCount = signal(0);
  readonly stepsPerFrame = signal(1);

  private readonly blackCells = new Set<string>();
  private antX = 0;
  private antY = 0;
  private antDir = 0;
  private animFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      const canvas = this.canvasRef().nativeElement;
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;

      this.resizeObserver = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        canvas.width = width;
        canvas.height = height;
        this.draw();
      });
      this.resizeObserver.observe(canvas);

      this.draw();
    });
  }

  ngOnDestroy() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
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

  reset() {
    this.isRunning.set(false);
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.blackCells.clear();
    this.antX = 0;
    this.antY = 0;
    this.antDir = 0;
    this.stepCount.set(0);
    this.draw();
  }

  onSpeedChange(event: Event) {
    this.stepsPerFrame.set(Number((event.target as HTMLInputElement).value));
  }

  private step() {
    const key = `${this.antX},${this.antY}`;
    if (this.blackCells.has(key)) {
      this.antDir = (this.antDir + 3) % 4; // turn left
      this.blackCells.delete(key);
    } else {
      this.antDir = (this.antDir + 1) % 4; // turn right
      this.blackCells.add(key);
    }
    this.antX += DIRS[this.antDir].dx;
    this.antY += DIRS[this.antDir].dy;
  }

  private scheduleFrame() {
    this.animFrameId = requestAnimationFrame(() => {
      if (!this.isRunning()) {
        this.animFrameId = null;
        return;
      }
      const steps = this.stepsPerFrame();
      for (let i = 0; i < steps; i++) {
        this.step();
      }
      this.stepCount.update(n => n + steps);
      this.draw();
      this.scheduleFrame();
    });
  }

  private draw() {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width: w, height: h } = canvas;
    const cs = CELL_SIZE;
    // keep the view centered on the ant
    const cx = Math.floor(w / 2) - this.antX * cs;
    const cy = Math.floor(h / 2) - this.antY * cs;

    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, w, h);

    ctx.shadowBlur = 6;
    ctx.shadowColor = 'rgba(100, 200, 255, 0.5)';
    ctx.fillStyle = 'rgba(120, 210, 255, 0.9)';
    ctx.beginPath();
    for (const key of this.blackCells) {
      const comma = key.indexOf(',');
      const x = +key.slice(0, comma);
      const y = +key.slice(comma + 1);
      ctx.rect(cx + x * cs, cy + y * cs, cs, cs);
    }
    ctx.fill();

    // Ant — warm white so it reads clearly against the cyan trail
    ctx.shadowColor = 'rgba(255, 240, 160, 0.8)';
    ctx.fillStyle = 'rgba(255, 240, 160, 1.0)';
    ctx.beginPath();
    ctx.rect(cx + this.antX * cs, cy + this.antY * cs, cs, cs);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
