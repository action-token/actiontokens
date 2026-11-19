import { BRIDGE, bodyShape, GCY, guitarTransform, NUT, STRING_GAP, type StageLayout } from "./guitar";

export const STRING_COUNT = 6;

export interface GuitarString {
  amp: number;
  t0: number;
  freq: number;
  width: number;
  lit: number;
}

/** Low E (thick, bottom) to high E (thin, top). */
export function createStrings(): GuitarString[] {
  return Array.from({ length: STRING_COUNT }, (_, i) => ({
    amp: 0,
    t0: 0,
    freq: 7 + i * 2.4,
    width: 3.2 - i * 0.45,
    lit: 0,
  }));
}

export function pluck(s: GuitarString, layout: StageLayout, now: number, force = 1) {
  s.amp = Math.min(STRING_GAP * layout.scale * 0.75, 26) * force;
  s.t0 = now;
  s.lit = 1;
}

/**
 * Draws the six strings (with their shadow on the neck/body) and a slow band of light that
 * sweeps across the lacquer. `progress` (0–1) brightens the sweep.
 */
export function drawStrings(
  ctx: CanvasRenderingContext2D,
  strings: GuitarString[],
  l: StageLayout,
  now: number,
  progress: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  // Drawn in guitar units, so the same code works sideways and standing up.
  guitarTransform(ctx, l);
  // The string really runs nut → bridge (both off screen), so the wave's nodes are there too.
  const start = l.far - 10;
  const end = Math.min(BRIDGE, l.crop + 10);
  const steps = 80;
  const pts = new Float32Array((steps + 1) * 2);

  strings.forEach((s, i) => {
    const gy = GCY + (STRING_COUNT - 1 - i - (STRING_COUNT - 1) / 2) * STRING_GAP;
    const t = (now - s.t0) / 1000;
    const a = (s.amp / l.scale) * Math.exp(-t * 2.2);
    s.lit *= 0.975;
    for (let k = 0; k <= steps; k++) {
      const x = start + ((end - start) * k) / steps;
      const u = (x - NUT) / (BRIDGE - NUT);
      // fundamental + a little 2nd harmonic, standing wave fixed at nut and bridge
      const y =
        a *
        (Math.sin(Math.PI * u) * Math.cos(s.freq * t * 6.283) +
          0.3 * Math.sin(2 * Math.PI * u) * Math.cos(s.freq * 2.01 * t * 6.283));
      pts[k * 2] = x;
      pts[k * 2 + 1] = gy + y;
    }
    const trace = (dy: number) => {
      ctx.beginPath();
      for (let k = 0; k < pts.length; k += 2) {
        if (k) ctx.lineTo(pts[k]!, pts[k + 1]! + dy);
        else ctx.moveTo(pts[k]!, pts[k + 1]! + dy);
      }
    };
    const width = (s.width * Math.max(0.8, l.scale * 0.7)) / l.scale;
    trace(3);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = width + 1 / l.scale;
    ctx.stroke();
    trace(0);
    ctx.strokeStyle = s.lit > 0.05 ? `rgba(219,220,44,${0.3 + s.lit * 0.7})` : "rgba(201,204,187,.55)";
    ctx.lineWidth = width;
    if (s.lit > 0.2) {
      ctx.shadowColor = "rgba(219,220,44,.6)";
      ctx.shadowBlur = 14 * s.lit;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  });
  ctx.restore();

  // a slow band of light sweeping across the lacquer
  const ph = (now / 5200) % 1;
  const sx = 860 + ph * 900;
  ctx.save();
  guitarTransform(ctx, l);
  ctx.clip(bodyShape());
  const sh = ctx.createLinearGradient(sx - 120, 60, sx + 60, 540);
  const alpha = (0.05 + progress * 0.1).toFixed(3);
  sh.addColorStop(0, "rgba(255,255,240,0)");
  sh.addColorStop(0.5, `rgba(255,255,240,${alpha})`);
  sh.addColorStop(1, "rgba(255,255,240,0)");
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = sh;
  ctx.fillRect(800, GCY - 260, 900, 540);
  ctx.restore();
}
