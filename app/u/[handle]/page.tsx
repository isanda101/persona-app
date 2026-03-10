"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import PersonaHeader from "@/components/PersonaHeader";

type CardItem = {
  id: string;
  image_url: string;
  caption_short?: string;
  topic?: string;
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

  const imageUrl = String(obj.image_url || "").trim();
  if (!imageUrl) return null;

  return {
    id,
    image_url: imageUrl,
    caption_short: String(obj.caption_short || "").trim() || undefined,
    topic: String(obj.topic || "").trim() || undefined,
    creator_handle: String(obj.creator_handle || "").trim() || undefined,
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

export default function UserHandlePage() {
  const params = useParams<{ handle: string }>();
  const handle = String(params?.handle || "").trim().replace(/^@+/, "");
  const normalizedHandle = handle ? `@${handle}` : "@user";

  const posts = useMemo(() => {
    if (typeof window === "undefined") return [] as CardItem[];

    const uploads = readCardArray("persona:uploads");
    const feedCache = readCardArray("persona:feed_cache");
    const pool = [...uploads, ...feedCache];
    const seen = new Set<string>();
    const out: CardItem[] = [];

    for (const card of pool) {
      if (!card.id || seen.has(card.id)) continue;
      const cardHandle = String(card.creator_handle || "").trim().replace(/^@+/, "").toLowerCase();
      if (cardHandle !== handle.toLowerCase()) continue;
      seen.add(card.id);
      out.push(card);
    }

    return out;
  }, [handle]);

  return (
    <div className="min-h-screen bg-white text-black px-5 py-8">
      <div className="max-w-3xl mx-auto">
        <PersonaHeader showBack />
        <h1 className="text-2xl font-semibold mt-2">{normalizedHandle}</h1>
        <p className="text-sm text-gray-500 mt-1">{posts.length} posts</p>

        {posts.length ? (
          <div className="grid grid-cols-2 gap-3 mt-5">
            {posts.map((card) => (
              <Link
                key={card.id}
                href={`/post/${encodeURIComponent(card.id)}`}
                className="border border-gray-200 rounded-xl overflow-hidden bg-white"
              >
                <img
                  src={card.image_url}
                  alt={card.caption_short || card.topic || "Post"}
                  className="w-full aspect-[3/4] object-cover"
                />
                <div className="p-2 text-sm truncate">{card.caption_short || card.topic || "Untitled"}</div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500 mt-5">No posts yet.</div>
        )}
      </div>
    </div>
  );
}
