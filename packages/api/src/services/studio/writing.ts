import type { GenerateInput } from "./generate-input";

type Seo = Extract<GenerateInput, { tool: "SEO" }>;
type Social = Extract<GenerateInput, { tool: "SOCIAL" }>;

/** How long a post can be on each platform. */
export const PLATFORM_LIMITS: Record<string, number> = {
  Instagram: 2200,
  Facebook: 63_206,
  X: 280,
  LinkedIn: 3000,
  TikTok: 2200,
  Threads: 500,
};

/** The SEO article brief (bandfan's, kept the same). */
export function seoPrompt(input: Seo) {
  const lines = [
    `You are an expert SEO content writer. Generate a ${input.contentType} about "${input.topic}" in ${input.language}.`,
    "",
    "SEO REQUIREMENTS:",
    `- Primary Keyword: ${input.primaryKeyword || input.topic}`,
    `- Secondary Keywords: ${input.secondaryKeywords.join(", ") || "None"}`,
    `- Search Intent: ${input.searchIntent}`,
    `- Target Keyword Density: ${input.keywordDensity}%`,
    "",
    "CONTENT REQUIREMENTS:",
    `- Tone: ${input.tone}`,
    `- Target Word Count: ${input.wordCount} words`,
    `- Target Audience: ${input.targetAudience}`,
    `- Reading Level: ${input.readingLevel}`,
    `- Structure: ${input.contentStructure}`,
    "",
    "INCLUDE THE FOLLOWING:",
    input.includeMetaTags &&
      "- SEO Meta Title (under 60 chars) and Meta Description (under 160 chars) at the start",
    input.includeTableOfContents && "- Table of Contents with anchor links",
    input.includeFAQ && "- FAQ Section with 5-7 common questions and answers",
    input.includeInternalLinks &&
      "- Placeholder suggestions for internal links [INTERNAL LINK: topic]",
    input.includeStats && "- Relevant statistics and data points with sources",
    input.includeQuotes && "- Expert quotes and citations",
    "",
    "Write the content with proper headings (H2, H3), bullet points, and formatting. Make it comprehensive, well-structured, and optimized for search engines while maintaining readability.",
  ];
  return lines.filter((line) => line !== false).join("\n");
}

/** The social post brief (bandfan's, kept the same). */
export function socialPrompt(input: Social) {
  const limit = PLATFORM_LIMITS[input.platform] ?? 2000;
  const lines = [
    `You are an expert social media content creator. Generate ${input.numberOfVariations} unique ${input.platform} post(s) about "${input.topic}".`,
    "",
    `CONTEXT: ${input.context || "None provided"}`,
    "",
    "POST REQUIREMENTS:",
    `- Platform: ${input.platform} (max ${limit} characters)`,
    `- Style: ${input.postStyle}`,
    `- Content Pillar: ${input.contentPillar}`,
    `- Hook Style: Start with a ${input.hookStyle}`,
    `- Post Length: ${input.postLength}`,
    `- Target Audience: ${input.targetDemographic}`,
    `- CTA Type: ${input.includeCTA ? input.ctaType : "none"}`,
    "",
    "FORMATTING:",
    input.includeHashtags && input.hashtagCount > 0
      ? `- Include ${input.hashtagCount} relevant hashtags`
      : "- No hashtags",
    input.includeEmojis ? "- Use appropriate emojis strategically" : "- No emojis",
    input.includeCTA ? `- End with a ${input.ctaType} call-to-action` : "- No CTA needed",
    "",
    `Generate ${input.numberOfVariations} unique variation(s), each optimized for ${input.platform}.`,
    input.postLength === "thread" ? "Create a thread with 3-5 connected posts." : "",
    "",
    `Format each variation clearly with "--------" separators. Make content engaging, authentic, and tailored for ${input.platform}'s audience.`,
  ];
  return lines.join("\n");
}
