import { type Block, type BlockType, makeBlock } from "./blocks";
import { DEFAULT_THEME, type PageTheme } from "./theme";

/** Starting points for a page. Pure data, so the editor, the API and tests all use the same ones. */
export type PageTemplate = {
  key: string;
  name: string;
  description: string;
  blocks: BlockType[];
  theme: PageTheme;
};

export const TEMPLATES: PageTemplate[] = [
  {
    key: "musician",
    name: "Musician",
    description: "Music front and centre, with tour dates and membership.",
    blocks: ["cover", "music", "releases", "tour", "membership", "links"],
    theme: DEFAULT_THEME,
  },
  {
    key: "visual-artist",
    name: "Visual artist",
    description: "Lead with your collectibles.",
    blocks: ["cover", "about", "nft-gallery", "membership", "links"],
    theme: DEFAULT_THEME,
  },
  {
    key: "band",
    name: "Band",
    description: "Room for the whole line-up, tour dates and videos.",
    blocks: ["cover", "about", "tour", "music", "band-members", "videos"],
    theme: DEFAULT_THEME,
  },
  {
    key: "minimal",
    name: "Minimal",
    description: "Just a cover, a short bio and your links.",
    blocks: ["cover", "about", "links"],
    theme: DEFAULT_THEME,
  },
];

export const DEFAULT_TEMPLATE_KEY = "musician";

export const templateByKey = (key: string) => TEMPLATES.find((template) => template.key === key);

/** The blocks of a template, each with a fresh id. */
export function blocksOf(template: PageTemplate, newUid: () => string): Block[] {
  return template.blocks.map((type) => makeBlock(type, newUid()));
}
