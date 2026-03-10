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
  creator_name?: string;
  creator_handle?: string;
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
  const creator_name = String(obj.creator_name || "").trim();
  const creator_handle = String(obj.creator_handle || "").trim();

  return {
    id,
    image_url,
    topic: topic || undefined,
    caption_short: captionShort || undefined,
    tags,
    source,
    creator_name: creator_name || undefined,
    creator_handle: creator_handle || undefined,
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

function creatorLine(card: CardItem) {
  if (card.source === "community") return "by @you";
  return "Persona Editorial";
}

type SectionProps = {
  emptyText: string;
  items: CardItem[];
  onRemove: (card: CardItem) => void;
  showCommunityBadge?: boolean;
};

function GridPanel({ emptyText, items, onRemove, showCommunityBadge = false }: SectionProps) {
  return (
    <section className="mt-5">
      {items.length === 0 ? <div className="text-sm text-gray-500">{emptyText}</div> : null}
      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {items.map((card) => (
            <div key={card.id} className="relative border border-gray-200 rounded-xl bg-white overflow-hidden">
              <Link href={`/post/${encodeURIComponent(card.id)}`} className="block">
                <div>
                  <img
                    src={card.image_url}
                    alt={compactTitle(card)}
                    className="w-full aspect-[3/4] object-cover"
                  />
                </div>
                <div className="p-2">
                  <div className="text-sm font-medium truncate">{compactTitle(card)}</div>
                  {creatorLine(card) ? (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{creatorLine(card)}</div>
                  ) : null}
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    {card.tags.length ? card.tags.slice(0, 4).join(" • ") : "No tags"}
                  </div>
                  {showCommunityBadge && card.source === "community" ? (
                    <div className="mt-2 inline-flex px-2 py-0.5 rounded-full text-[11px] border border-gray-300 text-gray-600">
                      Community
                    </div>
                  ) : null}
                </div>
              </Link>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove(card);
                }}
                className="absolute top-2 right-2 h-7 w-7 rounded-full bg-white/90 border border-gray-300 text-xs text-gray-700 hover:text-black z-10"
                aria-label="Remove item"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default function SavedPage() {
  const initial = getInitialCollectionState();
  const [activeTab, setActiveTab] = useState<"posted" | "collected" | "likes">("posted");
  const [collectedItems, setCollectedItems] = useState<CardItem[]>(initial.collected);
  const [postedItems, setPostedItems] = useState<CardItem[]>(initial.posted);
  const [likedIds, setLikedIds] = useState<string[]>(initial.likedIds);
  const [likedCardCache, setLikedCardCache] = useState<CardItem[]>(initial.likedCards);
  const [cachedItems, setCachedItems] = useState<CardItem[]>(initial.cached);

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
    const ok = window.confirm("Delete this post? This will remove it from Persona.");
    if (!ok) return;

    const id = card.id;

    // Remove from uploads.
    setPostedItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      localStorage.setItem("persona:uploads", JSON.stringify(next));
      return next;
    });

    // Remove from collection keys used by + Collection.
    setCollectedItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      localStorage.setItem("persona:saved", JSON.stringify(next));
      return next;
    });
    const rawCollection = safeParseJSON<unknown[]>(localStorage.getItem("persona:collection"), []);
    if (Array.isArray(rawCollection)) {
      const nextCollection = rawCollection.filter((entry) => {
        const normalized = normalizeCard(entry);
        return normalized ? normalized.id !== id : true;
      });
      localStorage.setItem("persona:collection", JSON.stringify(nextCollection));
    }

    // Remove from likes (object or array of ids/cards).
    setLikedIds((prev) => {
      const nextIds = prev.filter((likedId) => likedId !== id);
      const rawLikes = safeParseJSON<unknown>(localStorage.getItem("persona:likes"), {});
      let nextLikes: unknown;
      if (Array.isArray(rawLikes)) {
        nextLikes = rawLikes.filter((entry) => {
          if (typeof entry === "string") return entry !== id;
          const normalized = normalizeCard(entry);
          return normalized ? normalized.id !== id : true;
        });
      } else if (rawLikes && typeof rawLikes === "object") {
        const nextObj = { ...(rawLikes as Record<string, unknown>) };
        delete nextObj[id];
        nextLikes = nextObj;
      } else {
        nextLikes = Object.fromEntries(nextIds.map((likedId) => [likedId, true]));
      }
      localStorage.setItem("persona:likes", JSON.stringify(nextLikes));
      return nextIds;
    });

    // Remove from cached liked card pool and feed cache.
    setLikedCardCache((prev) => prev.filter((item) => item.id !== id));
    setCachedItems((prev) => prev.filter((item) => item.id !== id));
    const rawFeedCache = safeParseJSON<unknown[]>(localStorage.getItem("persona:feed_cache"), []);
    if (Array.isArray(rawFeedCache)) {
      const nextFeedCache = rawFeedCache.filter((entry) => {
        const normalized = normalizeCard(entry);
        return normalized ? normalized.id !== id : true;
      });
      localStorage.setItem("persona:feed_cache", JSON.stringify(nextFeedCache));
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold">Collection</h1>

      <div className="mt-4 border-b border-gray-200 flex items-end gap-5">
        {[
          { key: "posted", label: sectionTitle("Posted", postedItems.length) },
          { key: "collected", label: sectionTitle("Collected", collectedItems.length) },
          { key: "likes", label: sectionTitle("Likes", likedItems.length) },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as "posted" | "collected" | "likes")}
              className={`pb-2 text-sm ${
                isActive
                  ? "text-black border-b-2 border-black font-medium"
                  : "text-gray-500 border-b-2 border-transparent"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "posted" ? (
        <GridPanel
          emptyText="You haven't posted anything yet."
          items={postedItems}
          onRemove={removePosted}
          showCommunityBadge
        />
      ) : null}

      {activeTab === "collected" ? (
        <GridPanel
          emptyText="No collected items yet."
          items={collectedItems}
          onRemove={removeCollected}
        />
      ) : null}

      {activeTab === "likes" ? (
        <GridPanel
          emptyText="You haven't liked any items yet."
          items={likedItems}
          onRemove={removeLiked}
        />
      ) : null}
    </div>
  );
}
