"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import PersonaHeader from "@/components/PersonaHeader";

type CardItem = {
  id: string;
  image_url: string;
  topic?: string;
  caption_short?: string;
  caption_long?: string;
  tags: string[];
  source?: "community" | "editorial";
  creator_name?: string;
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

  const topic = String(obj.topic || "").trim();
  const captionShort = String(obj.caption_short || "").trim();
  const captionLong = String(obj.caption_long || "").trim();
  const imageUrlRaw = String(obj.image_url || "").trim();
  const image_url =
    imageUrlRaw ||
    `https://picsum.photos/seed/${encodeURIComponent(topic || captionShort || id)}/1200/800`;

  const tags = Array.isArray(obj.tags)
    ? obj.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 12)
    : [];
  const source = obj.source === "community" ? "community" : "editorial";
  const creator_name = String(obj.creator_name || "").trim();
  const creator_handle = String(obj.creator_handle || "").trim();

  return {
    id,
    image_url,
    topic: topic || undefined,
    caption_short: captionShort || undefined,
    caption_long: captionLong || undefined,
    tags,
    source,
    creator_name: creator_name || undefined,
    creator_handle: creator_handle || undefined,
  };
}

function readCardsFromKey(key: string): CardItem[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParseJSON<unknown[]>(localStorage.getItem(key), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => normalizeCard(item))
    .filter((item): item is CardItem => Boolean(item));
}

function creatorLine(card: CardItem) {
  if (card.source === "community") return "by @you";
  return "Persona Editorial";
}

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const postId = decodeURIComponent(String(params?.id || ""));

  const post = useMemo(() => {
    if (!postId || typeof window === "undefined") return null;

    const uploads = readCardsFromKey("persona:uploads");
    const collection = readCardsFromKey("persona:collection");
    const saved = readCardsFromKey("persona:saved");
    const feedCache = readCardsFromKey("persona:feed_cache");

    const pool = [...uploads, ...collection, ...saved, ...feedCache];
    return pool.find((card) => card.id === postId) || null;
  }, [postId]);

  if (!post) {
    return (
      <div className="min-h-screen bg-white text-black px-5 py-8">
        <div className="max-w-2xl mx-auto">
          <PersonaHeader showBack />
          <h1 className="text-2xl font-semibold">Post</h1>
          <div className="mt-4 text-gray-600">Post not found</div>
          <Link href="/collection" className="mt-4 inline-block underline text-sm">
            Back to Collection
          </Link>
        </div>
      </div>
    );
  }

  const title = post.caption_short || post.topic || "Untitled";

  return (
    <div className="min-h-screen bg-white text-black px-5 py-8">
      <div className="max-w-2xl mx-auto">
        <PersonaHeader showBack />
        <h1 className="text-2xl font-semibold">Post</h1>

        <div className="mt-4 rounded-2xl border border-gray-200 overflow-hidden bg-white">
          <img
            src={post.image_url}
            alt={title}
            className="w-full h-auto max-h-[60vh] object-cover"
          />
          <div className="p-4">
            <div className="text-xl font-semibold">{title}</div>
            <div className="mt-1 text-xs text-gray-500">{creatorLine(post)}</div>
            {post.source === "community" ? (
              <div className="mt-2 inline-flex px-2 py-0.5 rounded-full text-[11px] border border-gray-300 text-gray-600">
                Community
              </div>
            ) : null}
            <div className="mt-3 text-xs text-gray-500">
              {post.tags.length ? post.tags.join(" • ") : "No tags"}
            </div>
            <div className="mt-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {post.caption_long || "No editorial text available."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
