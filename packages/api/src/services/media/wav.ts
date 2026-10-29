/**
 * The first `seconds` of a plain PCM WAV file: which bytes to read from it and
 * a new 44-byte header that describes just those bytes, so the cut plays like
 * a small file of its own. Only the canonical layout (header, then the data)
 * is understood; anything else returns null and is refused.
 */
export function wavPreview(header: Uint8Array, seconds: number) {
  if (header.length < 44) return null;
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const tag = (at: number) => String.fromCharCode(...header.slice(at, at + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(12) !== "fmt " || tag(36) !== "data" || view.getUint16(20, true) !== 1) return null;

  const byteRate = view.getUint32(28, true);
  const blockAlign = view.getUint16(32, true);
  const dataLength = view.getUint32(40, true);
  if (byteRate === 0 || blockAlign === 0) return null;

  // Whole samples only, so the cut never ends mid-sample.
  const wanted = Math.min(dataLength, Math.floor((seconds * byteRate) / blockAlign) * blockAlign);
  const out = new Uint8Array(header.slice(0, 44));
  const outView = new DataView(out.buffer);
  outView.setUint32(4, 36 + wanted, true);
  outView.setUint32(40, wanted, true);
  return { range: { start: 44, end: 44 + wanted - 1 }, header: out };
}
