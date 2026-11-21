/**
 * ActionTokens' name, colours and links as the AR app shows them. One brand, so this is a
 * constant. Colours: neon green #0aff54 (the logo green #007a23, brightened) on near-black green (docs/PLAN.md §12).
 */
export const site = {
  name: "Action Tokens",
  /** Off-chain points earned by scanning murals; not the BANDCOIN token */
  coinName: "Mural Coins",
  coinOwner: "Action Tokens",
  wordmark: {
    letters: ["A", "C", "T", "I", "O", "N", "-", "T", "O", "K", "E", "N", "S"],
    plate: "AR",
  },
  assets: {
    mark: "/brand/actiontokens-mark.png",
    favicon: "/favicon.ico",
  },
  colors: {
    themeDark: "#050605",
    themeLight: "#ecf3ee",
    mapRoute: "#0aff54",
    mapRouteCasing: "#063715",
    mapNavAccent: "#00a331",
    mapLoadingRoute: "#0aff54",
    embedAccent: "#0aff54",
    cardBorder: "#1f3a1a",
    cardGlow: "rgba(77,255,42,0.35)",
    packDone: "hsl(138 100% 52%)",
    packDoneGlow: "hsl(138 100% 52% / 0.35)",
  },
  urls: {
    arWeb: process.env.NEXT_PUBLIC_AR_URL ?? "https://ar.action-tokens.com",
    orgPortal: process.env.NEXT_PUBLIC_ORG_URL ?? "https://org.action-tokens.com",
    fanApp: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.action-tokens.com",
  },
  contact: { supportEmail: "support@action-tokens.com" },
  calendar: { productId: "ActionTokens", uidDomain: "action-tokens.com" },
} as const;
