"use client";

import { createContext, useContext } from "react";

/** The artist an admin is acting as on Admin › All maps (plan 45); null everywhere else. */
export type ActingArtist = { id: string; name: string };

const ActingContext = createContext<ActingArtist | null>(null);
export const ActingArtistProvider = ActingContext.Provider;

/** Who the page is acting as, or null on an artist's own pages. */
export const useActingArtist = () => useContext(ActingContext);
