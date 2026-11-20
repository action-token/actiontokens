/**
 * Bandcoin's name, colours and links as the AR app shows them. One brand, so
 * this is a constant (Wadzzo switches between several platforms here).
 * Colours match the guitar-pick logo: chartreuse #dbdc2c on olive-dark ground.
 */
export const site = {
  name: "Bandcoin",
  /** Off-chain points earned by scanning murals; not the BANDCOIN token */
  coinName: "Mural Coins",
  coinOwner: "Bandcoin",
  wordmark: { letters: ["B", "A", "N", "D", "C", "O", "I", "N"], plate: "AR" },
  assets: {
    mark: "/brand/bandcoin-mark.png",
    favicon: "/favicon.ico",
  },
  colors: {
    themeDark: "#0e0f0b",
    themeLight: "#f7f7f2",
    mapRoute: "#dbdc2c",
    mapRouteCasing: "#3a3b08",
    mapNavAccent: "#626300",
    mapLoadingRoute: "#dbdc2c",
    embedAccent: "#dbdc2c",
    cardBorder: "#3a3b12",
    cardGlow: "rgba(219,220,44,0.35)",
    packDone: "hsl(60 71% 52%)",
    packDoneGlow: "hsl(60 71% 52% / 0.35)",
  },
  urls: {
    arWeb: process.env.NEXT_PUBLIC_AR_URL ?? "https://ar.action-tokens.com",
    orgPortal: process.env.NEXT_PUBLIC_ORG_URL ?? "https://org.action-tokens.com",
    fanApp: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.action-tokens.com",
  },
  contact: { supportEmail: "support@action-tokens.com" },
  calendar: { productId: "Bandcoin", uidDomain: "action-tokens.com" },
} as const;
