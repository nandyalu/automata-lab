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

// Diffusion rates — V diffuses at half the speed of U
const DU = 0.16;
const DV = 0.08;
// Canvas pixels per simulation cell
const SCALE = 4;

export interface Preset {
  label: string;
  f: number;
  k: number;
}

export const PRESETS: Preset[] = [
  { label: 'Spots',   f: 0.035, k: 0.065 },
  { label: 'Coral',   f: 0.037, k: 0.060 },
  { label: 'Maze',    f: 0.029, k: 0.057 },
  { label: 'Stripes', f: 0.055, k: 0.062 },
  { label: 'Spirals', f: 0.012, k: 0.050 },
  { label: 'Blobs',   f: 0.062, k: 0.061 },
];

@Component({
  selector: 'app-reaction-diffusion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InfoPanelComponent],
  templateUrl: './reaction-diffusion.html',
  styleUrl: './reaction-diffusion.scss',
})
export class ReactionDiffusionComponent implements OnDestroy {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly isRunning = signal(false);
  readonly feedRate = signal(PRESETS[0].f);
  readonly killRate = signal(PRESETS[0].k);
  readonly stepsPerFrame = signal(8);
  readonly presets = PRESETS;

  // Highlights whichever preset currently matches feedRate + killRate exactly
  readonly activePreset = computed(() => {
    const f = this.feedRate();
    const k = this.killRate();
    return PRESETS.find(p => p.f === f && p.k === k)?.label ?? '';
  });

  private U = new Float32Array(0);
  private V = new Float32Array(0);
  private nextU = new Float32Array(0);
  private nextV = new Float32Array(0);
  private simCols = 0;
  private simRows = 0;

  // Off-screen canvas at simulation resolution, scaled up to display canvas
  private simCanvas!: HTMLCanvasElement;
  private simCtx!: CanvasRenderingContext2D;
  private simImageData!: ImageData;

  private animFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Pre-computed colour LUT: index = V*512 clamped to 255 → [R, G, B]
  // Maps 0 (no V) → dark background, 255 (high V) → bright cyan
  private readonly colorLut = this.buildColorLut();

  constructor() {
    afterNextRender(() => {
      this.simCanvas = document.createElement('canvas');
      this.simCtx = this.simCanvas.getContext('2d')!;

      const canvas = this.canvasRef().nativeElement;
      this.resizeObserver = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        canvas.width = width;
        canvas.height = height;
        this.init(width, height);
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

  reset() {
    this.isRunning.set(false);
    const canvas = this.canvasRef().nativeElement;
    this.init(canvas.width, canvas.height);
    this.draw();
  }

  applyPreset(preset: Preset) {
    this.feedRate.set(preset.f);
    this.killRate.set(preset.k);
    this.reset();
  }

  onFeedChange(event: Event) {
    this.feedRate.set(Number((event.target as HTMLInputElement).value));
  }

  onKillChange(event: Event) {
    this.killRate.set(Number((event.target as HTMLInputElement).value));
  }

  onSpeedChange(event: Event) {
    this.stepsPerFrame.set(Number((event.target as HTMLInputElement).value));
  }

  private init(displayWidth: number, displayHeight: number) {
    const cols = Math.max(1, Math.floor(displayWidth / SCALE));
    const rows = Math.max(1, Math.floor(displayHeight / SCALE));
    this.simCols = cols;
    this.simRows = rows;

    this.U = new Float32Array(rows * cols);
    this.V = new Float32Array(rows * cols);
    this.nextU = new Float32Array(rows * cols);
    this.nextV = new Float32Array(rows * cols);

    this.U.fill(1.0);
    // V stays 0; seed a few random patches to kick off the reaction
    this.seedPatches();

    this.simCanvas.width = cols;
    this.simCanvas.height = rows;
    this.simImageData = this.simCtx.createImageData(cols, rows);
    // Pre-fill alpha channel (stays 255 throughout)
    const d = this.simImageData.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
  }

  private seedPatches() {
    const { simCols: cols, simRows: rows } = this;
    const patchR = 5;
    for (let s = 0; s < 8; s++) {
      const cx = Math.floor(Math.random() * cols);
      const cy = Math.floor(Math.random() * rows);
      for (let dy = -patchR; dy <= patchR; dy++) {
        for (let dx = -patchR; dx <= patchR; dx++) {
          const r = (cy + dy + rows) % rows;
          const c = (cx + dx + cols) % cols;
          const idx = r * cols + c;
          this.U[idx] = 0.5 + (Math.random() - 0.5) * 0.1;
          this.V[idx] = 0.25 + (Math.random() - 0.5) * 0.1;
        }
      }
    }
  }

  private step() {
    const { simCols: cols, simRows: rows, U, V, nextU, nextV } = this;
    const f = this.feedRate();
    const k = this.killRate();

    for (let row = 0; row < rows; row++) {
      // Avoid modulo in the hot loop — compute row offsets once per row
      const rAbove = (row === 0 ? rows - 1 : row - 1) * cols;
      const rCurr = row * cols;
      const rBelow = (row === rows - 1 ? 0 : row + 1) * cols;

      for (let col = 0; col < cols; col++) {
        const cL = col === 0 ? cols - 1 : col - 1;
        const cR = col === cols - 1 ? 0 : col + 1;
        const idx = rCurr + col;

        const lapU =
          -U[idx] +
          0.2 * (U[rAbove + col] + U[rBelow + col] + U[rCurr + cL] + U[rCurr + cR]) +
          0.05 * (U[rAbove + cL] + U[rAbove + cR] + U[rBelow + cL] + U[rBelow + cR]);

        const lapV =
          -V[idx] +
          0.2 * (V[rAbove + col] + V[rBelow + col] + V[rCurr + cL] + V[rCurr + cR]) +
          0.05 * (V[rAbove + cL] + V[rAbove + cR] + V[rBelow + cL] + V[rBelow + cR]);

        const u = U[idx];
        const v = V[idx];
        const uvv = u * v * v;

        let nu = u + DU * lapU - uvv + f * (1 - u);
        let nv = v + DV * lapV + uvv - (f + k) * v;
        if (nu < 0) nu = 0; else if (nu > 1) nu = 1;
        if (nv < 0) nv = 0; else if (nv > 1) nv = 1;
        nextU[idx] = nu;
        nextV[idx] = nv;
      }
    }

    // Swap buffers
    this.U = nextU; this.nextU = U;
    this.V = nextV; this.nextV = V;
  }

  private draw() {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || !this.simImageData) return;

    const { simCols: cols, simRows: rows, V } = this;
    const d = this.simImageData.data;
    const lut = this.colorLut;
    const n = rows * cols;

    for (let i = 0; i < n; i++) {
      // V is typically 0–0.5; multiply by 512 to fill the 0–255 LUT range
      const vi = V[i] * 512 > 255 ? 255 : (V[i] * 512) | 0;
      const ci = vi * 3;
      const di = i * 4;
      d[di] = lut[ci];
      d[di + 1] = lut[ci + 1];
      d[di + 2] = lut[ci + 2];
      // alpha already set to 255 in init
    }

    this.simCtx.putImageData(this.simImageData, 0, 0);

    // Scale the sim canvas up to the display canvas with smooth interpolation
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.simCanvas, 0, 0, canvas.width, canvas.height);
  }

  private scheduleFrame() {
    this.animFrameId = requestAnimationFrame(() => {
      if (!this.isRunning()) {
        this.animFrameId = null;
        return;
      }
      const steps = this.stepsPerFrame();
      for (let i = 0; i < steps; i++) this.step();
      this.draw();
      this.scheduleFrame();
    });
  }

  private buildColorLut(): Uint8ClampedArray {
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let r: number, g: number, b: number;
      if (t < 0.5) {
        const s = t * 2;
        r = Math.round(8 + s * 12);
        g = Math.round(8 + s * 92);
        b = Math.round(15 + s * 145);
      } else {
        const s = (t - 0.5) * 2;
        r = Math.round(20 + s * 100);
        g = Math.round(100 + s * 110);
        b = Math.round(160 + s * 95);
      }
      lut[i * 3] = r;
      lut[i * 3 + 1] = g;
      lut[i * 3 + 2] = b;
    }
    return lut;
  }
}
