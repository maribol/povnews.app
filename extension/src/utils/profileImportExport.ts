import type { PillarAccent, ProfileDraft, SetupQuestion, UserPOV } from "../types/pov";

export const PROFILE_EXPORT_TYPE = "pov-news-profile" as const;
export const PROFILE_EXPORT_VERSION = 1;

const KEBAB_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACCENTS: readonly PillarAccent[] = [
  "slate",
  "emerald",
  "amber",
  "rose",
  "violet",
  "cyan",
];

export type ProfileExport = {
  exportType: typeof PROFILE_EXPORT_TYPE;
  version: typeof PROFILE_EXPORT_VERSION;
  exportedAt: string;
  profile: ProfileDraft;
};

export type ProfileImportResult =
  | { ok: true; draft: ProfileDraft }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown, field: string, errors: string[]): string | null {
  if (typeof value !== "string") {
    errors.push(`${field} must be a string`);
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    errors.push(`${field} must not be empty`);
    return null;
  }
  return trimmed;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function unwrapProfilePayload(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;

  if (raw.exportType === PROFILE_EXPORT_TYPE && isRecord(raw.profile)) {
    return raw.profile;
  }

  if (isRecord(raw.profile) && "about" in raw.profile && "pillars" in raw.profile) {
    return raw.profile;
  }

  return raw;
}

export function validateProfileDraft(raw: unknown, minAboutLength = 10): ProfileImportResult {
  const errors: string[] = [];
  const payload = unwrapProfilePayload(raw);

  if (!isRecord(payload)) {
    return { ok: false, errors: ["JSON must be an object"] };
  }

  const about = asNonEmptyString(payload.about, "about", errors);
  if (about && about.length < minAboutLength) {
    errors.push(`about must be at least ${minAboutLength} characters`);
  }

  if (!Array.isArray(payload.pillars)) {
    errors.push("pillars must be an array");
  }
  if (!Array.isArray(payload.audiences)) {
    errors.push("audiences must be an array");
  }
  if (payload.sources !== undefined && !Array.isArray(payload.sources)) {
    errors.push("sources must be an array when present");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const pillarsRaw = payload.pillars as unknown[];
  if (pillarsRaw.length < 1) {
    errors.push("pillars must include at least 1 item");
  }
  if (pillarsRaw.length > 10) {
    errors.push("pillars must include at most 10 items");
  }

  const audiencesRaw = payload.audiences as unknown[];
  if (audiencesRaw.length < 1) {
    errors.push("audiences must include at least 1 item");
  }
  if (audiencesRaw.length > 8) {
    errors.push("audiences must include at most 8 items");
  }

  const pillars: ProfileDraft["pillars"] = [];
  const slugSet = new Set<string>();

  for (let i = 0; i < pillarsRaw.length; i++) {
    const item = pillarsRaw[i];
    const prefix = `pillars[${i}]`;
    if (!isRecord(item)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    const slug = asNonEmptyString(item.slug, `${prefix}.slug`, errors);
    const name = asNonEmptyString(item.name, `${prefix}.name`, errors);
    const description = asNonEmptyString(item.description, `${prefix}.description`, errors);

    if (slug && !KEBAB_SLUG.test(slug)) {
      errors.push(`${prefix}.slug must be kebab-case (e.g. paid-traffic-economics)`);
    }
    if (slug && slugSet.has(slug)) {
      errors.push(`${prefix}.slug duplicates pillar slug "${slug}"`);
    }
    if (slug) slugSet.add(slug);

    let accent: PillarAccent = "slate";
    if (item.accent === undefined) {
      errors.push(`${prefix}.accent is required`);
    } else if (!ACCENTS.includes(item.accent as PillarAccent)) {
      errors.push(`${prefix}.accent must be one of: ${ACCENTS.join(", ")}`);
    } else {
      accent = item.accent as PillarAccent;
    }

    if (slug && name && description) {
      pillars.push({ slug, name, description, accent });
    }
  }

  const audiences: string[] = [];
  for (let i = 0; i < audiencesRaw.length; i++) {
    const label = asNonEmptyString(audiencesRaw[i], `audiences[${i}]`, errors);
    if (label) audiences.push(label);
  }

  const sourcesRaw = (payload.sources ?? []) as unknown[];
  const sources: ProfileDraft["sources"] = [];

  for (let i = 0; i < sourcesRaw.length; i++) {
    const item = sourcesRaw[i];
    const prefix = `sources[${i}]`;
    if (!isRecord(item)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    const url = asNonEmptyString(item.url, `${prefix}.url`, errors);
    const pillarSlug = asNonEmptyString(item.pillarSlug, `${prefix}.pillarSlug`, errors);

    if (url && !isValidHttpUrl(url)) {
      errors.push(`${prefix}.url must be a valid http(s) URL`);
    }

    if (pillarSlug && !slugSet.has(pillarSlug)) {
      errors.push(`${prefix}.pillarSlug "${pillarSlug}" does not match any pillar slug`);
    }

    let weight = 1;
    if (item.weight === undefined) {
      weight = 1;
    } else if (typeof item.weight !== "number" || !Number.isFinite(item.weight)) {
      errors.push(`${prefix}.weight must be a number`);
    } else if (item.weight < 0.05 || item.weight > 1) {
      errors.push(`${prefix}.weight must be between 0.05 and 1`);
    } else {
      weight = item.weight;
    }

    if (url && pillarSlug && slugSet.has(pillarSlug)) {
      sources.push({ url, pillarSlug, weight });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (!about) {
    return { ok: false, errors: ["about is required"] };
  }

  return {
    ok: true,
    draft: {
      about,
      pillars,
      audiences,
      sources,
      ...(isRecord(payload.readerPreferences)
        ? { readerPreferences: payload.readerPreferences as ProfileDraft["readerPreferences"] }
        : {}),
      ...(Array.isArray(payload.setupQuestions)
        ? { setupQuestions: payload.setupQuestions as SetupQuestion[] }
        : {}),
    },
  };
}

export function parseProfileImportJson(text: string, minAboutLength = 10): ProfileImportResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, errors: ["JSON payload is empty"] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, errors: ["Invalid JSON — check syntax and try again"] };
  }

  return validateProfileDraft(parsed, minAboutLength);
}

export function profileDraftToExport(draft: ProfileDraft): ProfileExport {
  return {
    exportType: PROFILE_EXPORT_TYPE,
    version: PROFILE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    profile: {
      about: draft.about,
      pillars: draft.pillars,
      audiences: draft.audiences,
      sources: draft.sources,
      ...(draft.readerPreferences ? { readerPreferences: draft.readerPreferences } : {}),
      ...(draft.setupQuestions?.length ? { setupQuestions: draft.setupQuestions } : {}),
    },
  };
}

export function userPovToProfileDraft(pov: UserPOV): ProfileDraft {
  return {
    about: pov.about,
    pillars: pov.pillars,
    audiences: pov.audiences,
    sources: pov.sources,
    readerPreferences: pov.readerPreferences,
  };
}

export function downloadProfileJson(filename: string, draft: ProfileDraft): void {
  const payload = profileDraftToExport(draft);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
