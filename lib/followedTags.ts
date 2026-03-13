const FOLLOWED_TAGS_KEY = "persona:followed_tags";

export function normalizeTag(tag: string): string {
  return String(tag || "").trim().toLowerCase();
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const key = normalizeTag(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function readFollowedTags(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FOLLOWED_TAGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return dedupeTags(parsed.map((item) => String(item || "")));
  } catch {
    return [];
  }
}

export function writeFollowedTags(tags: string[]): string[] {
  if (typeof window === "undefined") return [];
  const next = dedupeTags(tags);
  localStorage.setItem(FOLLOWED_TAGS_KEY, JSON.stringify(next));
  return next;
}

export function isTagFollowed(tag: string, followedTags?: string[]): boolean {
  const key = normalizeTag(tag);
  if (!key) return false;
  const pool = Array.isArray(followedTags) ? followedTags : readFollowedTags();
  return pool.some((item) => normalizeTag(item) === key);
}

export function toggleFollowedTag(tag: string): { tags: string[]; followed: boolean } {
  const value = String(tag || "").trim();
  const key = normalizeTag(value);
  if (!key) return { tags: readFollowedTags(), followed: false };

  const current = readFollowedTags();
  const exists = current.some((item) => normalizeTag(item) === key);
  const next = exists
    ? current.filter((item) => normalizeTag(item) !== key)
    : [value, ...current];
  const written = writeFollowedTags(next);
  return { tags: written, followed: !exists };
}
