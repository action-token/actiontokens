/** Lyria RealTime sends 16-bit stereo audio at 48 kHz. */
export const LIVE_RATE = 48_000;
export const LIVE_CHANNELS = 2;
/** A recording is a WAV file, and uploads stop at 100 MB: about 8 minutes. */
export const MAX_RECORDING_SECONDS = 500;

/** Base64 of interleaved little-endian 16-bit samples → samples. */
export function decodePcm(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length - (binary.length % 4));
  for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/** One channel of interleaved samples as floats from -1 to 1. */
export function channelOf(samples: Int16Array, channel: number): Float32Array {
  const frames = Math.floor(samples.length / LIVE_CHANNELS);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = samples[i * LIVE_CHANNELS + channel]! / 32768;
  return out;
}

export const secondsOf = (samples: number) => samples / (LIVE_RATE * LIVE_CHANNELS);

/**
 * The recorded chunks as a WAV file. Stops at the length limit, and says
 * whether it had to cut the end off.
 */
export function recordingWav(chunks: Int16Array[]) {
  const limit = MAX_RECORDING_SECONDS * LIVE_RATE * LIVE_CHANNELS;
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const samples = Math.min(total, limit);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, LIVE_CHANNELS, true);
  view.setUint32(24, LIVE_RATE, true);
  view.setUint32(28, LIVE_RATE * LIVE_CHANNELS * 2, true);
  view.setUint16(32, LIVE_CHANNELS * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  let at = 44;
  let left = samples;
  for (const chunk of chunks) {
    if (left <= 0) break;
    const take = Math.min(left, chunk.length);
    for (let i = 0; i < take; i++, at += 2) view.setInt16(at, chunk[i]!, true);
    left -= take;
  }
  return { blob: new Blob([buffer], { type: "audio/wav" }), cut: total > limit };
}
