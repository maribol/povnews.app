import type { UserPOV } from "../types/pov";

export type SourcePreset = {
  id: string;
  label: string;
  description: string;
  sources: UserPOV["sources"];
  suggestedAudiences: string[];
};

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    id: "dtc-operator",
    label: "DTC operator",
    description: "Ecommerce, checkout, paid social, subscription economics",
    suggestedAudiences: ["ecommerce", "vendor"],
    sources: [
      { url: "https://www.modernretail.co/", pillarSlug: "paid-traffic-economics", weight: 1 },
      { url: "https://www.shopify.com/blog", pillarSlug: "revenue-leakage", weight: 1 },
      { url: "https://www.reddit.com/r/Shopify/", pillarSlug: "revenue-leakage", weight: 0.8 },
    ],
  },
  {
    id: "saas-founder",
    label: "SaaS founder",
    description: "Bootstrapped SaaS, product building, AI-native products",
    suggestedAudiences: ["founder", "investor"],
    sources: [
      { url: "https://www.lennysnewsletter.com/", pillarSlug: "founder-operator-lessons", weight: 1 },
      { url: "https://www.indiehackers.com/", pillarSlug: "founder-operator-lessons", weight: 0.9 },
      { url: "https://cursor.com/blog", pillarSlug: "ai-native-saas", weight: 0.8 },
    ],
  },
  {
    id: "performance-marketer",
    label: "Performance marketer",
    description: "Paid traffic, attribution, funnel infrastructure",
    suggestedAudiences: ["affiliate", "vendor", "agency"],
    sources: [
      { url: "https://searchengineland.com/", pillarSlug: "paid-traffic-economics", weight: 1 },
      { url: "https://www.reddit.com/r/PPC/", pillarSlug: "paid-traffic-economics", weight: 1 },
      { url: "https://adexchanger.com/", pillarSlug: "regulatory-platform-changes", weight: 0.7 },
    ],
  },
];
