/** Tiny WebAudio beeps — no asset files. */

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = "square",
  gain = 0.08,
  when = 0,
): void {
  const audio = ac();
  if (!audio) return;
  const t0 = audio.currentTime + when;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const sfx = {
  ensure(): void {
    ac();
  },

  /** Rising dual-tone alarm for invasion warning. */
  siren(): void {
    tone(440, 0.22, "sawtooth", 0.07, 0);
    tone(660, 0.22, "sawtooth", 0.07, 0.2);
    tone(440, 0.22, "sawtooth", 0.07, 0.4);
    tone(660, 0.28, "sawtooth", 0.06, 0.6);
  },

  hit(): void {
    tone(180, 0.06, "square", 0.06);
    tone(90, 0.1, "sawtooth", 0.05, 0.04);
  },

  revive(): void {
    tone(520, 0.08, "sine", 0.06);
    tone(780, 0.12, "sine", 0.07, 0.08);
  },

  warn(): void {
    tone(320, 0.12, "triangle", 0.07);
    tone(240, 0.14, "triangle", 0.05, 0.1);
  },

  win(): void {
    tone(523, 0.1, "sine", 0.07);
    tone(659, 0.1, "sine", 0.07, 0.1);
    tone(784, 0.18, "sine", 0.08, 0.2);
  },

  lose(): void {
    tone(220, 0.18, "sawtooth", 0.07);
    tone(160, 0.28, "sawtooth", 0.06, 0.15);
  },
};
