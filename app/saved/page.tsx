"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type CardItem = {
  id: string;
  image_url: string;
  topic?: string;
  caption_short?: string;
  tags: string[];
  source?: "community" | "editorial";
};

type ParsedLikes = {
  ids: string[];
  cards: CardItem[];
};

function safeParseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeCard(value: unknown): CardItem | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const id = String(obj.id || "").trim();
  if (!id) return null;

  const topic = String(obj.topic || "").trim();
  const captionShort = String(obj.caption_short || "").trim();
  const imageUrlRaw = String(obj.image_url || "").trim();
  const image_url =
    imageUrlRaw ||
    `https://picsum.photos/seed/${encodeURIComponent(topic || captionShort || id)}/400/240`;

  const tags = Array.isArray(obj.tags)
    ? obj.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  const source = obj.source === "community" ? "community" : "editorial";

  return {
    id,
    image_url,
    topic: topic || undefined,
    caption_short: captionShort || undefined,
    tags,
    source,
  };
}

function readCardArray(key: string): CardItem[] {
  const parsed = safeParseJSON<unknown[]>(localStorage.getItem(key), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => normalizeCard(item))
    .filter((item): item is CardItem => Boolean(item));
}

function parseLikes(raw: unknown): ParsedLikes {
  const ids = new Set<string>();
  const cards: CardItem[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") {
        const id = item.trim();
        if (id) ids.add(id);
        continue;
      }
      const card = normalizeCard(item);
      if (!card) continue;
      cards.push(card);
      ids.add(card.id);
    }
  } else if (raw && typeof raw === "object") {
    for (const [id, liked] of Object.entries(raw as Record<string, unknown>)) {
      if (liked && id.trim()) ids.add(id.trim());
    }
  }

  return { ids: Array.from(ids), cards };
}

function dedupeById(items: CardItem[]): CardItem[] {
  const seen = new Set<string>();
  const out: CardItem[] = [];
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function collectCachedCards(): CardItem[] {
  const cards: CardItem[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("persona:")) continue;
    const parsed = safeParseJSON<unknown>(localStorage.getItem(key), null);
    if (!Array.isArray(parsed)) continue;
    for (const item of parsed) {
      const card = normalizeCard(item);
      if (card) cards.push(card);
    }
  }
  return dedupeById(cards);
}

function getInitialCollectionState() {
  if (typeof window === "undefined") {
    return {
      collected: [] as CardItem[],
      posted: [] as CardItem[],
      likedIds: [] as string[],
      likedCards: [] as CardItem[],
      cached: [] as CardItem[],
    };
  }

  const collected = readCardArray("persona:saved");
  const posted = readCardArray("persona:uploads");
  const likesRaw = safeParseJSON<unknown>(localStorage.getItem("persona:likes"), {});
  const parsedLikes = parseLikes(likesRaw);
  const cached = collectCachedCards();

  return {
    collected,
    posted,
    likedIds: parsedLikes.ids,
    likedCards: parsedLikes.cards,
    cached,
  };
}

function sectionTitle(title: string, count: number) {
  return `${title} (${count})`;
}

function compactTitle(card: CardItem) {
  return card.caption_short || card.topic || "Untitled";
}

type SectionProps = {
  title: string;
  emptyText: string;
  items: CardItem[];
  onRemove: (card: CardItem) => void;
  showCommunityBadge?: boolean;
};

function Section({ title, emptyText, items, onRemove, showCommunityBadge = false }: SectionProps) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">{sectionTitle(title, items.length)}</h2>
      {items.length === 0 ? (
        <div className="text-sm text-gray-500">{emptyText}</div>
      ) : (
        <div className="space-y-3">
          {items.map((card) => (
            <div
              key={`${title}-${card.id}`}
              className="border border-gray-200 rounded-xl bg-white p-2 flex gap-3 items-start"
            >
              <img
                src={card.image_url}
                alt={compactTitle(card)}
                className="w-24 h-16 object-cover rounded-md shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{compactTitle(card)}</div>
                <div className="text-xs text-gray-500 mt-1 truncate">
                  {card.tags.length ? card.tags.slice(0, 5).join(" • ") : "No tags"}
                </div>
                {showCommunityBadge && card.source === "community" ? (
                  <div className="mt-1 inline-flex px-2 py-0.5 rounded-full text-[11px] border border-gray-300 text-gray-600">
                    Community
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onRemove(card)}
                className="text-gray-500 hover:text-black text-sm leading-none px-1"
                aria-label={`Remove from ${title}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function SavedPage() {
  const initial = getInitialCollectionState();
  const [collectedItems, setCollectedItems] = useState<CardItem[]>(initial.collected);
  const [postedItems, setPostedItems] = useState<CardItem[]>(initial.posted);
  const [likedIds, setLikedIds] = useState<string[]>(initial.likedIds);
  const [likedCardCache] = useState<CardItem[]>(initial.likedCards);
  const [cachedItems] = useState<CardItem[]>(initial.cached);

  const likedItems = useMemo(() => {
    const pool = dedupeById([
      ...collectedItems,
      ...postedItems,
      ...cachedItems,
      ...likedCardCache,
    ]);
    const byId = new Map(pool.map((item) => [item.id, item]));
    return likedIds.map((id) => byId.get(id)).filter((item): item is CardItem => Boolean(item));
  }, [cachedItems, collectedItems, likedCardCache, likedIds, postedItems]);

  const removeCollected = (card: CardItem) => {
    setCollectedItems((prev) => {
      const next = prev.filter((item) => item.id !== card.id);
      localStorage.setItem("persona:saved", JSON.stringify(next));
      return next;
    });
  };

  const removeLiked = (card: CardItem) => {
    setLikedIds((prev) => {
      const next = prev.filter((id) => id !== card.id);
      const nextLikes = Object.fromEntries(next.map((id) => [id, true]));
      localStorage.setItem("persona:likes", JSON.stringify(nextLikes));
      return next;
    });
  };

  const removePosted = (card: CardItem) => {
    setPostedItems((prev) => {
      const next = prev.filter((item) => item.id !== card.id);
      localStorage.setItem("persona:uploads", JSON.stringify(next));
      return next;
    });
  };

  const isEverythingEmpty =
    collectedItems.length === 0 && likedItems.length === 0 && postedItems.length === 0;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Collection</h1>

      {isEverythingEmpty ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
          <div className="text-gray-700">Your collection is empty for now.</div>
          <div className="text-sm text-gray-500 mt-1">Start collecting, liking, or posting to see items here.</div>
          <Link href="/" className="underline mt-3 inline-block text-sm">
            Back to feed
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <Section
            title="Collected"
            emptyText="No collected items yet."
            items={collectedItems}
            onRemove={removeCollected}
          />
          <Section
            title="Liked"
            emptyText="No liked items yet."
            items={likedItems}
            onRemove={removeLiked}
          />
          <Section
            title="Posted"
            emptyText="No posted items yet."
            items={postedItems}
            onRemove={removePosted}
            showCommunityBadge
          />
        </div>
      )}
    </div>
  );
}
