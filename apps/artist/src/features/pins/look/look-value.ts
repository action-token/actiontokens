import { DEFAULT_PIN_LOOK, type MarkerFill, type PinLookInput } from "@bandcoin/ar-core/pin-look";

/** A look with every field present, as the form and the editor work with it. */
export type PinLookValue = {
  shape: string;
  fill: MarkerFill;
  color: string | null;
  imageFit: { zoom: number; x: number; y: number } | null;
  autoBadge: boolean;
};

export const DEFAULT_LOOK: PinLookValue = { ...DEFAULT_PIN_LOOK };

/** Fills in any missing field (an older pin or a template may leave some out). */
export function toLookValue(look: PinLookInput | null | undefined): PinLookValue {
  return {
    shape: look?.shape ?? DEFAULT_LOOK.shape,
    fill: look?.fill ?? DEFAULT_LOOK.fill,
    color: look?.color ?? null,
    imageFit: look?.imageFit ?? null,
    autoBadge: look?.autoBadge ?? true,
  };
}

// The artist's last choice becomes the starting look of the next new pin (this browser only).
const LAST_KEY = "bandcoin.pin-look.last";

export function loadLastLook(): PinLookValue {
  try {
    const raw = window.localStorage.getItem(LAST_KEY);
    return raw ? toLookValue(JSON.parse(raw) as PinLookInput) : DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
  }
}

export function saveLastLook(look: PinLookValue) {
  try {
    window.localStorage.setItem(LAST_KEY, JSON.stringify(look));
  } catch {
    // storage blocked: the next pin starts from the default
  }
}
