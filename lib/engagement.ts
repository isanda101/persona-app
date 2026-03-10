export type EngagementCounts = {
  likes_count: number;
  comments_count: number;
  collections_count: number;
};

export type EngagementMap = Record<string, EngagementCounts>;

const STORAGE_KEY = "persona:engagement";

const DEFAULT_ENGAGEMENT: EngagementCounts = {
  likes_count: 0,
  comments_count: 0,
  collections_count: 0,
};

function normalizeCount(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

function normalizeCounts(value: unknown): EngagementCounts {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_ENGAGEMENT };
  }
  const obj = value as Record<string, unknown>;
  return {
    likes_count: normalizeCount(obj.likes_count),
    comments_count: normalizeCount(obj.comments_count),
    collections_count: normalizeCount(obj.collections_count),
  };
}

export function readEngagement(): EngagementMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const entries = Object.entries(parsed as Record<string, unknown>);
    const out: EngagementMap = {};
    for (const [cardId, counts] of entries) {
      if (!cardId.trim()) continue;
      out[cardId] = normalizeCounts(counts);
    }
    return out;
  } catch {
    return {};
  }
}

export function writeEngagement(value: EngagementMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function getEngagement(cardId: string, source?: EngagementMap): EngagementCounts {
  const key = String(cardId || "").trim();
  if (!key) return { ...DEFAULT_ENGAGEMENT };
  const map = source || readEngagement();
  return normalizeCounts(map[key]);
}

export function ensureEngagement(cardId: string): EngagementCounts {
  const key = String(cardId || "").trim();
  if (!key) return { ...DEFAULT_ENGAGEMENT };

  const map = readEngagement();
  if (map[key]) {
    return normalizeCounts(map[key]);
  }

  const next = {
    ...map,
    [key]: { ...DEFAULT_ENGAGEMENT },
  };
  writeEngagement(next);
  return next[key];
}
