/**
 * ActionTokens' name, colours and links as the AR app shows them. One brand, so this is a
 * constant. Colours: neon green #4dff2a on near-black green (docs/PLAN.md §12).
 */
export const site = {
  name: "ActionTokens",
  /** Off-chain points earned by scanning murals; not the BANDCOIN token */
  coinName: "Mural Coins",
  coinOwner: "ActionTokens",
  wordmark: {
    letters: ["A", "C", "T", "I", "O", "N", "T", "O", "K", "E", "N", "S"],
    plate: "AR",
  },
  assets: {
    mark: "/brand/actiontokens-mark.png",
    favicon: "/favicon.ico",
  },
  colors: {
    themeDark: "#050605",
    themeLight: "#050605",
    mapRoute: "#4dff2a",
    mapRouteCasing: "#0f3a08",
    mapNavAccent: "#3ea024",
    mapLoadingRoute: "#4dff2a",
    embedAccent: "#4dff2a",
    cardBorder: "#1f3a1a",
    cardGlow: "rgba(77,255,42,0.35)",
    packDone: "hsl(110 100% 58%)",
    packDoneGlow: "hsl(110 100% 58% / 0.35)",
  },
  urls: {
    arWeb: process.env.NEXT_PUBLIC_AR_URL ?? "https://ar.action-tokens.com",
    orgPortal: process.env.NEXT_PUBLIC_ORG_URL ?? "https://org.action-tokens.com",
    fanApp: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.action-tokens.com",
  },
  contact: { supportEmail: "support@action-tokens.com" },
  calendar: { productId: "ActionTokens", uidDomain: "action-tokens.com" },
} as const;
