/**
 * Four short stems of one made-up loop (drums, bass, chords, lead), drawn
 * with oscillators and noise into audio buffers. They line up bar for bar, so
 * mixing them behaves like real stems from a song. Browser only.
 */
export const DEMO_BPM = 96;
const BARS = 8;
const BEAT = 60 / DEMO_BPM;
export const DEMO_SECONDS = BARS * 4 * BEAT;

// Am, F, C, G: two bars each
const ROOTS = [55, 43.65, 65.41, 49];
const CHORDS = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [261.63, 329.63, 392],
  [196, 246.94, 293.66],
];

export const DEMO_STEMS = [
  { id: "drums", name: "Drums", color: "#f0b429", draw: drawDrums },
  { id: "bass", name: "Bass", color: "#4aa3df", draw: drawBass },
  { id: "chords", name: "Chords", color: "#b779e6", draw: drawChords },
  { id: "lead", name: "Lead", color: "#dbdc2c", draw: drawLead },
] as const;

type Ctx = OfflineAudioContext;

export async function renderDemoStems(sampleRate = 44100) {
  return Promise.all(
    DEMO_STEMS.map(async (stem) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(DEMO_SECONDS * sampleRate), sampleRate);
      stem.draw(ctx);
      return {
        id: stem.id,
        name: stem.name,
        color: stem.color,
        buffer: await ctx.startRendering(),
      };
    }),
  );
}

function note(
  ctx: Ctx,
  type: OscillatorType,
  freq: number,
  at: number,
  length: number,
  peak: number,
  filter?: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  let tail: AudioNode = osc;
  if (filter) {
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = filter;
    osc.connect(low);
    tail = low;
  }
  tail.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

function noise(ctx: Ctx, at: number, length: number, peak: number, highpass: number) {
  const buffer = ctx.createBuffer(1, Math.ceil(length * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = "highpass";
  filter.frequency.value = highpass;
  gain.gain.setValueAtTime(peak, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(at);
}

function drawDrums(ctx: Ctx) {
  for (let beat = 0; beat < BARS * 4; beat += 1) {
    const at = beat * BEAT;
    if (beat % 4 === 0 || beat % 4 === 2) {
      const kick = ctx.createOscillator();
      const gain = ctx.createGain();
      kick.frequency.setValueAtTime(150, at);
      kick.frequency.exponentialRampToValueAtTime(45, at + 0.18);
      gain.gain.setValueAtTime(0.9, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
      kick.connect(gain).connect(ctx.destination);
      kick.start(at);
      kick.stop(at + 0.3);
    }
    if (beat % 4 === 1 || beat % 4 === 3) noise(ctx, at, 0.16, 0.5, 1800);
    noise(ctx, at, 0.04, 0.18, 7000);
    noise(ctx, at + BEAT / 2, 0.04, 0.12, 7000);
  }
}

function drawBass(ctx: Ctx) {
  for (let bar = 0; bar < BARS; bar += 1) {
    const root = ROOTS[Math.floor(bar / 2)]!;
    for (let eighth = 0; eighth < 8; eighth += 1) {
      if (eighth % 4 === 3) continue;
      note(
        ctx,
        "sawtooth",
        eighth === 4 ? root * 2 : root,
        (bar * 4 + eighth / 2) * BEAT,
        BEAT * 0.45,
        0.32,
        380,
      );
    }
  }
}

function drawChords(ctx: Ctx) {
  for (let bar = 0; bar < BARS; bar += 1) {
    for (const freq of CHORDS[Math.floor(bar / 2)]!)
      note(ctx, "triangle", freq, bar * 4 * BEAT, BEAT * 3.6, 0.13);
  }
}

function drawLead(ctx: Ctx) {
  for (let bar = 0; bar < BARS; bar += 1) {
    const chord = CHORDS[Math.floor(bar / 2)]!;
    for (let eighth = 0; eighth < 8; eighth += 1) {
      const freq = chord[(eighth * 2 + bar) % 3]! * 2;
      note(ctx, "sine", freq, (bar * 4 + eighth / 2) * BEAT, BEAT * 0.5, 0.2);
    }
  }
}
