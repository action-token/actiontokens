/**
 * The half guitar behind the stage loader, painted once into a canvas.
 *
 * The guitar is drawn in its own units (a 1600 × 600 board, strings centred on y = 300) and
 * scaled so its strings line up with the animated ones. The right screen edge cuts the body in
 * half: the headstock is off to the left and the tail is off to the right, so the guitar is
 * implied rather than shown whole.
 */

export const NUT = 182;
export const BRIDGE = 1402;
export const GCY = 300;
/** Guitar x that sits on the right screen edge. */
export const CROP = 1262;
/** Strings are 17 guitar units apart at the body. */
export const STRING_GAP = 17;

const BODY_D =
  "M960 252 C930 240 884 205 893 165 C902 130 948 122 990 140 C1045 163 1085 150 1135 118 C1225 66 1385 70 1475 112 C1565 154 1592 262 1576 332 C1560 424 1492 502 1400 517 C1300 533 1190 508 1120 472 C1070 446 1030 457 990 472 C950 487 913 472 913 440 C913 400 944 370 962 350 Z";
const GUARD_D =
  "M1040 218 C1080 205 1120 190 1170 196 C1240 205 1270 238 1300 250 L1345 262 L1345 338 C1320 356 1330 410 1290 446 C1250 482 1170 470 1110 448 C1060 430 1020 420 1000 400 C985 380 990 350 1010 340 L1010 260 C1012 236 1024 224 1040 218 Z";

let bodyPath: Path2D | null = null;
let guardPath: Path2D | null = null;
/** Created on first use: Path2D does not exist on the server. */
export function bodyShape(): Path2D {
  return (bodyPath ??= new Path2D(BODY_D));
}
function guardShape(): Path2D {
  return (guardPath ??= new Path2D(GUARD_D));
}

/** Real fret spacing (rule of 18). */
export const fretX = (n: number) => NUT + (BRIDGE - NUT) * (1 - Math.pow(2, -n / 12));

/**
 * Screen placement shared by the guitar and the strings.
 * Landscape: the neck runs in from the left, the right edge cuts the body in half.
 * Portrait phones: the guitar stands up, the neck comes down from the top and the bottom edge cuts the body.
 */
export interface StageLayout {
  width: number;
  height: number;
  dpr: number;
  /** Screen px per guitar unit. */
  scale: number;
  portrait: boolean;
  /** Guitar x that sits on the screen edge cutting the body. */
  crop: number;
  /** Screen coordinate of the strings' centre line (y in landscape, x in portrait). */
  cross: number;
  /** Guitar x at the opposite screen edge, toward the hidden headstock. */
  far: number;
}

export function computeLayout(width: number, height: number, dpr: number): StageLayout {
  const portrait = height > width && width < 820;
  if (portrait) {
    const scale = Math.min((width * 0.98) / 460, height / 760);
    const crop = 1196;
    return { width, height, dpr, scale, portrait, crop, cross: width / 2, far: crop - height / scale };
  }
  const scale = Math.min((height * 0.98) / 460, width / (width < 600 ? 560 : 780), 1.7);
  return { width, height, dpr, scale, portrait, crop: CROP, cross: height * 0.44, far: CROP - width / scale };
}

/** Canvas transform that maps guitar units onto the screen (rotated a quarter turn in portrait). */
export function guitarTransform(ctx: CanvasRenderingContext2D, l: StageLayout) {
  const k = l.dpr * l.scale;
  if (l.portrait) {
    ctx.setTransform(0, k, -k, 0, l.dpr * (l.cross + GCY * l.scale), l.dpr * (l.height - l.crop * l.scale));
  } else {
    ctx.setTransform(k, 0, 0, k, l.dpr * (l.width - l.crop * l.scale), l.dpr * (l.cross - GCY * l.scale));
  }
}

type Stop = [number, string];

export function drawGuitar(g: CanvasRenderingContext2D, l: StageLayout) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  guitarTransform(g, l);
  const BODY = bodyShape();
  const GUARD = guardShape();
  const left = l.far - 20; // guitar x at the far screen edge (toward the hidden headstock)

  const lin = (x0: number, y0: number, x1: number, y1: number, stops: Stop[]) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    return gr;
  };
  const chrome = (y0: number, y1: number) =>
    lin(0, y0, 0, y1, [
      [0, "#f7f8f1"],
      [0.42, "#9a9d8f"],
      [0.55, "#55574d"],
      [1, "#e1e3d8"],
    ]);
  const screw = (x: number, y: number, r = 5) => {
    g.fillStyle = chrome(y - r, y + r);
    g.beginPath();
    g.arc(x, y, r, 0, 7);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,.55)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x - r * 0.6, y - r * 0.3);
    g.lineTo(x + r * 0.6, y + r * 0.3);
    g.stroke();
  };

  // ── body: glow + floor shadow, sunburst, grain, clear-coat, bevel, binding ──
  g.save();
  g.shadowColor = "rgba(219,220,44,.28)";
  g.shadowBlur = 90;
  g.fillStyle = "#111";
  g.fill(BODY);
  g.restore();
  g.save();
  g.shadowColor = "rgba(0,0,0,.75)";
  g.shadowBlur = 50;
  g.shadowOffsetY = 22;
  g.fillStyle = "#111";
  g.fill(BODY);
  g.restore();

  const burst = g.createRadialGradient(1290, 300, 0, 1290, 300, 420);
  (
    [
      [0, "#f6f78a"],
      [0.3, "#e3e43a"],
      [0.55, "#b4b51c"],
      [0.75, "#5f600c"],
      [0.9, "#2a2b07"],
      [1, "#141503"],
    ] as Stop[]
  ).forEach(([o, c]) => burst.addColorStop(o, c));
  g.fillStyle = burst;
  g.fill(BODY);

  g.save();
  g.clip(BODY);
  for (let k = 0; k < 46; k++) {
    const r = 40 + k * 9.5 + Math.sin(k * 1.7) * 4;
    g.strokeStyle = k % 3 ? "rgba(40,30,0,.06)" : "rgba(255,255,220,.05)";
    g.lineWidth = 1 + (k % 4) * 0.6;
    g.beginPath();
    g.ellipse(1300 + Math.sin(k) * 6, 300 + Math.cos(k * 0.7) * 5, r * 1.25, r, 0.08, 0, 7);
    g.stroke();
  }
  g.fillStyle = lin(0, 60, 0, 540, [
    [0, "rgba(255,255,255,.32)"],
    [0.22, "rgba(255,255,255,.04)"],
    [0.62, "rgba(0,0,0,0)"],
    [1, "rgba(0,0,0,.42)"],
  ]);
  g.fill(BODY);
  g.fillStyle = lin(1020, 90, 1260, 420, [
    [0, "rgba(255,255,255,0)"],
    [0.44, "rgba(255,255,255,0)"],
    [0.5, "rgba(255,255,255,.22)"],
    [0.56, "rgba(255,255,255,0)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  g.fill(BODY);
  g.strokeStyle = "rgba(0,0,0,.45)";
  g.lineWidth = 26;
  g.stroke(BODY);
  g.strokeStyle = "rgba(0,0,0,.6)";
  g.lineWidth = 15;
  g.stroke(BODY);
  g.restore();

  g.strokeStyle = "#f1ead2";
  g.lineWidth = 9;
  g.stroke(BODY);
  g.strokeStyle = "rgba(255,255,255,.6)";
  g.lineWidth = 2;
  g.stroke(BODY);
  g.save();
  g.clip(BODY);
  g.strokeStyle = "#1c1d12";
  g.lineWidth = 12;
  g.stroke(BODY);
  g.strokeStyle = "#f1ead2";
  g.lineWidth = 5;
  g.stroke(BODY);
  g.restore();

  // ── pickguard: bevelled black with screws ──
  g.save();
  g.shadowColor = "rgba(0,0,0,.6)";
  g.shadowBlur = 14;
  g.shadowOffsetY = 5;
  g.fillStyle = "#0d0e0a";
  g.fill(GUARD);
  g.restore();
  g.save();
  g.clip(GUARD);
  g.fillStyle = lin(0, 190, 0, 480, [
    [0, "rgba(255,255,255,.1)"],
    [0.3, "rgba(255,255,255,.02)"],
    [1, "rgba(0,0,0,.2)"],
  ]);
  g.fill(GUARD);
  g.strokeStyle = "rgba(255,255,255,.14)";
  g.lineWidth = 7;
  g.stroke(GUARD);
  g.restore();
  g.strokeStyle = "#4b4d3f";
  g.lineWidth = 1.5;
  g.stroke(GUARD);
  (
    [
      [1046, 228],
      [1168, 206],
      [1292, 258],
      [1334, 326],
      [1288, 438],
      [1160, 462],
      [1016, 392],
      [1020, 270],
    ] as const
  ).forEach(([x, y]) => screw(x, y, 4.5));

  // ── pickups: glossy single-coil covers, chrome poles, end screws ──
  [1150, 1290].forEach((px) => {
    g.save();
    g.shadowColor = "rgba(0,0,0,.7)";
    g.shadowBlur = 10;
    g.shadowOffsetY = 4;
    g.fillStyle = lin(px - 22, 0, px + 22, 0, [
      [0, "#2a2b22"],
      [0.25, "#121310"],
      [0.55, "#060605"],
      [1, "#22231b"],
    ]);
    g.beginPath();
    g.roundRect(px - 22, GCY - 76, 44, 152, 14);
    g.fill();
    g.restore();
    g.strokeStyle = "rgba(255,255,255,.18)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.roundRect(px - 21, GCY - 75, 42, 150, 13);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,.08)";
    g.beginPath();
    g.roundRect(px - 16, GCY - 70, 8, 140, 4);
    g.fill();
    for (let k = 0; k < 6; k++) {
      const y = GCY + (k - 2.5) * STRING_GAP;
      g.fillStyle = chrome(y - 5, y + 5);
      g.beginPath();
      g.arc(px, y, 5, 0, 7);
      g.fill();
      g.fillStyle = "rgba(255,255,255,.7)";
      g.beginPath();
      g.arc(px - 1.5, y - 1.5, 1.5, 0, 7);
      g.fill();
    }
    screw(px, GCY - 90, 4);
    screw(px, GCY + 90, 4);
  });

  // ── controls and bridge (mostly past the edge) ──
  g.fillStyle = "#18190f";
  g.beginPath();
  g.roundRect(1330, 166, 54, 22, 11);
  g.fill();
  screw(1346, 177, 9);
  const knob = (x: number, y: number, r: number) => {
    const k = g.createRadialGradient(x - r * 0.35, y - r * 0.45, 1, x, y, r * 1.15);
    k.addColorStop(0, "#ffffff");
    k.addColorStop(0.45, "#a6a999");
    k.addColorStop(1, "#2f3128");
    g.fillStyle = k;
    g.beginPath();
    g.arc(x, y, r, 0, 7);
    g.fill();
  };
  knob(1390, 430, 21);
  knob(1450, 405, 21);
  knob(1472, 462, 19);
  g.fillStyle = chrome(GCY - 74, GCY + 74);
  g.beginPath();
  g.roundRect(BRIDGE - 16, GCY - 74, 76, 148, 9);
  g.fill();

  // ── neck, bolted on top of the body ──
  g.save();
  g.shadowColor = "rgba(0,0,0,.65)";
  g.shadowBlur = 18;
  g.shadowOffsetY = 8;
  g.fillStyle = lin(0, 242, 0, 358, [
    [0, "#e2c992"],
    [0.5, "#b8975a"],
    [1, "#7f6131"],
  ]);
  g.beginPath();
  g.moveTo(left, 242);
  g.lineTo(1080, 242);
  g.arcTo(1100, 242, 1100, 262, 20);
  g.lineTo(1100, 338);
  g.arcTo(1100, 358, 1080, 358, 20);
  g.lineTo(left, 358);
  g.closePath();
  g.fill();
  g.restore();
  g.fillStyle = lin(0, 248, 0, 352, [
    [0, "#33241a"],
    [0.5, "#170f09"],
    [1, "#2c1f15"],
  ]);
  g.fillRect(left, 248, 1084 - left, 104);
  g.strokeStyle = "rgba(120,80,50,.08)";
  g.lineWidth = 1;
  for (let k = 0; k < 14; k++) {
    const y = 252 + k * 7.3;
    g.beginPath();
    g.moveTo(left, y);
    g.bezierCurveTo(400, y + 3, 800, y - 3, 1084, y + 1);
    g.stroke();
  }
  g.fillStyle = "#efe7cf";
  g.fillRect(left, 246, 1084 - left, 3);
  g.fillRect(left, 351, 1084 - left, 3);
  for (let n = 1; n <= 22; n++) {
    const x = fretX(n);
    g.strokeStyle = "#6f7264";
    g.lineWidth = 4.5;
    g.beginPath();
    g.moveTo(x, 249);
    g.lineTo(x, 351);
    g.stroke();
    g.strokeStyle = "#eef0e4";
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(x - 1, 249);
    g.lineTo(x - 1, 351);
    g.stroke();
  }
  [3, 5, 7, 9, 12, 15, 17, 19, 21].forEach((n) => {
    const x = (fretX(n) + fretX(n - 1)) / 2;
    (n === 12 ? [GCY - 24, GCY + 24] : [GCY]).forEach((y) => {
      const pg = g.createRadialGradient(x - 2, y - 2, 1, x, y, 8);
      pg.addColorStop(0, "#fffdf2");
      pg.addColorStop(0.6, "#d9d6c4");
      pg.addColorStop(1, "#a9a690");
      g.fillStyle = pg;
      g.beginPath();
      g.arc(x, y, 7.5, 0, 7);
      g.fill();
    });
  });
  screw(1062, 262, 4);
  screw(1062, 338, 4);
}
