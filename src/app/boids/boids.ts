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

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const BOID_SIZE = 8;
const MAX_FORCE = 0.1;
const MIN_SPEED = 0.5;
// Separation radius is this fraction of the perception radius
const SEP_RATIO = 0.4;
// Buffer capacity — well above the slider max of 300
const MAX_BOIDS = 512;

@Component({
  selector: 'app-boids',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InfoPanelComponent],
  templateUrl: './boids.html',
  styleUrl: './boids.scss',
})
export class BoidsComponent implements OnDestroy {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly isRunning = signal(false);
  readonly boidCount = signal(150);
  readonly perception = signal(75);
  readonly maxSpeed = signal(3);
  readonly separationWeight = signal(1.5);
  readonly alignmentWeight = signal(1.0);
  readonly cohesionWeight = signal(1.0);

  private boids: Boid[] = [];
  // Pre-allocated velocity buffers so we don't allocate per frame
  private readonly newVx = new Float32Array(MAX_BOIDS);
  private readonly newVy = new Float32Array(MAX_BOIDS);
  private width = 0;
  private height = 0;
  private animFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      const canvas = this.canvasRef().nativeElement;

      this.resizeObserver = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        canvas.width = width;
        canvas.height = height;
        this.width = width;
        this.height = height;
        this.spawnBoids();
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
    this.spawnBoids();
    this.draw();
  }

  onBoidCountChange(event: Event) {
    const count = Number((event.target as HTMLInputElement).value);
    this.boidCount.set(count);
    while (this.boids.length < count) this.boids.push(this.randomBoid());
    while (this.boids.length > count) this.boids.pop();
  }

  onPerceptionChange(event: Event) {
    this.perception.set(Number((event.target as HTMLInputElement).value));
  }

  onMaxSpeedChange(event: Event) {
    this.maxSpeed.set(Number((event.target as HTMLInputElement).value));
  }

  onSeparationChange(event: Event) {
    this.separationWeight.set(Number((event.target as HTMLInputElement).value));
  }

  onAlignmentChange(event: Event) {
    this.alignmentWeight.set(Number((event.target as HTMLInputElement).value));
  }

  onCohesionChange(event: Event) {
    this.cohesionWeight.set(Number((event.target as HTMLInputElement).value));
  }

  private spawnBoids() {
    this.boids = Array.from({ length: this.boidCount() }, () => this.randomBoid());
  }

  private randomBoid(): Boid {
    const angle = Math.random() * Math.PI * 2;
    const speed = MIN_SPEED + Math.random() * (this.maxSpeed() - MIN_SPEED);
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
  }

  private step() {
    const { width, height, boids } = this;
    const n = boids.length;
    if (n === 0) return;

    const maxSpd = this.maxSpeed();
    const perc = this.perception();
    const perc2 = perc * perc;
    const sepDist2 = (perc * SEP_RATIO) ** 2;
    const sepW = this.separationWeight();
    const aliW = this.alignmentWeight();
    const cohW = this.cohesionWeight();
    const hw = width * 0.5;
    const hh = height * 0.5;

    for (let i = 0; i < n; i++) {
      const b = boids[i];

      let sepX = 0, sepY = 0, sepCount = 0;
      let aliX = 0, aliY = 0;
      let cohX = 0, cohY = 0;
      let neighborCount = 0;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const o = boids[j];

        // Toroidal delta — use shortest path across wrapped edges
        let dx = o.x - b.x;
        let dy = o.y - b.y;
        if (dx > hw) dx -= width;
        else if (dx < -hw) dx += width;
        if (dy > hh) dy -= height;
        else if (dy < -hh) dy += height;

        const d2 = dx * dx + dy * dy;
        if (d2 >= perc2) continue;

        neighborCount++;
        aliX += o.vx;
        aliY += o.vy;
        cohX += dx; // delta toward neighbor, so average = direction to center of mass
        cohY += dy;

        if (d2 < sepDist2 && d2 > 0) {
          const d = Math.sqrt(d2);
          sepX -= dx / d; // push away
          sepY -= dy / d;
          sepCount++;
        }
      }

      let fx = 0, fy = 0;

      if (neighborCount > 0) {
        const inv = 1 / neighborCount;

        // Alignment: match average velocity direction
        const avgVx = aliX * inv;
        const avgVy = aliY * inv;
        fx += this.steer(b.vx, b.vy, avgVx, avgVy, maxSpd) * aliW;
        fy += this.steerY(b.vy, b.vx, avgVy, avgVx, maxSpd) * aliW;

        // Cohesion: move toward center of mass
        const avgCx = cohX * inv;
        const avgCy = cohY * inv;
        fx += this.steer(b.vx, b.vy, avgCx, avgCy, maxSpd) * cohW;
        fy += this.steerY(b.vy, b.vx, avgCy, avgCx, maxSpd) * cohW;
      }

      // Separation: move away from crowded neighbors
      if (sepCount > 0) {
        fx += this.steer(b.vx, b.vy, sepX, sepY, maxSpd) * sepW;
        fy += this.steerY(b.vy, b.vx, sepY, sepX, maxSpd) * sepW;
      }

      let nvx = b.vx + fx;
      let nvy = b.vy + fy;
      const spd = Math.sqrt(nvx * nvx + nvy * nvy);

      if (spd > maxSpd) {
        nvx = (nvx / spd) * maxSpd;
        nvy = (nvy / spd) * maxSpd;
      } else if (spd > 0 && spd < MIN_SPEED) {
        nvx = (nvx / spd) * MIN_SPEED;
        nvy = (nvy / spd) * MIN_SPEED;
      } else if (spd === 0) {
        const a = Math.atan2(b.vy, b.vx);
        nvx = Math.cos(a) * MIN_SPEED;
        nvy = Math.sin(a) * MIN_SPEED;
      }

      this.newVx[i] = nvx;
      this.newVy[i] = nvy;
    }

    for (let i = 0; i < n; i++) {
      const b = boids[i];
      b.vx = this.newVx[i];
      b.vy = this.newVy[i];
      b.x = (b.x + b.vx + width) % width;
      b.y = (b.y + b.vy + height) % height;
    }
  }

  // Returns the x component of the Reynolds steering force:
  // desired = normalize(target) * maxSpeed; steer = desired - current; clamped to MAX_FORCE
  private steer(cvx: number, cvy: number, tx: number, ty: number, maxSpd: number): number {
    const mag = Math.sqrt(tx * tx + ty * ty);
    if (mag === 0) return 0;
    const dx = (tx / mag) * maxSpd - cvx;
    const dy = (ty / mag) * maxSpd - cvy;
    const fMag = Math.sqrt(dx * dx + dy * dy);
    return fMag > MAX_FORCE ? (dx / fMag) * MAX_FORCE : dx;
  }

  // Same but returns the y component (arguments mirrored so we avoid a struct return)
  private steerY(cvy: number, cvx: number, ty: number, tx: number, maxSpd: number): number {
    const mag = Math.sqrt(tx * tx + ty * ty);
    if (mag === 0) return 0;
    const dx = (tx / mag) * maxSpd - cvx;
    const dy = (ty / mag) * maxSpd - cvy;
    const fMag = Math.sqrt(dx * dx + dy * dy);
    return fMag > MAX_FORCE ? (dy / fMag) * MAX_FORCE : dy;
  }

  private scheduleFrame() {
    this.animFrameId = requestAnimationFrame(() => {
      if (!this.isRunning()) {
        this.animFrameId = null;
        return;
      }
      this.step();
      this.draw();
      this.scheduleFrame();
    });
  }

  private draw() {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || this.boids.length === 0) return;

    const { width, height } = canvas;
    const size = BOID_SIZE;

    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, width, height);

    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(100, 200, 255, 0.55)';
    ctx.fillStyle = 'rgba(120, 210, 255, 0.9)';
    ctx.beginPath();

    for (const b of this.boids) {
      const angle = Math.atan2(b.vy, b.vx);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Nose
      ctx.moveTo(b.x + cos * size, b.y + sin * size);
      // Left wing
      ctx.lineTo(
        b.x - cos * size * 0.55 + sin * size * 0.45,
        b.y - sin * size * 0.55 - cos * size * 0.45,
      );
      // Right wing
      ctx.lineTo(
        b.x - cos * size * 0.55 - sin * size * 0.45,
        b.y - sin * size * 0.55 + cos * size * 0.45,
      );
      ctx.closePath();
    }

    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
