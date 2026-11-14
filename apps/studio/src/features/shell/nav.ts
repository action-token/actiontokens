import {
  AudioLines,
  Coins,
  FileText,
  Image as ImageIcon,
  Library,
  Megaphone,
  Search,
  SlidersHorizontal,
  Sparkles,
  Video,
  type LucideIcon,
  Mic2,
} from "lucide-react";

/** The kinds of run the library knows (the server's GenerationType). */
export type RunType = "IMAGE" | "VIDEO" | "TEXT" | "SEO" | "SOCIAL" | "MUSIC";
/** The tools with a chat-style page (music has its own). */
export type ToolId = "IMAGE" | "VIDEO" | "TEXT" | "SOCIAL" | "SEO";

export type NavEntry = { href: string; label: string; icon: LucideIcon; exact?: boolean };

/** Each tool's page, name and icon, by the run type it makes. */
export const TOOL_PAGES: Record<RunType, { href: string; label: string; icon: LucideIcon }> = {
  IMAGE: { href: "/images", label: "Images", icon: ImageIcon },
  VIDEO: { href: "/video", label: "Video", icon: Video },
  MUSIC: { href: "/music", label: "Music", icon: AudioLines },
  TEXT: { href: "/writing", label: "Writing", icon: FileText },
  SOCIAL: { href: "/social", label: "Social", icon: Megaphone },
  SEO: { href: "/seo", label: "SEO", icon: Search },
};

export const NAV_GROUPS: { title: string; items: NavEntry[] }[] = [
  {
    title: "Create",
    items: [
      { href: "/", label: "Create", icon: Sparkles, exact: true },
      TOOL_PAGES.IMAGE,
      TOOL_PAGES.VIDEO,
      TOOL_PAGES.MUSIC,
      TOOL_PAGES.TEXT,
      TOOL_PAGES.SOCIAL,
      TOOL_PAGES.SEO,
    ],
  },
  {
    title: "Your work",
    items: [
      { href: "/mixer", label: "Mixer", icon: SlidersHorizontal },
      { href: "/library", label: "Library", icon: Library },
      { href: "/coins", label: "Coins", icon: Coins },
    ],
  },
];

export const isActive = (entry: NavEntry, pathname: string) =>
  entry.exact
    ? pathname === entry.href
    : pathname === entry.href || pathname.startsWith(`${entry.href}/`);

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bandcoin.io";
export const ARTIST_URL = process.env.NEXT_PUBLIC_ARTIST_URL ?? "https://artist.bandcoin.io";
/** The AR collector (set NEXT_PUBLIC_AR_URL in dev: http://localhost:3002). */
export const AR_URL = process.env.NEXT_PUBLIC_AR_URL ?? "https://www.bandcoin.io";

/**
 * Phones: Create, Library | AR | Artist, Coins. The AR key is the bar's own; "Artist" is another app,
 * so it opens artist.bandcoin.io and is never lit here.
 */
export const PHONE_TABS: { left: NavEntry[]; right: (NavEntry & { external?: boolean })[] } = {
  left: [
    { href: "/", label: "Create", icon: Sparkles, exact: true },
    { href: "/library", label: "Library", icon: Library },
  ],
  right: [
    { href: ARTIST_URL, label: "Artist", icon: Mic2, external: true },
    { href: "/coins", label: "Coins", icon: Coins },
  ],
};
