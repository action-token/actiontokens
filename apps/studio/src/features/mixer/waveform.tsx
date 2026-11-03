"use client";

import { useEffect, useRef } from "react";

/**
 * The shape of a clip's sound, drawn for the part that plays (trimmed ends
 * left out). Peaks are worked out once per file and size.
 */
export function Waveform({
  peaks,
  from,
  to,
  color,
}: {
  peaks: Float32Array | null;
  /** The shown part of the file, as fractions 0..1 */
  from: number;
  to: number;
  color: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element || !peaks) return;
    const ratio = window.devicePixelRatio || 1;
    const width = element.clientWidth * ratio;
    const height = element.clientHeight * ratio;
    element.width = width;
    element.height = height;
    const draw = element.getContext("2d");
    if (!draw) return;
    draw.clearRect(0, 0, width, height);
    draw.fillStyle = color;
    const first = Math.floor(from * peaks.length);
    const last = Math.max(first + 1, Math.ceil(to * peaks.length));
    const shown = last - first;
    const bar = Math.max(1, width / shown);
    for (let index = 0; index < shown; index++) {
      const peak = peaks[first + index] ?? 0;
      const size = Math.max(1, peak * height * 0.9);
      draw.fillRect(index * bar, (height - size) / 2, Math.max(1, bar - ratio), size);
    }
  }, [peaks, from, to, color]);
  return <canvas ref={canvas} aria-hidden className="pointer-events-none size-full" />;
}
