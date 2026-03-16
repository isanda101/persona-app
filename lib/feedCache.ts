export type CardWithId = {
  id?: string | null;
};

function isCardWithId(value: unknown): value is CardWithId {
  return Boolean(value) && typeof value === "object";
}

export function dedupeCardsByIdNewestFirst<T extends CardWithId>(cards: T[], max = 200): T[] {
  const seen = new Set<string>();
  const next: T[] = [];

  for (const card of cards) {
    const id = String(card?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(card);
    if (next.length >= max) break;
  }

  return next;
}

export function readStoredCards<T extends CardWithId>(key: string): T[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is T => isCardWithId(item));
  } catch {
    return [];
  }
}

export function writeStoredCards(key: string, cards: CardWithId[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(cards));
}

export function prependCardToStorage<T extends CardWithId>(key: string, card: T, max = 200): T[] {
  const existing = readStoredCards<T>(key);
  const next = dedupeCardsByIdNewestFirst([card, ...existing], max);
  writeStoredCards(key, next);
  return next;
}
