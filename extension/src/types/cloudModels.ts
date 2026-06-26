/**
 * Cursor cloud-agent model metadata shown in Settings and the onboarding wizard.
 *
 * The Cursor API doesn't return per-model pricing, so cost here is a qualitative
 * tier — composer is Cursor's own, fastest, most cost-efficient option and is
 * the default; frontier models cost more per run. See the live rates at
 * https://cursor.com/pricing.
 */
export type CloudModelInfo = {
  id: string;
  label: string;
  /** Short cost/speed descriptor for the picker. */
  cost: string;
  recommended?: boolean;
};

export const DEFAULT_CLOUD_MODEL = "composer";

export const PRICING_URL = "https://cursor.com/pricing";

export const KNOWN_CLOUD_MODELS: CloudModelInfo[] = [
  {
    id: "composer",
    label: "Composer",
    cost: "Fastest · lowest cost per run",
    recommended: true,
  },
];

/** Metadata for a model id, falling back to a generic frontier-model descriptor. */
export function cloudModelInfo(id: string): CloudModelInfo {
  return (
    KNOWN_CLOUD_MODELS.find((m) => m.id === id) ?? {
      id,
      label: id,
      cost: "Frontier model · higher cost per run",
    }
  );
}
