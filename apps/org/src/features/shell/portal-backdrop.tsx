/**
 * The portal's background, all SVG (no images), drawn from the Action brand art: matte square
 * blocks with the engraved Action mark, a grid turned about -15deg, blocks at slightly different
 * heights, and light coming from underneath (yellow upper-left, green right). It only fills the
 * right corner and is kept faint, a shade behind the page. Colours: --bg-* and .at-* in
 * styles/portal.css. Fixed numbers (no Math.random), so the server and the browser agree.
 */
import type { ReactNode } from "react";

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** The Action mark (the slash and the A) on a unit square, as an engraved outline. */
const MARK =
  "M0.06 0.86 L0.36 0.14 L0.47 0.14 L0.17 0.86 Z " +
  "M0.27 0.86 L0.57 0.14 L0.68 0.14 L0.96 0.86 L0.84 0.86 L0.62 0.34 L0.5 0.62 L0.7 0.62 L0.74 0.72 L0.46 0.72 L0.39 0.86 Z";

function GlowTiles() {
  const p = "g";
  const T = 110; // block size
  const GAP = 22; // the lit seam between blocks
  const STEP = T + GAP;
  const rand = rng(13);
  const blocks: { key: string; h: number; node: ReactNode }[] = [];
  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 17; c++) {
      const x = -260 + c * STEP;
      const y = -330 + r * STEP;
      const h = Math.floor(rand() * 3); // 0, 1 or 2 steps up
      const L = 5 + h * 8;
      // raised toward the top-left, so the bottom and right sides face the viewer
      const tx = x + Math.round(-0.45 * L);
      const ty = y + Math.round(-0.8 * L);
      const s = T * 0.6;
      const key = `${r}-${c}`;
      blocks.push({
        key,
        h,
        node: (
          <g key={key}>
            {/* sides: partly see-through, so the light underneath glows on them */}
            <g fill="var(--bg-side)" fillOpacity="0.55">
              <polygon
                points={`${x},${y + T} ${x + T},${y + T} ${tx + T},${ty + T} ${tx},${ty + T}`}
              />
              <polygon
                points={`${x + T},${y} ${x + T},${y + T} ${tx + T},${ty + T} ${tx + T},${ty}`}
              />
            </g>
            <rect x={tx} y={ty} width={T} height={T} rx="4" fill={`url(#${p}-top)`} />
            <rect
              x={tx + 0.5}
              y={ty + 0.5}
              width={T - 1}
              height={T - 1}
              rx="4"
              fill="none"
              stroke="var(--bg-rim)"
            />
            {/* engraved: a light edge under a dark cut */}
            <path
              d={MARK}
              transform={`matrix(${s} 0 0 ${s} ${tx + T * 0.2 + 1.2} ${ty + T * 0.2 + 1.2})`}
              fill="none"
              stroke="var(--bg-engrave-hi)"
              strokeWidth={1.4 / s}
              strokeLinejoin="round"
            />
            <path
              d={MARK}
              transform={`matrix(${s} 0 0 ${s} ${tx + T * 0.2} ${ty + T * 0.2})`}
              fill="none"
              stroke="var(--bg-engrave-lo)"
              strokeWidth={1.6 / s}
              strokeLinejoin="round"
            />
          </g>
        ),
      });
    }
  }
  // Each block is drawn whole (sides, then top), lowest first: a higher block always sits over
  // its lower neighbours, and blocks of one height keep row order (nearer ones last).
  const ordered = [...blocks].sort((a, b) => a.h - b.h);
  return (
    <svg className="at-scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${p}-top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--bg-tile-a)" />
          <stop offset="1" stopColor="var(--bg-tile-b)" />
        </linearGradient>
        <filter id={`${p}-light`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="38" />
        </filter>
        {/* only the right corner: full at the top-right, gone by the middle of the page */}
        <radialGradient id={`${p}-corner`} cx="1" cy="0.2" r="0.72">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${p}-cornermask`}>
          <rect width="1600" height="900" fill={`url(#${p}-corner)`} />
        </mask>
      </defs>
      <g mask={`url(#${p}-cornermask)`}>
        <rect width="1600" height="900" fill="var(--bg-gap)" />
        {/* the light under the blocks: it shows in the seams and through the sides */}
        <g filter={`url(#${p}-light)`}>
          <ellipse
            cx="560"
            cy="330"
            rx="430"
            ry="150"
            fill="#e6ff1a"
            transform="rotate(-18 560 330)"
          />
          <ellipse cx="760" cy="520" rx="240" ry="120" fill="#d0ff14" />
          <ellipse cx="1220" cy="560" rx="330" ry="210" fill="#0aff3c" />
          <ellipse cx="1420" cy="300" rx="200" ry="140" fill="#14ff44" />
          <ellipse cx="980" cy="760" rx="230" ry="120" fill="#0af53a" />
        </g>
        <g transform="rotate(-15 800 450) scale(1 0.94)">{ordered.map((b) => b.node)}</g>
      </g>
    </svg>
  );
}

/** The background behind every portal page. */
export function PortalBackdrop() {
  return (
    <div aria-hidden className="at-backdrop">
      <GlowTiles />
      <div className="at-wash" />
    </div>
  );
}
