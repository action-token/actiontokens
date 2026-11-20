/**
 * The loader's track waveform: mirrored bars like an audio player. The part up to the current
 * progress is "played" (chartreuse), the rest is dim, and a glowing playhead marks the progress.
 */

const BAR = 3;
const GAP = 2;
const STEP = BAR + GAP;

export interface Wave {
  peaks: Float32Array;
  width: number;
  height: number;
  dpr: number;
}

/** A believable track shape: quiet intro, louder body, a fade at the end. Same shape every time. */
function makePeaks(count: number): Float32Array {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const raw = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const envelope = 0.3 + 0.7 * Math.pow(Math.sin(t * Math.PI), 0.5);
    const beat = 0.45 + 0.55 * Math.abs(Math.sin(i * 0.37) * Math.sin(i * 0.11 + 1));
    raw[i] = envelope * beat + rnd() * 0.18;
  }
  const peaks = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const avg = ((raw[i - 1] ?? raw[i]!) + raw[i]! * 2 + (raw[i + 1] ?? raw[i]!)) / 4;
    peaks[i] = Math.max(0.08, Math.min(1, avg));
  }
  return peaks;
}

/** Sizes the canvas to its box and builds the bars. Returns null while the canvas is hidden. */
export function createWave(canvas: HTMLCanvasElement, dpr: number): Wave | null {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return null;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  return { peaks: makePeaks(Math.floor((width + GAP) / STEP)), width, height, dpr };
}

export function drawWave(ctx: CanvasRenderingContext2D, wave: Wave, progress: number, now: number) {
  const { peaks, width, height, dpr } = wave;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const mid = Math.round(height * 0.64);
  const head = progress * width;

  for (let i = 0; i < peaks.length; i++) {
    const x = i * STEP;
    const played = x + BAR <= head;
    // the bars just behind the playhead pulse a little, like the music is playing there
    const near = played && head - x < 48 ? 1 + 0.22 * Math.sin(now / 90 + i * 1.3) : 1;
    const top = Math.max(1.5, peaks[i]! * (mid - 4) * near);
    const bottom = Math.max(1, peaks[i]! * (height - mid - 2) * 0.85);
    ctx.fillStyle = played ? "#4dff2a" : "#3b3e31";
    ctx.beginPath();
    ctx.roundRect(x, mid - top, BAR, top, 1.5);
    ctx.fill();
    ctx.fillStyle = played ? "rgba(219,220,44,.32)" : "rgba(59,62,49,.55)";
    ctx.beginPath();
    ctx.roundRect(x, mid + 1, BAR, bottom, 1.5);
    ctx.fill();
  }

  if (progress <= 0) return;
  // playhead: a thin line and a glowing dot on the centre line
  ctx.fillStyle = "rgba(243,244,234,.5)";
  ctx.fillRect(Math.round(head), 2, 1, height - 4);
  ctx.save();
  ctx.shadowColor = "rgba(219,220,44,.9)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#fbfcd0";
  ctx.beginPath();
  ctx.arc(head, mid, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
