"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SignInButton, useUser } from "@clerk/nextjs";
import PersonaHeader from "@/components/PersonaHeader";
import {
  fetchFollowedTagsForUser,
  isTagFollowed,
  readFollowedTags,
  toggleFollowedTagForUser,
} from "@/lib/followedTags";
import { getRelatedTagsFromCards, normalizeTag, slugifyTag, unslugifyTag } from "@/lib/tags";

type CardItem = {
  id: string;
  image_url: string;
  topic?: string;
  caption_short?: string;
  tags: string[];
  creator_handle?: string;
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
  const image_url = String(obj.image_url || "").trim();
  if (!image_url) return null;
  const tags = Array.isArray(obj.tags)
    ? obj.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];
  return {
    id,
    image_url,
    topic: String(obj.topic || "").trim() || undefined,
    caption_short: String(obj.caption_short || "").trim() || undefined,
    creator_handle: String(obj.creator_handle || "").trim() || undefined,
    tags,
  };
}

function readCardArray(key: string): CardItem[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParseJSON<unknown[]>(localStorage.getItem(key), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => normalizeCard(item))
    .filter((item): item is CardItem => Boolean(item));
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

function displayTitle(card: CardItem): string {
  return card.caption_short || card.topic || "Untitled";
}

function creatorLine(card: CardItem): string {
  const handle = String(card.creator_handle || "").trim();
  if (!handle) return "";
  return handle.startsWith("@") ? `by ${handle}` : `by @${handle}`;
}

export default function TagPage() {
  const { isSignedIn, user } = useUser();
  const params = useParams<{ slug: string }>();
  const slug = String(params?.slug || "").trim();
  const displayTag = unslugifyTag(slug);
  const normalizedTag = normalizeTag(displayTag);
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

  const uploads = readCardArray("persona:uploads");
  const saved = readCardArray("persona:saved");
  const feedCache = readCardArray("persona:feed_cache");
  const mergedCards = dedupeById([...uploads, ...saved, ...feedCache]);
  const cards = mergedCards.filter((card) =>
    card.tags.some((tag) => normalizeTag(tag) === normalizedTag),
  );
  const relatedTags = getRelatedTagsFromCards(cards, displayTag, 6);
  const trailNodes = [displayTag, ...relatedTags.slice(0, 3)].filter(Boolean);

  const following = Boolean(isSignedIn) && isTagFollowed(displayTag, followedTags);

  return (
    <div className="min-h-screen bg-white text-black px-5 py-8">
      <div className="max-w-3xl mx-auto">
        <PersonaHeader showBack />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{displayTag || "Tag"}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Posts tagged with {displayTag || "this tag"}
            </p>
          </div>
          {isSignedIn ? (
            <button
              type="button"
              onClick={async () => {
                if (!user?.id) return;
                try {
                  const result = await toggleFollowedTagForUser(user.id, displayTag);
                  setFollowedTags(result.tags);
                } catch (error) {
                  console.error("Failed to toggle followed tag", error);
                }
              }}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                following
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              {following ? "Following" : "Follow"}
            </button>
          ) : (
            <SignInButton mode="modal">
              <button
                type="button"
                className="px-3 py-1.5 rounded-full text-sm border bg-white text-gray-700 border-gray-300"
              >
                Follow
              </button>
            </SignInButton>
          )}
        </div>

        {relatedTags.length ? (
          <div className="mt-5">
            <div className="text-sm font-medium text-gray-500 mb-2">Related Tags</div>
            <div className="flex flex-wrap gap-2">
              {relatedTags.map((tag) => (
                <Link
                  key={`related-${tag}`}
                  href={`/t/${encodeURIComponent(slugifyTag(tag))}`}
                  className="rounded-full border px-3 py-1.5 text-sm bg-white text-black border-gray-300"
                >
                  {tag}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {trailNodes.length >= 2 ? (
          <div className="mt-5">
            <div className="text-sm font-medium text-gray-500 mb-2">Taste Trail</div>
            <div className="flex items-center gap-2 flex-wrap">
              {trailNodes.map((tag, idx) => {
                const isCurrent = idx === 0;
                return (
                  <div key={`trail-${tag}-${idx}`} className="inline-flex items-center gap-2">
                    {isCurrent ? (
                      <span className="rounded-full border px-3 py-1.5 text-sm bg-black text-white border-black">
                        {tag}
                      </span>
                    ) : (
                      <Link
                        href={`/t/${encodeURIComponent(slugifyTag(tag))}`}
                        className="rounded-full border px-3 py-1.5 text-sm bg-white text-black border-gray-300"
                      >
                        {tag}
                      </Link>
                    )}
                    {idx < trailNodes.length - 1 ? (
                      <span className="text-sm text-gray-400">→</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {cards.length ? (
          <div className="grid grid-cols-2 gap-3 mt-5">
            {cards.map((card) => (
              <Link
                key={card.id}
                href={`/post/${encodeURIComponent(card.id)}`}
                className="border border-gray-200 rounded-xl overflow-hidden bg-white"
              >
                <img
                  src={card.image_url}
                  alt={displayTitle(card)}
                  className="w-full aspect-[3/4] object-cover"
                />
                <div className="p-2">
                  <div className="text-sm font-medium truncate">{displayTitle(card)}</div>
                  {creatorLine(card) ? (
                    <div className="text-xs text-gray-500 truncate mt-1">{creatorLine(card)}</div>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-6 text-sm text-gray-500">No posts found for this tag yet.</div>
        )}
      </div>
    </div>
  );
}
