"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import PersonaHeader from "@/components/PersonaHeader";
import {
  getEngagement,
  readEngagement,
  writeEngagement,
  type EngagementMap,
} from "@/lib/engagement";

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
  likes_count?: number;
  comments_count?: number;
  collections_count?: number;
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
  const likes_count = Math.max(0, Number(obj.likes_count) || 0);
  const comments_count = Math.max(0, Number(obj.comments_count) || 0);
  const collections_count = Math.max(0, Number(obj.collections_count) || 0);

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
    likes_count,
    comments_count,
    collections_count,
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
  const rawHandle = String(card.creator_handle || "").trim();
  if (rawHandle) {
    return `by ${rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`}`;
  }
  if (card.source === "editorial") return "by Persona";
  return "by @you";
}

function sourceLabel(card: CardItem) {
  return card.source === "community" ? "Persona Community" : "Persona Editorial";
}

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const postId = decodeURIComponent(String(params?.id || ""));
  const [likes, setLikes] = useState<Record<string, boolean>>(() =>
    safeParseJSON<Record<string, boolean>>(localStorage.getItem("persona:likes"), {}),
  );
  const [savedIds, setSavedIds] = useState<string[]>(() =>
    readCardsFromKey("persona:saved").map((card) => card.id),
  );
  const [engagement, setEngagement] = useState<EngagementMap>(() => readEngagement());
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const post = useMemo(() => {
    if (!postId || typeof window === "undefined") return null;

    const uploads = readCardsFromKey("persona:uploads");
    const collection = readCardsFromKey("persona:collection");
    const saved = readCardsFromKey("persona:saved");
    const feedCache = readCardsFromKey("persona:feed_cache");

    const pool = [...uploads, ...collection, ...saved, ...feedCache];
    return pool.find((card) => card.id === postId) || null;
  }, [postId]);
  const postEngagement = useMemo(
    () => (post?.id ? getEngagement(post.id, engagement) : getEngagement("")),
    [post, engagement],
  );

  function showActionMessage(message: string) {
    setActionMessage(message);
    window.setTimeout(() => setActionMessage(null), 1500);
  }

  function toggleLike() {
    if (!post) return;
    setLikes((prev) => {
      const wasLiked = Boolean(prev[post.id]);
      const next = { ...prev };
      if (wasLiked) {
        delete next[post.id];
      } else {
        next[post.id] = true;
      }
      localStorage.setItem("persona:likes", JSON.stringify(next));
      setEngagement((prevEngagement) => {
        const current = getEngagement(post.id, prevEngagement);
        const nextCounts = {
          ...current,
          likes_count: wasLiked
            ? Math.max(0, current.likes_count - 1)
            : current.likes_count + 1,
        };
        const nextEngagement = { ...prevEngagement, [post.id]: nextCounts };
        writeEngagement(nextEngagement);
        return nextEngagement;
      });
      return next;
    });
  }

  async function handleShare() {
    if (!post) return;
    const shareUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Persona",
          text: post.caption_short || post.topic || "Persona post",
          url: shareUrl,
        });
      } catch {
        // ignore cancellation/errors
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      showActionMessage("Link copied");
    } catch {
      showActionMessage("Unable to copy link");
    }
  }

  function toggleCollection() {
    if (!post) return;
    const saved = readCardsFromKey("persona:saved");
    const exists = saved.some((card) => card.id === post.id);
    const next = exists
      ? saved.filter((card) => card.id !== post.id)
      : [post, ...saved];

    localStorage.setItem("persona:saved", JSON.stringify(next));
    setSavedIds(next.map((card) => card.id));
    setEngagement((prevEngagement) => {
      const current = getEngagement(post.id, prevEngagement);
      const nextCounts = {
        ...current,
        collections_count: exists
          ? Math.max(0, current.collections_count - 1)
          : current.collections_count + 1,
      };
      const nextEngagement = { ...prevEngagement, [post.id]: nextCounts };
      writeEngagement(nextEngagement);
      return nextEngagement;
    });
  }

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
  const isLiked = Boolean(likes[post.id]);
  const isCollected = savedIds.includes(post.id);

  return (
    <div className="min-h-screen bg-white text-black px-5 py-8">
      <div className="max-w-2xl mx-auto">
        <PersonaHeader showBack />
        <h1 className="text-2xl font-semibold">Post</h1>

        <div className="mt-4 rounded-2xl border border-gray-200 overflow-hidden bg-white">
          <img
            src={post.image_url}
            alt={title}
            className="w-full h-auto max-h-[60vh] object-contain bg-gray-50"
          />
          <div className="p-4">
            <div className="text-xl font-semibold">{title}</div>
            <div className="mt-1 text-xs text-gray-500">{creatorLine(post)}</div>
            <div className="mt-2 inline-flex px-2 py-0.5 rounded-full text-[11px] border border-gray-300 text-gray-600">
              {sourceLabel(post)}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-gray-600">
                <button
                  type="button"
                  onClick={toggleLike}
                  className={`hover:text-black active:scale-95 transition ${isLiked ? "text-black" : ""}`}
                  aria-label="Like"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill={isLiked ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => showActionMessage("Comments coming soon")}
                  className="hover:text-black active:scale-95 transition"
                  aria-label="Comment"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="hover:text-black active:scale-95 transition"
                  aria-label="Share"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
                    <path d="M16 6l-4-4-4 4" />
                    <path d="M12 2v14" />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                onClick={toggleCollection}
                className={`px-3 py-2 rounded text-sm transition ${
                  isCollected
                    ? "bg-gray-200 text-gray-700"
                    : "bg-black text-white"
                }`}
              >
                {isCollected ? "Collected ✕" : "+ Collection"}
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              ♥ {postEngagement.likes_count} &nbsp; 💬 {postEngagement.comments_count}
              &nbsp; 🔖 {postEngagement.collections_count}
            </div>

            {actionMessage ? (
              <div className="mt-2 text-xs text-gray-500">{actionMessage}</div>
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
