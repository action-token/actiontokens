/**
 * The keys a live jam can be held to, as Lyria RealTime names them. Each is a
 * major key and the minor key that shares its notes. "Auto" lets the music
 * choose.
 */
export const AUTO_KEY = "SCALE_UNSPECIFIED";

export const LIVE_KEYS: { value: string; label: string }[] = [
  { value: AUTO_KEY, label: "Auto" },
  { value: "C_MAJOR_A_MINOR", label: "C major / A minor" },
  { value: "D_FLAT_MAJOR_B_FLAT_MINOR", label: "D♭ major / B♭ minor" },
  { value: "D_MAJOR_B_MINOR", label: "D major / B minor" },
  { value: "E_FLAT_MAJOR_C_MINOR", label: "E♭ major / C minor" },
  { value: "E_MAJOR_D_FLAT_MINOR", label: "E major / C♯ minor" },
  { value: "F_MAJOR_D_MINOR", label: "F major / D minor" },
  { value: "G_FLAT_MAJOR_E_FLAT_MINOR", label: "G♭ major / E♭ minor" },
  { value: "G_MAJOR_E_MINOR", label: "G major / E minor" },
  { value: "A_FLAT_MAJOR_F_MINOR", label: "A♭ major / F minor" },
  { value: "A_MAJOR_G_FLAT_MINOR", label: "A major / F♯ minor" },
  { value: "B_FLAT_MAJOR_G_MINOR", label: "B♭ major / G minor" },
  { value: "B_MAJOR_A_FLAT_MINOR", label: "B major / G♯ minor" },
];

type Switches = { muteBass: boolean; muteDrums: boolean; onlyBassAndDrums: boolean };

/**
 * Flips one of the three switches. "Only bass and drums" can't hold together
 * with either mute, so turning one on turns the other kind off.
 */
export function flipSwitch<Settings extends Switches>(
  settings: Settings,
  key: keyof Switches,
  on: boolean,
): Settings {
  if (!on) return { ...settings, [key]: false };
  return key === "onlyBassAndDrums"
    ? { ...settings, onlyBassAndDrums: true, muteBass: false, muteDrums: false }
    : { ...settings, [key]: true, onlyBassAndDrums: false };
}
