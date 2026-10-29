/**
 * The mixing rules of a stem player, with no audio in them: what each stem's
 * volume should be given the listener's mute, solo and volume settings. The
 * same shape is what a saved mix (`StemMix.settings`) holds per stem.
 */
export type StemSetting = {
  /** 0 (silent) to 1 (full) */
  volume: number;
  /** -1 hard left, 0 centre, 1 hard right */
  pan: number;
  mute: boolean;
  solo: boolean;
};

export type Mix = Record<string, StemSetting>;

export const defaultSetting = (): StemSetting => ({ volume: 1, pan: 0, mute: false, solo: false });

export const clampVolume = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1);
export const clampPan = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0);

/**
 * How loud one stem should play. If any stem is soloed, only soloed stems are
 * heard; otherwise every stem is. Mute always wins.
 */
export function audibleGain(mix: Mix, id: string) {
  const setting = mix[id];
  if (!setting || setting.mute) return 0;
  const anySolo = Object.values(mix).some((entry) => entry.solo);
  if (anySolo && !setting.solo) return 0;
  return clampVolume(setting.volume);
}

export function toggle(mix: Mix, id: string, key: "mute" | "solo"): Mix {
  const current = mix[id] ?? defaultSetting();
  return { ...mix, [id]: { ...current, [key]: !current[key] } };
}

/** Where the stems should start when switching in from the full song: the same spot, or the top if the stems end before it. */
export function startPosition(songSeconds: number, stemSeconds: number) {
  return Number.isFinite(songSeconds) && songSeconds < stemSeconds ? Math.max(0, songSeconds) : 0;
}
