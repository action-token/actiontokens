import { AudioLines, FileText, Image as ImageIcon, Megaphone, Search, Video } from "lucide-react";

/** Studio's tools, one per generation type (the generators arrive in plan 18 stage 6). */
export const TOOLS = [
  {
    type: "IMAGE",
    label: "Images",
    hint: "Covers, posters and art from a sentence.",
    icon: ImageIcon,
    href: null,
  },
  {
    type: "MUSIC_CLIP",
    label: "Music",
    hint: "Clips, full songs and live jams with Google's Lyria, then mix them.",
    icon: AudioLines,
    href: "/music",
  },
  {
    type: "VIDEO",
    label: "Video",
    hint: "Short clips for posts and promos.",
    icon: Video,
    href: null,
  },
  {
    type: "TEXT",
    label: "Writing",
    hint: "Bios, descriptions and lyrics drafts.",
    icon: FileText,
    href: null,
  },
  {
    type: "SOCIAL",
    label: "Social posts",
    hint: "Captions and posts for your channels.",
    icon: Megaphone,
    href: null,
  },
  {
    type: "SEO",
    label: "SEO",
    hint: "Titles and descriptions people find.",
    icon: Search,
    href: null,
  },
] as const;

export type ToolType = (typeof TOOLS)[number]["type"];

/** "6 coins a run ($0.06)" */
export const priceLabel = (coins: number) =>
  `${coins.toLocaleString("en-US")} coin${coins === 1 ? "" : "s"} a run ($${(coins / 100).toFixed(2)})`;
