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

@Component({
  selector: 'app-chaos-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InfoPanelComponent],
  templateUrl: './chaos-game.html',
  styleUrl: './chaos-game.scss',
})
export class ChaosGameComponent implements OnDestroy {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly isRunning = signal(false);
  readonly vertexCount = signal(3);
  readonly jumpRatio = signal(0.5);
  readonly pointsPerFrame = signal(10);
  readonly totalPoints = signal(0);

  private vertices: { x: number; y: number }[] = [];
  private px = 0;
  private py = 0;
  private imageData!: ImageData;
  private animFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      const canvas = this.canvasRef().nativeElement;

      this.resizeObserver = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        canvas.width = width;
        canvas.height = height;
        this.init();
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
    this.init();
    this.draw();
  }

  onVertexCountChange(event: Event) {
    this.vertexCount.set(Number((event.target as HTMLInputElement).value));
    this.reset();
  }

  onJumpRatioChange(event: Event) {
    this.jumpRatio.set(Number((event.target as HTMLInputElement).value));
    this.reset();
  }

  onSpeedChange(event: Event) {
    this.pointsPerFrame.set(Number((event.target as HTMLInputElement).value));
  }

  private init() {
    const canvas = this.canvasRef().nativeElement;
    const { width, height } = canvas;
    if (width === 0 || height === 0) return;

    const n = this.vertexCount();
    const ratio = this.jumpRatio();
    const cx = width / 2;
    const cy = height / 2;
    // Slightly inset from edges so vertex markers aren't clipped
    const r = Math.min(width, height) * 0.44;

    // Regular polygon, first vertex at top
    this.vertices = Array.from({ length: n }, (_, i) => ({
      x: cx + r * Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n),
      y: cy + r * Math.sin(-Math.PI / 2 + (2 * Math.PI * i) / n),
    }));

    // Random starting position near the centre
    this.px = cx + (Math.random() - 0.5) * r * 0.5;
    this.py = cy + (Math.random() - 0.5) * r * 0.5;

    // Walk into the attractor before plotting so the burn-in scatter is invisible
    for (let i = 0; i < 50; i++) {
      const v = this.vertices[(Math.random() * n) | 0];
      this.px += (v.x - this.px) * ratio;
      this.py += (v.y - this.py) * ratio;
    }

    // Reset pixel buffer to background colour
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.imageData = ctx.createImageData(width, height);
    const d = this.imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 8;
      d[i + 1] = 8;
      d[i + 2] = 15;
      d[i + 3] = 255;
    }

    this.totalPoints.set(0);
  }

  private plotPoints(count: number) {
    const canvas = this.canvasRef().nativeElement;
    const { width, height } = canvas;
    const { vertices } = this;
    const nv = vertices.length;
    const ratio = this.jumpRatio();
    const d = this.imageData.data;
    let { px, py } = this;

    for (let i = 0; i < count; i++) {
      const v = vertices[(Math.random() * nv) | 0];
      px += (v.x - px) * ratio;
      py += (v.y - py) * ratio;

      const ix = px | 0;
      const iy = py | 0;
      if (ix >= 0 && ix < width && iy >= 0 && iy < height) {
        const idx = (iy * width + ix) * 4;
        d[idx] = 120;
        d[idx + 1] = 210;
        d[idx + 2] = 255;
        d[idx + 3] = 255;
      }
    }

    this.px = px;
    this.py = py;
  }

  private draw() {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || !this.imageData) return;

    ctx.putImageData(this.imageData, 0, 0);

    // Vertex markers drawn over the point cloud
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(255, 240, 160, 0.8)';
    ctx.fillStyle = 'rgba(255, 240, 160, 1.0)';
    for (const v of this.vertices) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  private scheduleFrame() {
    this.animFrameId = requestAnimationFrame(() => {
      if (!this.isRunning()) {
        this.animFrameId = null;
        return;
      }
      const pts = this.pointsPerFrame();
      this.plotPoints(pts);
      this.totalPoints.update(n => n + pts);
      this.draw();
      this.scheduleFrame();
    });
  }
}
