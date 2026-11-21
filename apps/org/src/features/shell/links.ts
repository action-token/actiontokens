/** Where the fan app lives (set NEXT_PUBLIC_APP_URL in dev: http://localhost:3000). */
export const FAN_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.action-tokens.com";
/** The AR collector (set NEXT_PUBLIC_AR_URL in dev: http://localhost:3002). */
export const AR_URL = process.env.NEXT_PUBLIC_AR_URL ?? "https://ar.action-tokens.com";

/** Fired on window to open the phone menu (the side sheet), e.g. from the front page's notch. */
export const PORTAL_MENU_EVENT = "portal:menu";
/** Fired on window to close the phone menu (e.g. after a front-page tour link). */
export const PORTAL_MENU_CLOSE_EVENT = "portal:menu-close";
