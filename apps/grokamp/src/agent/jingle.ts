/**
 * An ORIGINAL demo jingle. Winamp shipped DEMO.MP3 — a copyrighted
 * recording we can't include — so Grokamp bleats its own tiny square-wave
 * fanfare, synthesized at runtime. No assets, no samples, pure WebAudio.
 */
export function playLlamaJingle(): void {
  try {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.12;
    master.connect(ctx.destination);

    // a bouncy little fanfare (original composition)
    const notes: readonly (readonly [number, number, number])[] = [
      // [start, duration, hz]
      [0.0, 0.11, 392], // G4
      [0.12, 0.11, 523], // C5
      [0.24, 0.11, 659], // E5
      [0.36, 0.22, 784], // G5
      [0.6, 0.11, 659], // E5
      [0.72, 0.3, 784], // G5
    ];
    for (const [start, duration, hz] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      osc.connect(gain).connect(master);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    }

    // the "bleat": a wobbly saw slide, our llama's signature
    const bleat = ctx.createOscillator();
    const bleatGain = ctx.createGain();
    const wobble = ctx.createOscillator();
    const wobbleGain = ctx.createGain();
    bleat.type = "sawtooth";
    bleat.frequency.setValueAtTime(220, ctx.currentTime + 1.05);
    bleat.frequency.linearRampToValueAtTime(165, ctx.currentTime + 1.45);
    wobble.frequency.value = 9;
    wobbleGain.gain.value = 14;
    wobble.connect(wobbleGain).connect(bleat.frequency);
    bleatGain.gain.setValueAtTime(0.0001, ctx.currentTime + 1.05);
    bleatGain.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 1.1);
    bleatGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
    bleat.connect(bleatGain).connect(master);
    wobble.start(ctx.currentTime + 1.05);
    bleat.start(ctx.currentTime + 1.05);
    bleat.stop(ctx.currentTime + 1.55);
    wobble.stop(ctx.currentTime + 1.55);

    window.setTimeout(() => {
      void ctx.close();
    }, 2200);
  } catch {
    // no audio context (headless, autoplay policy) — the llama stays silent
  }
}
