import { create } from "zustand";

/** Something the notch can show for a few seconds, then fold away. */
export type NotchNote = {
  key: string;
  href: string | null;
  icon: "drop" | "bounty" | "community" | "bell";
  title: string;
  text: string;
  avatarUrl?: string | null;
};

/**
 * The page's idle feed: notes the notch cycles through when nothing else is happening (the
 * home page sets new drops and bounties; other pages leave it empty).
 */
export const useNotchFeed = create<{ feed: NotchNote[] }>(() => ({ feed: [] }));

/** Sets the idle feed while a page is shown. */
export const setNotchFeed = (feed: NotchNote[]) => useNotchFeed.setState({ feed });
