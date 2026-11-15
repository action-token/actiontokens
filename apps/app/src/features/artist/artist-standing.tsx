"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** Whether the fan follows / subscribes to an artist, and that artist's counts. */
export type Standing = {
  following: boolean;
  subscribed: boolean;
  followers: number;
  subscribers: number;
};

type Shared = { slug: string; standing: Standing; update: (patch: Partial<Standing>) => void };

const StandingContext = createContext<Shared | null>(null);

/**
 * One follow state for an artist's page, so every Follow button on it (the cover's and
 * the sticky bar's) and the counts change together.
 */
export function ArtistStandingProvider({
  slug,
  initial,
  children,
}: {
  slug: string;
  initial: Standing;
  children: ReactNode;
}) {
  const [standing, setStanding] = useState(initial);
  const shared = useMemo<Shared>(
    () => ({
      slug,
      standing,
      update: (patch) =>
        setStanding((now) => {
          const next = { ...now, ...patch };
          // A fan who just subscribed counts once more (the server count follows on reload).
          if (patch.subscribed && !now.subscribed && patch.subscribers === undefined)
            next.subscribers = Math.max(now.subscribers, 1);
          return next;
        }),
    }),
    [slug, standing],
  );
  return <StandingContext.Provider value={shared}>{children}</StandingContext.Provider>;
}

/** The shared state for this artist, or null outside their page. */
export function useArtistStanding(slug: string): Shared | null {
  const shared = useContext(StandingContext);
  return shared?.slug === slug ? shared : null;
}
