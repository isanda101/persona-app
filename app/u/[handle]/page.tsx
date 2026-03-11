"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import PersonaHeader from "@/components/PersonaHeader";
import { readProfile } from "@/lib/profile";

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
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const params = useParams<{ handle: string }>();
  const handle = String(params?.handle || "").trim().replace(/^@+/, "");
  const localProfile = readProfile();
  const ownUsername = String(localProfile?.username || user?.username || "").trim().replace(/^@+/, "");
  const isOwnProfile =
    handle.toLowerCase() === "you" ||
    (isSignedIn && ownUsername && handle.toLowerCase() === ownUsername.toLowerCase());
  const resolvedHandle = isOwnProfile
    ? ownUsername || handle || "user"
    : handle || "user";
  const normalizedHandle = `@${resolvedHandle}`;
  const profileName = String(
    localProfile?.display_name ||
    user?.fullName ||
    user?.firstName ||
    user?.username ||
    "Persona User",
  ).trim();
  const profileIdentity = ownUsername ? `@${ownUsername}` : normalizedHandle;

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
      if (cardHandle !== resolvedHandle.toLowerCase()) continue;
      seen.add(card.id);
      out.push(card);
    }

    return out;
  }, [resolvedHandle]);

  return (
    <div className="min-h-screen bg-white text-black px-5 py-8">
      <div className="max-w-3xl mx-auto">
        <PersonaHeader showBack />
        <h1 className="text-2xl font-semibold mt-2">{normalizedHandle}</h1>
        <p className="text-sm text-gray-500 mt-1">{posts.length} posts</p>
        {isOwnProfile && !isSignedIn ? (
          <div className="mt-4 rounded-lg border border-gray-200 p-3">
            <div className="text-sm text-gray-700">Sign in to like, collect, and post on Persona.</div>
            <div className="mt-3 flex gap-2">
              <Link href="/sign-in" className="px-3 py-2 rounded-lg bg-black text-white text-sm">
                Sign in
              </Link>
              <Link href="/sign-up" className="px-3 py-2 rounded-lg border border-gray-300 text-sm">
                Sign up
              </Link>
            </div>
          </div>
        ) : null}
        {isOwnProfile && isSignedIn ? (
          <div className="mt-4 rounded-lg border border-gray-200 p-3">
            <div className="text-base font-medium">{profileName}</div>
            <div className="text-sm text-gray-500 mt-1">{profileIdentity}</div>
          </div>
        ) : null}
        {isOwnProfile ? (
          <div className="mt-6 border-t border-gray-200 pt-4">
            <div className="text-sm font-medium text-gray-500 mb-2">Preferences</div>
            <Link
              href="/taste"
              className="flex items-center justify-between px-3 py-3 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
            >
              <span>Refine tastes</span>
              <span className="text-gray-400">→</span>
            </Link>
          </div>
        ) : null}

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
