import type { DigestItem, ItemRating, PillarDriftAlert, UserPOV } from "../types/pov";
import { getFromStorage, setInStorage, STORAGE_KEYS } from "./schema";

const MAX_PRO = 20;
const MAX_ANTI = 20;
const DRIFT_DAYS = 3;
const DRIFT_THRESHOLD = 0.5;

export type FeedbackRecord = {
  itemId: string;
  rating: ItemRating;
  pillarSlug: string;
  at: string;
};

export async function recordFeedback(
  item: DigestItem,
  rating: ItemRating,
): Promise<UserPOV> {
  const history =
    (await getFromStorage(STORAGE_KEYS.feedbackHistory)) ?? [];
  history.push({
    itemId: item.id,
    rating,
    pillarSlug: item.pillarSlug,
    at: new Date().toISOString(),
  });
  await setInStorage(
    STORAGE_KEYS.feedbackHistory,
    history.slice(-500),
  );

  let pov = (await getFromStorage(STORAGE_KEYS.userPov))!;
  if (rating === "up") {
    pov = addProExample(pov, item);
  } else if (rating === "down" || rating === "dismiss") {
    pov = addAntiPattern(pov, item, rating);
  }
  await setInStorage(STORAGE_KEYS.userPov, pov);
  return pov;
}

function personalRelevanceLine(item: DigestItem): string {
  return item.whyItMatters?.trim() || item.title;
}

function addProExample(pov: UserPOV, item: DigestItem): UserPOV {
  const next = pov.proExamples.filter((e) => e.url !== item.url);
  next.unshift({
    url: item.url,
    reason: personalRelevanceLine(item),
  });
  return { ...pov, proExamples: next.slice(0, MAX_PRO) };
}

function addAntiPattern(
  pov: UserPOV,
  item: DigestItem,
  rating: ItemRating,
): UserPOV {
  const line = personalRelevanceLine(item);
  const label =
    rating === "dismiss"
      ? `Not interested in topic (${item.pillarName}): ${item.title}`
      : `Bad "what this means for you" line: "${line}" — ${item.title}`;
  const next = pov.antiPatterns.filter((a) => !a.includes(item.url));
  next.unshift(`${label} (${item.url})`);
  return { ...pov, antiPatterns: next.slice(0, MAX_ANTI) };
}

export async function detectPillarDrift(): Promise<PillarDriftAlert[]> {
  const history =
    (await getFromStorage(STORAGE_KEYS.feedbackHistory)) ?? [];
  const pov = await getFromStorage(STORAGE_KEYS.userPov);
  if (!pov || history.length === 0) return [];

  const cutoff = Date.now() - DRIFT_DAYS * 24 * 60 * 60 * 1000;
  const recent = history.filter((r) => new Date(r.at).getTime() >= cutoff);
  const alerts: PillarDriftAlert[] = [];

  for (const pillar of pov.pillars) {
    const pillarEvents = recent.filter(
      (r) => r.pillarSlug === pillar.slug && r.rating !== "up",
    );
    const allPillar = recent.filter((r) => r.pillarSlug === pillar.slug);
    if (allPillar.length < 5) continue;
    const downRate = pillarEvents.length / allPillar.length;
    if (downRate > DRIFT_THRESHOLD) {
      alerts.push({
        pillarSlug: pillar.slug,
        pillarName: pillar.name,
        downRate,
        days: DRIFT_DAYS,
      });
    }
  }
  return alerts;
}
