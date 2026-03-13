export function normalizeTag(tag: string): string {
  return String(tag || "").trim().toLowerCase();
}

export function slugifyTag(tag: string): string {
  return normalizeTag(tag).replace(/\s+/g, "-");
}

export function unslugifyTag(slug: string): string {
  const value = normalizeTag(slug).replace(/-+/g, " ");
  if (!value) return "";
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type CardWithTags = {
  tags?: string[];
};

export function getRelatedTagsFromCards(
  cards: CardWithTags[],
  currentTag: string,
  limit = 6,
): string[] {
  const currentKey = normalizeTag(currentTag);
  if (!currentKey) return [];

  const counts = new Map<string, number>();
  const displayMap = new Map<string, string>();

  for (const card of cards) {
    const tags = Array.isArray(card.tags) ? card.tags : [];
    for (const raw of tags) {
      const displayTag = String(raw || "").trim();
      if (!displayTag) continue;
      const key = normalizeTag(displayTag);
      if (!key || key === currentKey) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!displayMap.has(key)) displayMap.set(key, displayTag);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([key]) => displayMap.get(key) || key);
}
