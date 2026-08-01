// Wallpaper FX layer: drifting dot grid, rising ember particles, and a slow
// scan sweep. Decorative motion only — the honest numbers live in widgets.

import { cssVar } from "../lib.ts";

type Particle = {
  x: number;
  y: number;
  speed: number;
  drift: number;
  size: number;
  tw: number;
};

export class Backdrop {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private particles: Particle[] = [];
  private w = 0;
  private h = 0;
  private accent = "#56e8ff";
  private gridDot = "rgba(86,232,255,0.05)";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.retheme();
  }

  retheme(): void {
    this.accent = cssVar("--accent") || "#56e8ff";
    this.gridDot = cssVar("--grid-dot") || "rgba(86,232,255,0.05)";
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.floor((this.w * this.h) / 34_000);
    this.particles = Array.from({ length: count }, () => this.spawn(true));
  }

  private spawn(anywhere: boolean): Particle {
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : this.h + 4,
      speed: 4 + Math.random() * 10,
      drift: (Math.random() - 0.5) * 3,
      size: Math.random() < 0.85 ? 1 : 1.6,
      tw: Math.random() * Math.PI * 2,
    };
  }

  tick(now: number): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const t = now / 1000;
    ctx.clearRect(0, 0, this.w, this.h);

    // Dot grid with slow drift.
    const gap = 28;
    const off = (t * 1.6) % gap;
    ctx.fillStyle = this.gridDot;
    for (let x = -gap + off; x < this.w + gap; x += gap) {
      for (let y = -gap + off * 0.6; y < this.h + gap; y += gap) {
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Rising particles with twinkle.
    for (const p of this.particles) {
      p.y -= p.speed / 60;
      p.x += p.drift / 60;
      if (p.y < -6 || p.x < -6 || p.x > this.w + 6) {
        Object.assign(p, this.spawn(false));
      }
      const a = 0.05 + 0.09 * Math.abs(Math.sin(t * 0.8 + p.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = this.accent;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Scan sweep: a faint band gliding down every ~11s.
    const period = 11;
    const phase = (t % period) / period;
    const bandY = phase * (this.h + 240) - 120;
    const grad = ctx.createLinearGradient(0, bandY - 90, 0, bandY + 90);
    grad.addColorStop(0, "transparent");
    grad.addColorStop(0.5, this.hexA(this.accent, 0.028));
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0, bandY - 90, this.w, 180);
  }

  private hexA(hex: string, alpha: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (m === null || m[1] === undefined) return `rgba(120,220,255,${alpha})`;
    const int = parseInt(m[1], 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
