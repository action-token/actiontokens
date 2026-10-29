/**
 * Which pages get the right panel: only home (bounties, artists, and the
 * player while you browse music). Everywhere else uses the full width.
 */
export const hasContextPanel = (pathname: string) => pathname === "/";
