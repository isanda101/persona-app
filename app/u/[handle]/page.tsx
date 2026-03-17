"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SignInButton, SignOutButton, SignUpButton, useUser } from "@clerk/nextjs";
import { Bookmark, Grid3X3, Heart } from "lucide-react";
import PersonaHeader from "@/components/PersonaHeader";
import { fetchFollowedTagsForUser, readFollowedTags } from "@/lib/followedTags";
import { supabase } from "@/lib/supabase";
import { slugifyTag } from "@/lib/tags";

type TabKey = "posted" | "collected" | "likes";

type CardItem = {
  id: string;
  image_url: string;
  caption_short?: string;
  topic?: string;
  tags: string[];
  source?: "community" | "editorial";
  creator_name?: string;
  creator_handle?: string;
  creator_avatar?: string;
  creator_id?: string;
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

function cleanHandle(handle?: string) {
  return String(handle || "").trim().replace(/^@+/, "");
}

function normalizeHandle(handle?: string) {
  return cleanHandle(handle).toLowerCase();
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
  const creator_avatar = String(obj.creator_avatar || "").trim();
  const creator_id = String(obj.creator_id || "").trim();

  return {
    id,
    image_url,
    topic: topic || undefined,
    caption_short: captionShort || undefined,
    tags,
    source,
    creator_name: creator_name || undefined,
    creator_handle: creator_handle || undefined,
    creator_avatar: creator_avatar || undefined,
    creator_id: creator_id || undefined,
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

function collectCachedCards(): CardItem[] {
  if (typeof window === "undefined") return [];
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

function compactTitle(card: CardItem) {
  return card.caption_short || card.topic || "Untitled";
}

function creatorLine(card: CardItem) {
  const handle = cleanHandle(card.creator_handle);
  if (handle) return `by @${handle}`;
  if (card.source === "community") return "by @you";
  return "Persona Editorial";
}

function fallbackLetter(handle?: string, name?: string) {
  const source = cleanHandle(handle) || String(name || "").trim();
  return source ? source.charAt(0).toUpperCase() : "U";
}

function isTabKey(value: string): value is TabKey {
  return value === "posted" || value === "collected" || value === "likes";
}

type GridPanelProps = {
  emptyText: string;
  items: CardItem[];
  onRemove?: (card: CardItem) => void;
  currentUserId?: string;
  currentUsername?: string;
  currentUserImage?: string;
};

function GridPanel({
  emptyText,
  items,
  onRemove,
  currentUserId,
  currentUsername,
  currentUserImage,
}: GridPanelProps) {
  const router = useRouter();

  function resolveAvatar(card: CardItem) {
    const creatorId = String(card.creator_id || "").trim();
    const creatorHandle = normalizeHandle(card.creator_handle);
    const username = normalizeHandle(currentUsername || "");
    const isMine =
      (currentUserId && creatorId && currentUserId === creatorId) ||
      (creatorHandle && username && creatorHandle === username);
    if (isMine) {
      return String(currentUserImage || "").trim();
    }
    return String(card.creator_avatar || "").trim();
  }

  return (
    <section className="mt-4">
      {items.length === 0 ? <div className="text-sm text-gray-500">{emptyText}</div> : null}
      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {items.map((card) => (
            <div key={card.id} className="relative border border-gray-200 rounded-xl bg-white overflow-hidden">
              <Link href={`/post/${encodeURIComponent(card.id)}`} className="block">
                <img
                  src={card.image_url}
                  alt={compactTitle(card)}
                  className="w-full aspect-[3/4] object-cover"
                />
                <div className="p-2">
                  <div className="text-sm font-medium truncate">{compactTitle(card)}</div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                    {cleanHandle(card.creator_handle) ? (
                      <div className="flex items-center gap-1.5">
                        {resolveAvatar(card) ? (
                          <img
                            src={resolveAvatar(card)}
                            alt={card.creator_name || card.creator_handle || "Creator avatar"}
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-[10px] font-medium">
                            {fallbackLetter(card.creator_handle, card.creator_name)}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            router.push(`/u/${encodeURIComponent(cleanHandle(card.creator_handle))}`);
                          }}
                          className="hover:text-gray-700 active:text-black transition-colors"
                        >
                          {creatorLine(card)}
                        </button>
                      </div>
                    ) : (
                      creatorLine(card)
                    )}
                  </div>
                </div>
              </Link>

              {onRemove ? (
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
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default function UserHandlePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn, user } = useUser();
  const params = useParams<{ handle: string }>();

  const handle = String(params?.handle || "").trim().replace(/^@+/, "");
  const ownUsername = String(user?.username || "").trim().replace(/^@+/, "");
  const userId = String(user?.id || "").trim();
  const isOwnProfile =
    handle.toLowerCase() === "you" ||
    (isSignedIn && ownUsername && handle.toLowerCase() === ownUsername.toLowerCase());
  const resolvedHandle = isOwnProfile ? ownUsername || handle || "user" : handle || "user";
  const normalizedHandle = `@${resolvedHandle}`;
  const profileName = String(user?.firstName || user?.username || "Persona User").trim();
  const profileIdentity = ownUsername ? `@${ownUsername}` : normalizedHandle;

  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

  const initialTabValue = String(searchParams?.get("tab") || "").toLowerCase();
  const [activeTab, setActiveTab] = useState<TabKey>(isTabKey(initialTabValue) ? initialTabValue : "posted");

  useEffect(() => {
    const next = String(searchParams?.get("tab") || "").toLowerCase();
    if (!isTabKey(next)) return;
    setActiveTab(next);
  }, [searchParams]);

  const [followedTags, setFollowedTags] = useState<string[]>(() => readFollowedTags());

  const [collectedItems, setCollectedItems] = useState<CardItem[]>(() => readCardArray("persona:saved"));
  const [isLoadingCollected, setIsLoadingCollected] = useState(false);
  const [collectedError, setCollectedError] = useState<string | null>(null);
  const [postedItems, setPostedItems] = useState<CardItem[]>([]);
  const [isLoadingPosted, setIsLoadingPosted] = useState(false);
  const [postedError, setPostedError] = useState<string | null>(null);
  const [postDeleteError, setPostDeleteError] = useState<string | null>(null);
  const [cachedItems, setCachedItems] = useState<CardItem[]>(() => collectCachedCards());
  const [likedCardCache, setLikedCardCache] = useState<CardItem[]>(() => {
    if (typeof window === "undefined") return [];
    const likesRaw = safeParseJSON<unknown>(localStorage.getItem("persona:likes"), {});
    return parseLikes(likesRaw).cards;
  });
  const [likedIds, setLikedIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const likesRaw = safeParseJSON<unknown>(localStorage.getItem("persona:likes"), {});
    return parseLikes(likesRaw).ids;
  });

  useEffect(() => {
    if (!isOwnProfile || !isSignedIn || !userId) {
      setFollowedTags(readFollowedTags());
      return;
    }

    let cancelled = false;

    fetchFollowedTagsForUser(userId)
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
  }, [isOwnProfile, isSignedIn, userId]);

  useEffect(() => {
    if (!isOwnProfile || !isSignedIn) return;
    const likesRaw = safeParseJSON<unknown>(localStorage.getItem("persona:likes"), {});
    const parsedLikes = parseLikes(likesRaw);
    setLikedIds(parsedLikes.ids);
    setLikedCardCache(parsedLikes.cards);
    setCachedItems(collectCachedCards());
  }, [isOwnProfile, isSignedIn]);

  useEffect(() => {
    if (!isOwnProfile || !isSignedIn || !userId) {
      setCollectedItems(readCardArray("persona:saved"));
      setIsLoadingCollected(false);
      setCollectedError(null);
      return;
    }

    let cancelled = false;

    async function loadCollectedItems() {
      setIsLoadingCollected(true);
      setCollectedError(null);

      const { data, error } = await supabase
        .from("collections")
        .select("post_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setCollectedItems([]);
        setCollectedError("Could not load collected items.");
        setIsLoadingCollected(false);
        return;
      }

      const collectionRows = Array.isArray(data)
        ? data.map((item) => ({
          post_id: String((item as { post_id?: string }).post_id || "").trim(),
          created_at: String((item as { created_at?: string }).created_at || ""),
        })).filter((item) => item.post_id)
        : [];

      if (!collectionRows.length) {
        setCollectedItems([]);
        localStorage.setItem("persona:saved", JSON.stringify([]));
        setIsLoadingCollected(false);
        return;
      }

      const postIds = collectionRows.map((item) => item.post_id);
      const { data: postsData, error: postsError } = await supabase
        .from("posts")
        .select("*")
        .in("id", postIds);

      if (cancelled) return;

      if (postsError) {
        setCollectedItems([]);
        setCollectedError("Could not load collected items.");
        setIsLoadingCollected(false);
        return;
      }

      const postMap = new Map(
        (Array.isArray(postsData) ? postsData : [])
          .map((item) => normalizeCard(item))
          .filter((item): item is CardItem => Boolean(item))
          .map((item) => [item.id, item]),
      );

      const orderedPosts = collectionRows
        .map((row) => postMap.get(row.post_id))
        .filter((item): item is CardItem => Boolean(item));

      setCollectedItems(orderedPosts);
      localStorage.setItem("persona:saved", JSON.stringify(orderedPosts));
      setIsLoadingCollected(false);
    }

    loadCollectedItems().catch(() => {
      if (cancelled) return;
      setCollectedItems([]);
      setCollectedError("Could not load collected items.");
      setIsLoadingCollected(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, isSignedIn, userId]);

  useEffect(() => {
    if (!isOwnProfile || !isSignedIn || !userId) {
      setPostedItems([]);
      setIsLoadingPosted(false);
      setPostedError(null);
      return;
    }

    let cancelled = false;

    async function loadPostedItems() {
      setIsLoadingPosted(true);
      setPostedError(null);

      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("creator_id", userId)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setPostedItems([]);
        setPostedError("Could not load posts.");
        setIsLoadingPosted(false);
        return;
      }

      const nextItems = Array.isArray(data)
        ? data.map((item) => normalizeCard(item)).filter((item): item is CardItem => Boolean(item))
        : [];

      setPostedItems(nextItems);
      setIsLoadingPosted(false);
    }

    loadPostedItems().catch(() => {
      if (cancelled) return;
      setPostedItems([]);
      setPostedError("Could not load posts.");
      setIsLoadingPosted(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId]);

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

  const publicPosts = useMemo(() => {
    if (typeof window === "undefined") return [] as CardItem[];
    const uploads = readCardArray("persona:uploads");
    const feedCache = readCardArray("persona:feed_cache");
    const pool = [...uploads, ...feedCache];
    const seen = new Set<string>();
    const out: CardItem[] = [];

    for (const card of pool) {
      if (!card.id || seen.has(card.id)) continue;
      const cardHandle = cleanHandle(card.creator_handle).toLowerCase();
      if (cardHandle !== resolvedHandle.toLowerCase()) continue;
      seen.add(card.id);
      out.push(card);
    }

    return out;
  }, [resolvedHandle]);

  function setProfileTab(tab: TabKey) {
    setActiveTab(tab);
    if (!isOwnProfile) return;
    router.replace(`/u/${encodeURIComponent(resolvedHandle)}?tab=${tab}`);
  }

  async function saveUsername() {
    const next = String(usernameInput || "").trim().toLowerCase();
    if (!USERNAME_RE.test(next)) {
      setUsernameError("Username must be 3–20 chars, lowercase letters/numbers/underscore.");
      return;
    }
    if (!user) return;
    try {
      setIsSavingUsername(true);
      setUsernameError("");
      await user.update({ username: next });
      await user.reload();
      router.replace(`/u/${next}`);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save username.";
      setUsernameError(message);
    } finally {
      setIsSavingUsername(false);
    }
  }

  const removeCollected = async (card: CardItem) => {
    if (!isSignedIn || !userId) {
      setCollectedItems((prev) => {
        const next = prev.filter((item) => item.id !== card.id);
        localStorage.setItem("persona:saved", JSON.stringify(next));
        return next;
      });
      return;
    }

    const { error } = await supabase
      .from("collections")
      .delete()
      .eq("post_id", card.id)
      .eq("user_id", userId);

    if (error) {
      console.error("Supabase collection delete error:", error);
      return;
    }

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

  const removePosted = async (card: CardItem) => {
    const ok = window.confirm("Delete this post?");
    if (!ok) return;

    const id = card.id;

    if (!isSignedIn || !userId) {
      setPostDeleteError("Could not delete post.");
      return;
    }

    setPostDeleteError(null);

    const { error } = await supabase
      .from("posts")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Could not delete post", error);
      setPostDeleteError("Could not delete post.");
      return;
    }

    setPostedError(null);

    setPostedItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      localStorage.setItem("persona:uploads", JSON.stringify(next));
      return next;
    });

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
    <div className="min-h-screen bg-white text-black px-5 py-8">
      <div className="max-w-3xl mx-auto">
        <PersonaHeader showBack />

        {isOwnProfile && !isSignedIn ? (
          <div>
            <h1 className="text-2xl font-semibold mt-2">Profile</h1>
            <div className="mt-6 rounded-xl border border-gray-200 p-4">
              <div className="text-base font-medium">Sign in to Persona</div>
              <div className="mt-2 text-sm text-gray-600">Create a profile to:</div>
              <div className="mt-2 text-sm text-gray-700 leading-7">
                <div>• like posts</div>
                <div>• collect inspiration</div>
                <div>• post to the community</div>
                <div>• comment on posts</div>
              </div>
              <div className="mt-4 flex gap-2">
                <SignInButton mode="redirect" forceRedirectUrl="/u/you">
                  <button type="button" className="px-3 py-2 rounded-lg bg-black text-white text-sm">
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton mode="redirect" forceRedirectUrl="/u/you">
                  <button type="button" className="px-3 py-2 rounded-lg border border-gray-300 text-sm">
                    Create account
                  </button>
                </SignUpButton>
              </div>
            </div>
          </div>
        ) : isOwnProfile ? (
          <div>
            <h1 className="text-2xl font-semibold mt-2">Profile</h1>
            {ownUsername ? (
              <>
                <div className="mt-4 rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center gap-3">
                    {user?.imageUrl ? (
                      <img src={user.imageUrl} alt={profileName} className="h-20 w-20 rounded-full object-cover" />
                    ) : (
                      <div className="h-20 w-20 rounded-full bg-gray-200" />
                    )}
                    <div>
                      <div className="text-lg font-semibold">{profileIdentity}</div>
                      <div className="text-sm text-gray-600 mt-1">{profileName}</div>
                      <Link
                        href="/user-profile"
                        className="inline-block mt-2 text-xs text-gray-500 hover:text-gray-700 active:text-black"
                      >
                        Manage avatar
                      </Link>
                    </div>
                  </div>
                </div>

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

                <div className="mt-4">
                  <div className="text-sm font-medium text-gray-500 mb-2">Taste</div>
                  <div className="text-xs text-gray-500 mb-2">Following Tags</div>
                  {followedTags.length ? (
                    <div className="flex flex-wrap gap-2">
                      {followedTags.map((tag) => (
                        <Link
                          key={tag}
                          href={`/t/${encodeURIComponent(slugifyTag(tag))}`}
                          className="px-2.5 py-1 rounded-full text-xs border border-gray-300 text-gray-700 hover:text-black hover:border-gray-400"
                        >
                          {tag}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">No followed tags yet.</div>
                  )}
                </div>

                <div className="mt-5 border-b border-gray-200 pb-2">
                  <div className="flex items-center gap-3">
                    {[
                      { key: "posted" as TabKey, Icon: Grid3X3, label: "Posted" },
                      { key: "collected" as TabKey, Icon: Bookmark, label: "Collected" },
                      { key: "likes" as TabKey, Icon: Heart, label: "Likes" },
                    ].map(({ key, Icon, label }) => {
                      const active = activeTab === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setProfileTab(key)}
                          className={`h-9 w-9 rounded-lg border flex items-center justify-center transition ${
                            active
                              ? "bg-black text-white border-black"
                              : "bg-white text-gray-500 border-gray-300"
                          }`}
                          title={label}
                          aria-label={label}
                        >
                          <Icon size={17} strokeWidth={2} />
                          <span className="sr-only">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeTab === "posted" ? (
                  isLoadingPosted ? (
                    <div className="mt-4 text-sm text-gray-500">Loading posts...</div>
                  ) : postedError ? (
                    <div className="mt-4 text-sm text-red-600">{postedError}</div>
                  ) : (
                    <>
                      {postDeleteError ? (
                        <div className="mt-4 text-sm text-red-600">{postDeleteError}</div>
                      ) : null}
                      <GridPanel
                        emptyText="No posts yet."
                        items={postedItems}
                        onRemove={removePosted}
                        currentUserId={String(user?.id || "")}
                        currentUsername={user?.username || ""}
                        currentUserImage={user?.imageUrl || ""}
                      />
                    </>
                  )
                ) : null}

                {activeTab === "collected" ? (
                  isLoadingCollected ? (
                    <div className="mt-4 text-sm text-gray-500">Loading collected items...</div>
                  ) : collectedError ? (
                    <div className="mt-4 text-sm text-red-600">{collectedError}</div>
                  ) : (
                    <GridPanel
                      emptyText="No collected items yet."
                      items={collectedItems}
                      onRemove={removeCollected}
                      currentUserId={String(user?.id || "")}
                      currentUsername={user?.username || ""}
                      currentUserImage={user?.imageUrl || ""}
                    />
                  )
                ) : null}

                {activeTab === "likes" ? (
                  <GridPanel
                    emptyText="You haven't liked any items yet."
                    items={likedItems}
                    onRemove={removeLiked}
                    currentUserId={String(user?.id || "")}
                    currentUsername={user?.username || ""}
                    currentUserImage={user?.imageUrl || ""}
                  />
                ) : null}

                <div className="mt-6">
                  <SignOutButton redirectUrl="/">
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Log out
                    </button>
                  </SignOutButton>
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-xl border border-gray-200 p-4">
                <div className="text-base font-medium">Create your Persona handle</div>
                <div className="text-sm text-gray-600 mt-2">
                  Choose a public username. This will appear as your @handle.
                </div>
                <div className="mt-3">
                  <div className="flex items-center rounded-lg border border-gray-300 px-3 py-2">
                    <span className="text-sm text-gray-500 mr-1">@</span>
                    <input
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(String(e.target.value || "").toLowerCase())}
                      placeholder="username"
                      className="w-full text-sm outline-none"
                    />
                  </div>
                  {usernameError ? <div className="mt-2 text-xs text-red-600">{usernameError}</div> : null}
                </div>
                <button
                  type="button"
                  onClick={saveUsername}
                  disabled={isSavingUsername}
                  className={`mt-4 px-3 py-2 rounded-lg text-sm ${
                    isSavingUsername ? "bg-gray-200 text-gray-500" : "bg-black text-white"
                  }`}
                >
                  {isSavingUsername ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold mt-2">{normalizedHandle}</h1>
            <p className="text-sm text-gray-500 mt-1">{publicPosts.length} posts</p>
          </>
        )}

        {!isOwnProfile ? (
          publicPosts.length ? (
            <div className="grid grid-cols-2 gap-3 mt-5">
              {publicPosts.map((card) => (
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
          )
        ) : null}
      </div>
    </div>
  );
}
