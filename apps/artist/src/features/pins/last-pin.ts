import type { PinTemplateData } from "@actiontokens/ar-core/pin-template";
import { create } from "zustand";

/**
 * The last pin made from a card on the Pins map (plan 44), as template data (everything but where
 * it goes). The next new-pin card starts from it, so a run of similar pins is quick; the card has
 * Clear to start blank. Kept in memory for this visit only.
 */
export const useLastPin = create<{
  last: PinTemplateData | null;
  remember: (pin: PinTemplateData) => void;
  forget: () => void;
}>((set) => ({
  last: null,
  remember: (last) => set({ last }),
  forget: () => set({ last: null }),
}));
