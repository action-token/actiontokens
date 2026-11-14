"use client";

import { createContext, useContext } from "react";

/**
 * A form opened as a floating card on a map instead of as its own page (plan 44). The same form
 * components read this: with a card, `FormPage` and `FormSection` draw as a card, and the form
 * closes it instead of navigating, leaves out its side column (the map is right there) and takes
 * its location from map clicks (`at`).
 */
export type FormCard = {
  /** Cancel, or the X. */
  onClose: () => void;
  /** Saved: close the card (the map refreshes). */
  onDone: () => void;
  /** The spot last clicked on the map, for a new pin. */
  at?: { lat: number; lng: number } | null;
  /** The map layer picked on the map: what a new pin or hotspot starts in. */
  layerId?: string | null;
  /** Start the form again from blank (the new-pin card's Clear). */
  restart?: () => void;
};

const FormCardContext = createContext<FormCard | null>(null);
export const FormCardProvider = FormCardContext.Provider;

/** The card this form is open in, or null on its own page. */
export function useFormCard() {
  return useContext(FormCardContext);
}
