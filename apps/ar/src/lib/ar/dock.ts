import { create } from "zustand";

/**
 * Whether the dock (BottomTabBar) shows. The dock is mounted once in AppFrame,
 * outside the per-route tree, so switching tabs never rebuilds or re-animates
 * it; each screen's AppShell says whether it wants the dock.
 */
export const useDock = create<{ visible: boolean }>(() => ({ visible: false }));
