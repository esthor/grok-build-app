/** winamp's spectrum drew 19 bars in its 76px window; we keep the count */
export const BAND_COUNT = 19;
export const SCOPE_LENGTH = 152;

/**
 * Winamp visualizers ate PCM; ours eat harness activity. Token output feeds
 * the mids, tool launches kick the bass, permission prompts spike the highs.
 * Decay per tick keeps it looking like a real analyzer at rest.
 */
export class VisAnalyser {
  private readonly bands = new Float32Array(BAND_COUNT);
  private readonly scope = new Float32Array(SCOPE_LENGTH);
  private readonly tickMs: number;
  private phase = 0;
  private tokenWindow: number[] = [];
  private windowTokens = 0;

  constructor(tickMs = 100) {
    this.tickMs = tickMs;
  }

  /** region: 0 bass .. 1 highs; amount 0..1 */
  pushEnergy(region: number, amount: number): void {
    const center = Math.max(0, Math.min(BAND_COUNT - 1, Math.round(region * (BAND_COUNT - 1))));
    for (let i = 0; i < BAND_COUNT; i++) {
      const dist = Math.abs(i - center);
      const spread = Math.exp(-(dist * dist) / 6);
      const next = (this.bands[i] ?? 0) + amount * spread;
      this.bands[i] = Math.min(1, next);
    }
  }

  recordTokens(count: number): void {
    this.windowTokens += count;
  }

  /** advance one engine tick */
  tick(): void {
    for (let i = 0; i < BAND_COUNT; i++) {
      const decay = 0.82 - (i / BAND_COUNT) * 0.1; // highs die faster
      this.bands[i] = (this.bands[i] ?? 0) * decay;
    }
    this.tokenWindow.push(this.windowTokens);
    this.windowTokens = 0;
    if (this.tokenWindow.length > Math.max(1, Math.round(2000 / this.tickMs))) {
      this.tokenWindow.shift();
    }

    // synthesize a scope trace whose amplitude follows total energy
    let total = 0;
    for (let i = 0; i < BAND_COUNT; i++) {
      total += this.bands[i] ?? 0;
    }
    const amp = Math.min(1, total / 6);
    this.phase += 0.9 + amp * 1.4;
    for (let i = 0; i < SCOPE_LENGTH; i++) {
      const t = this.phase + i * 0.24;
      const wave = Math.sin(t) * 0.6 + Math.sin(t * 0.37 + 1.7) * 0.4;
      this.scope[i] = wave * amp;
    }
  }

  /** copy out so render code can't mutate internals */
  getBands(target: Float32Array): void {
    target.set(this.bands.subarray(0, Math.min(BAND_COUNT, target.length)));
  }

  getScope(target: Float32Array): void {
    target.set(this.scope.subarray(0, Math.min(SCOPE_LENGTH, target.length)));
  }

  tokensPerSecond(): number {
    if (this.tokenWindow.length === 0) {
      return 0;
    }
    let sum = 0;
    for (const n of this.tokenWindow) {
      sum += n;
    }
    return (sum / this.tokenWindow.length) * (1000 / this.tickMs);
  }

  reset(): void {
    this.bands.fill(0);
    this.scope.fill(0);
    this.tokenWindow = [];
    this.windowTokens = 0;
  }
}
