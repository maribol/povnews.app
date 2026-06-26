import type { UserPOV } from "./pov";

/**
 * Neutral example POV used as the default until the user sets up their own in
 * onboarding. Generic on purpose — it ships as the product default, so it
 * should read as a starting template, not anyone's personal profile.
 */
export const DEFAULT_POV: UserPOV = {
  about:
    "A curious reader who wants a focused daily digest of meaningful developments in technology, business, and the wider world — signal over noise.",
  pillars: [
    {
      slug: "technology",
      name: "Technology",
      description: "Hardware, software, and the platforms shaping how we work.",
      accent: "slate",
    },
    {
      slug: "artificial-intelligence",
      name: "Artificial intelligence",
      description: "How AI is built, deployed, and changing real workflows.",
      accent: "violet",
    },
    {
      slug: "business-and-startups",
      name: "Business & startups",
      description: "Companies, markets, and how products get built and sold.",
      accent: "emerald",
    },
    {
      slug: "science",
      name: "Science",
      description: "Research and discoveries with real-world implications.",
      accent: "cyan",
    },
    {
      slug: "policy-and-society",
      name: "Policy & society",
      description: "Regulation, culture, and the human impact of new tech.",
      accent: "amber",
    },
  ],
  audiences: ["general"],
  sources: [],
  scoringRubric: { recencyDays: 30, minScore: 9 },
  antiPatterns: [],
  proExamples: [],
  voiceSamples: [],
};
