"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SignInButton, useUser } from "@clerk/nextjs";
import PersonaHeader from "@/components/PersonaHeader";
import {
  fetchFollowedTagsForUser,
  isTagFollowed,
  readFollowedTags,
  toggleFollowedTagForUser,
} from "@/lib/followedTags";
import { slugifyTag } from "@/lib/tags";

type SearchTab = "top" | "posts" | "tags" | "creators";

type CardItem = {
  id: string;
  image_url: string;
  topic?: string;
  caption_short?: string;
  caption_long?: string;
  tags: string[];
  creator_name?: string;
  creator_handle?: string;
  source?: "community" | "editorial";
};

type CreatorMatch = {
  handle: string;
  name?: string;
  count: number;
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
  const captionLong = String(obj.caption_long || "").trim();
  const imageUrlRaw = String(obj.image_url || "").trim();
  const image_url =
    imageUrlRaw ||
    `https://picsum.photos/seed/${encodeURIComponent(topic || captionShort || id)}/600/800`;

  const tags = Array.isArray(obj.tags)
    ? obj.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];

  const creator_name = String(obj.creator_name || "").trim();
  const creator_handle = String(obj.creator_handle || "").trim();
  const source = obj.source === "community" ? "community" : "editorial";

  return {
    id,
    image_url,
    topic: topic || undefined,
    caption_short: captionShort || undefined,
    caption_long: captionLong || undefined,
    tags,
    creator_name: creator_name || undefined,
    creator_handle: creator_handle || undefined,
    source,
  };
}

function dedupeCardsById(items: CardItem[]): CardItem[] {
  const seen = new Set<string>();
  const out: CardItem[] = [];
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function readCardArray(key: string): CardItem[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParseJSON<unknown[]>(localStorage.getItem(key), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => normalizeCard(item))
    .filter((item): item is CardItem => Boolean(item));
}

function readTasteTags(): string[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParseJSON<unknown>(localStorage.getItem("persona:taste"), []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function compactTitle(card: CardItem): string {
  return card.caption_short || card.topic || "Untitled";
}

function searchableText(card: CardItem): string {
  return [
    card.topic || "",
    card.caption_short || "",
    card.caption_long || "",
    card.tags.join(" "),
    card.creator_handle || "",
    card.creator_name || "",
  ]
    .join(" ")
    .toLowerCase();
}

export default function SearchPage() {
  const { isSignedIn, user } = useUser();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SearchTab>("top");
  const [followedTags, setFollowedTags] = useState<string[]>(() => readFollowedTags());

  useEffect(() => {
    if (!isSignedIn || !user?.id) {
      Promise.resolve().then(() => {
        setFollowedTags(readFollowedTags());
      });
      return;
    }

    let cancelled = false;

    fetchFollowedTagsForUser(user.id)
      .then((tags) => {
        if (cancelled) return;
        setFollowedTags(tags);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to fetch followed tags", error);
        setFollowedTags(readFollowedTags());
      });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, user?.id]);

  const allCards = useMemo(() => {
    const uploads = readCardArray("persona:uploads");
    const collection = readCardArray("persona:collection");
    const saved = readCardArray("persona:saved");
    const feedCache = readCardArray("persona:feed_cache");
    return dedupeCardsById([...uploads, ...collection, ...saved, ...feedCache]);
  }, []);

  const allTags = useMemo(() => {
    const fromCards = allCards.flatMap((card) => card.tags || []);
    const fromTaste = readTasteTags();
    const seen = new Set<string>();
    const out: string[] = [];

    for (const raw of [...fromCards, ...fromTaste]) {
      const tag = String(raw || "").trim();
      if (!tag) continue;
      const key = normalize(tag);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
    }

    return out;
  }, [allCards]);

  const allCreators = useMemo(() => {
    const map = new Map<string, CreatorMatch>();

    for (const card of allCards) {
      const rawHandle = String(card.creator_handle || "").trim();
      const rawName = String(card.creator_name || "").trim();
      const normalizedHandle = rawHandle
        ? rawHandle.startsWith("@")
          ? rawHandle
          : `@${rawHandle}`
        : "";
      const key = normalize(normalizedHandle || rawName);
      if (!key) continue;

      const prev = map.get(key);
      if (prev) {
        prev.count += 1;
        continue;
      }

      map.set(key, {
        handle: normalizedHandle || `@${rawName.replace(/^@+/, "")}`,
        name: rawName || undefined,
        count: 1,
      });
    }

    return Array.from(map.values());
  }, [allCards]);

  const normalizedQuery = normalize(query);

  const matchingPosts = useMemo(() => {
    if (!normalizedQuery) return allCards.slice(0, 24);
    return allCards.filter((card) => searchableText(card).includes(normalizedQuery));
  }, [allCards, normalizedQuery]);

  const matchingTags = useMemo(() => {
    if (!normalizedQuery) return allTags.slice(0, 40);
    return allTags.filter((tag) => normalize(tag).includes(normalizedQuery));
  }, [allTags, normalizedQuery]);

  const matchingCreators = useMemo(() => {
    if (!normalizedQuery) return allCreators.slice(0, 20);
    return allCreators.filter((creator) => {
      const combined = `${creator.handle} ${creator.name || ""}`.toLowerCase();
      return combined.includes(normalizedQuery);
    });
  }, [allCreators, normalizedQuery]);

  const topItems = useMemo(() => {
    const posts = matchingPosts.slice(0, 8).map((post) => ({ kind: "post" as const, post }));
    const tags = matchingTags.slice(0, 2).map((tag) => ({ kind: "tag" as const, tag }));
    const creators = matchingCreators
      .slice(0, 2)
      .map((creator) => ({ kind: "creator" as const, creator }));
    return [...posts, ...tags, ...creators].slice(0, 12);
  }, [matchingCreators, matchingPosts, matchingTags]);

  const isEmpty =
    activeTab === "top"
      ? topItems.length === 0
      : activeTab === "posts"
        ? matchingPosts.length === 0
        : activeTab === "tags"
          ? matchingTags.length === 0
          : matchingCreators.length === 0;

  return (
    <div className="min-h-screen bg-white text-black px-5 py-8">
      <div className="max-w-3xl mx-auto">
        <PersonaHeader showBack />
        <h1 className="text-2xl font-semibold mt-2">Search</h1>

        <div className="mt-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Persona"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>

        <div className="mt-4 border-b border-gray-200 flex items-center gap-5">
          {([
            ["top", "Top"],
            ["posts", "Posts"],
            ["tags", "Tags"],
            ["creators", "Creators"],
          ] as const).map(([value, label]) => {
            const active = activeTab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveTab(value)}
                className={`pb-2 text-sm ${
                  active ? "text-black border-b-2 border-black font-medium" : "text-gray-500"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          {activeTab === "top" ? (
            <div className="space-y-3">
              {topItems.map((item, idx) => {
                if (item.kind === "post") {
                  const card = item.post;
                  return (
                    <Link
                      key={`top-post-${card.id}-${idx}`}
                      href={`/post/${encodeURIComponent(card.id)}`}
                      className="flex items-center gap-3 p-2 rounded-xl border border-gray-200"
                    >
                      <img
                        src={card.image_url}
                        alt={compactTitle(card)}
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{compactTitle(card)}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {card.tags.length ? card.tags.slice(0, 3).join(" • ") : "Post"}
                        </div>
                      </div>
                    </Link>
                  );
                }

                if (item.kind === "tag") {
                  const followed = Boolean(isSignedIn) && isTagFollowed(item.tag, followedTags);
                  return (
                    <div key={`top-tag-${item.tag}-${idx}`} className="inline-flex items-center gap-2 mr-2">
                      <Link
                        href={`/t/${encodeURIComponent(slugifyTag(item.tag))}`}
                        className="inline-flex px-3 py-2 rounded-full text-sm border border-gray-300 bg-white"
                      >
                        #{item.tag}
                      </Link>
                      {isSignedIn ? (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!user?.id) return;
                            try {
                              const result = await toggleFollowedTagForUser(user.id, item.tag);
                              setFollowedTags(result.tags);
                            } catch (error) {
                              console.error("Failed to toggle followed tag", error);
                            }
                          }}
                          className={`text-xs px-2 py-1 rounded-full border ${
                            followed
                              ? "bg-black text-white border-black"
                              : "bg-white text-gray-600 border-gray-300"
                          }`}
                        >
                          {followed ? "Following" : "Follow"}
                        </button>
                      ) : (
                        <SignInButton mode="modal">
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded-full border bg-white text-gray-600 border-gray-300"
                          >
                            Follow
                          </button>
                        </SignInButton>
                      )}
                    </div>
                  );
                }

                const creator = item.creator;
                return (
                  <Link
                    key={`top-creator-${creator.handle}-${idx}`}
                    href={`/u/${encodeURIComponent(creator.handle.replace(/^@/, ""))}`}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-200"
                  >
                    <div>
                      <div className="text-sm font-medium">{creator.handle}</div>
                      {creator.name ? <div className="text-xs text-gray-500">{creator.name}</div> : null}
                    </div>
                    <div className="text-xs text-gray-400">{creator.count} posts</div>
                  </Link>
                );
              })}
            </div>
          ) : null}

          {activeTab === "posts" ? (
            <div className="grid grid-cols-2 gap-3">
              {matchingPosts.map((card) => (
                <Link
                  key={card.id}
                  href={`/post/${encodeURIComponent(card.id)}`}
                  className="border border-gray-200 rounded-xl overflow-hidden bg-white"
                >
                  <img src={card.image_url} alt={compactTitle(card)} className="w-full aspect-[3/4] object-cover" />
                  <div className="p-2">
                    <div className="text-sm font-medium truncate">{compactTitle(card)}</div>
                    <div className="text-xs text-gray-500 truncate mt-1">
                      {card.tags.length ? card.tags.slice(0, 4).join(" • ") : "No tags"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : null}

          {activeTab === "tags" ? (
            <div className="space-y-2">
              {matchingTags.map((tag) => (
                <div
                  key={tag}
                  className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2"
                >
                  <Link
                    href={`/t/${encodeURIComponent(slugifyTag(tag))}`}
                    className="text-sm text-left"
                  >
                    #{tag}
                  </Link>
                  {isSignedIn ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!user?.id) return;
                        try {
                          const result = await toggleFollowedTagForUser(user.id, tag);
                          setFollowedTags(result.tags);
                        } catch (error) {
                          console.error("Failed to toggle followed tag", error);
                        }
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border ${
                        isTagFollowed(tag, followedTags)
                          ? "bg-black text-white border-black"
                          : "bg-white text-gray-600 border-gray-300"
                      }`}
                    >
                      {isTagFollowed(tag, followedTags) ? "Following" : "Follow"}
                    </button>
                  ) : (
                    <SignInButton mode="modal">
                      <button
                        type="button"
                        className="text-xs px-2.5 py-1 rounded-full border bg-white text-gray-600 border-gray-300"
                      >
                        Follow
                      </button>
                    </SignInButton>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {activeTab === "creators" ? (
            <div className="space-y-2">
              {matchingCreators.map((creator) => (
                <Link
                  key={creator.handle}
                  href={`/u/${encodeURIComponent(creator.handle.replace(/^@/, ""))}`}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-white"
                >
                  <div>
                    <div className="text-sm font-medium">{creator.handle}</div>
                    {creator.name ? <div className="text-xs text-gray-500">{creator.name}</div> : null}
                  </div>
                  <div className="text-xs text-gray-400">{creator.count} posts</div>
                </Link>
              ))}
            </div>
          ) : null}

          {isEmpty ? <div className="text-sm text-gray-500">No results found.</div> : null}
        </div>
      </div>
    </div>
  );
}
