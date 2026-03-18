"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import EmptyState from "@/components/EmptyState";
import {
  ensureEngagement,
  getEngagement,
  readEngagement,
  writeEngagement,
  type EngagementMap,
} from "@/lib/engagement";
import {
  fetchFollowedTagsForUser,
  isTagFollowed,
  readFollowedTags,
} from "@/lib/followedTags";
import {
  getRelatedTagsFromCards,
  normalizeTag as normalizeFollowedTag,
  prioritizeUploadTags,
  sanitizeContentTags,
  slugifyTag,
} from "@/lib/tags";
import {
  type CardWithId,
  dedupeCardsByIdNewestFirst,
  readStoredCards,
  writeStoredCards,
} from "@/lib/feedCache";
import { clearSignedInPersonaCache } from "@/lib/localCache";
import { supabase } from "@/lib/supabase";

type Card = {
  id: string;
  topic?: string;
  image_query?: string;
  image_url: string;
  caption_short: string;
  caption_long: string;
  tags: string[];
  attribution?: string;
  source?: "community" | "editorial";
  creator_name?: string;
  creator_handle?: string;
  creator_avatar?: string;
  creator_id?: string;
  likes_count?: number;
  comments_count?: number;
  collections_count?: number;
};

type StyleDNA = {
  vibe?: string;
  keywords?: string[];
  adjacent?: string[];
  one_liner?: string;
};

type StoredUploadRecord = CardWithId & Record<string, unknown>;

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function updateFeedCache(incoming: Card[], savedCards?: Card[]) {
  const uploads = readStoredCards<Card>("persona:uploads");
  const existing = readStoredCards<Card>("persona:feed_cache");
  const saved = Array.isArray(savedCards) ? savedCards : readJSON<Card[]>("persona:saved", []);
  const merged = [...incoming, ...uploads, ...saved, ...existing].filter(
    (card) =>
      card &&
      typeof card.id === "string" &&
      card.id.trim() &&
      typeof card.image_url === "string" &&
      card.image_url.trim() &&
      !card.image_url.includes("picsum.photos") &&
      card.source !== "editorial",
  );
  writeStoredCards("persona:feed_cache", dedupeCardsByIdNewestFirst(merged, 200));
}

function cleanHandle(handle?: string) {
  return String(handle || "").trim().replace(/^@+/, "");
}

function normalizeHandle(handle?: string) {
  return cleanHandle(handle).toLowerCase();
}

function fallbackLetter(handle?: string, name?: string) {
  const source = cleanHandle(handle) || String(name || "").trim();
  return source ? source.charAt(0).toUpperCase() : "U";
}

function getFeedPreview(text: string, max = 260) {
  const clean = String(text || "").trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, max);
  const lastSpace = sliced.lastIndexOf(" ");
  const truncated = lastSpace > 120 ? sliced.slice(0, lastSpace) : sliced;
  return `${truncated.trim()}...`;
}

type CoOccurrenceCard = {
  id: string;
  tags: string[];
};

function normalizeCoOccurrenceCard(value: unknown): CoOccurrenceCard | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const id = String(obj.id || "").trim();
  const topic = String(obj.topic || "").trim();
  const rawTags = sanitizeContentTags(Array.isArray(obj.tags)
    ? obj.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : []);
  const tags = rawTags.length ? rawTags : topic ? [topic] : [];
  if (!tags.length) return null;
  return {
    id: id || `${topic}-${tags[0]}`,
    tags,
  };
}

function normalizeSupabasePost(value: unknown): Card | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const id = String(obj.id || "").trim();
  if (!id) return null;

  const captionShort = String(obj.caption_short || "").trim();
  const captionLong = String(obj.caption_long || "").trim();
  const topic = String(obj.topic || captionShort || "Community Post").trim();
  const imageUrl = String(obj.image_url || "").trim();
  if (!imageUrl || imageUrl.includes("picsum.photos")) return null;
  const tags = sanitizeContentTags(
    Array.isArray(obj.tags)
      ? obj.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [],
    12,
  );

  return {
    id,
    topic: topic || "Community Post",
    image_url: imageUrl,
    caption_short: captionShort || topic || "Community Post",
    caption_long: captionLong || captionShort || topic || "",
    tags: tags.length ? tags : sanitizeContentTags([topic || "Community"], 12),
    creator_name: String(obj.creator_name || "").trim() || undefined,
    creator_handle: String(obj.creator_handle || "").trim() || undefined,
    creator_avatar: String(obj.creator_avatar || "").trim() || undefined,
    creator_id: String(obj.creator_id || "").trim() || undefined,
    likes_count: Math.max(0, Number(obj.likes_count) || 0),
    comments_count: Math.max(0, Number(obj.comments_count) || 0),
    collections_count: Math.max(0, Number(obj.collections_count) || 0),
    source: "community",
  };
}

function isRealFeedCard(card: Card | null | undefined): card is Card {
  if (!card || !card.id) return false;
  const imageUrl = String(card.image_url || "").trim();
  if (!imageUrl || imageUrl.includes("picsum.photos")) return false;
  if (card.source === "editorial") return false;
  return true;
}

function rankCommunityCards(cards: Card[], tastes: string[]) {
  const normalizedTasteSet = new Set(
    tastes.map((tag) => normalizeFollowedTag(tag)).filter(Boolean),
  );

  return [...cards].sort((a, b) => {
    const aMatches = (Array.isArray(a.tags) ? a.tags : []).reduce((count, tag) => (
      normalizedTasteSet.has(normalizeFollowedTag(tag)) ? count + 1 : count
    ), 0);
    const bMatches = (Array.isArray(b.tags) ? b.tags : []).reduce((count, tag) => (
      normalizedTasteSet.has(normalizeFollowedTag(tag)) ? count + 1 : count
    ), 0);

    if (aMatches !== bMatches) return bMatches - aMatches;
    return 0;
  });
}

async function fetchCommunityPostsFromSupabase(limit = 20): Promise<Card[]> {
  try {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Supabase posts fetch error:", error);
      return [];
    }

    if (!Array.isArray(data)) return [];
    return data
      .map((item) => normalizeSupabasePost(item))
      .filter((item): item is Card => item !== null);
  } catch (error) {
    console.error("Failed to fetch Supabase posts", error);
    return [];
  }
}

function countByPostId(rows: Array<{ post_id?: string | null }>) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const postId = String(row.post_id || "").trim();
    if (!postId) continue;
    counts[postId] = (counts[postId] || 0) + 1;
  }
  return counts;
}

export default function PersonaFeed() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dna, setDna] = useState<StyleDNA | null>(null);
  const [dnaOpen, setDnaOpen] = useState(false);
  const [seenTopics, setSeenTopics] = useState<string[]>([]);
  const [seenTags, setSeenTags] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, setEngagement] = useState<EngagementMap>({});
  const [followedTags, setFollowedTags] = useState<string[]>([]);
  const loadingMoreRef = useRef(false);
  const heartBurstTimerRef = useRef<number | null>(null);
  const cursorRef = useRef(0);
  const cardsRef = useRef<Card[]>([]);
  const seenTopicsRef = useRef<string[]>([]);
  const seenTagsRef = useRef<string[]>([]);

  function dedupeById(cardsList: Card[], max = 200): Card[] {
    return dedupeCardsByIdNewestFirst(cardsList, max);
  }

  const active = useMemo(() => cards[index], [cards, index]);
  const whyThis = useMemo(() => {
    if (!active) return "";
    const cardTags = Array.isArray(active.tags) ? active.tags : [];
    const tastes = readJSON<string[]>("persona:taste", []);
    const dnaKeywords = Array.isArray(dna?.keywords) ? dna.keywords : [];

    const findMatch = (pool: string[]) => {
      const poolSet = new Set(pool.map((x) => x.toLowerCase()));
      return cardTags.find((tag) => poolSet.has(tag.toLowerCase()));
    };

    const tasteMatch = findMatch(tastes);
    if (tasteMatch) return `Because you picked ${tasteMatch}`;

    const dnaMatch = findMatch(dnaKeywords);
    if (dnaMatch) return `Matches your Style DNA: ${dnaMatch}`;

    return "From your adjacent tastes";
  }, [active, dna]);
  const displayTags = useMemo(
    () => prioritizeUploadTags(sanitizeContentTags(Array.isArray(active?.tags) ? active.tags : [], 8), 8),
    [active],
  );
  const exploreNextTags = useMemo(() => {
    if (!active) return [];

    const primaryTag =
      (displayTags.find(Boolean) || "") ||
      String(active.topic || "").trim();
    const normalizedPrimary = normalizeFollowedTag(primaryTag);
    if (!normalizedPrimary) return [];

    const sourceBuckets = [
      ...(!isSignedIn ? readJSON<unknown[]>("persona:uploads", []) : []),
      ...(!isSignedIn ? readJSON<unknown[]>("persona:saved", []) : []),
      ...(!isSignedIn ? readJSON<unknown[]>("persona:collection", []) : []),
      ...(!isSignedIn ? readJSON<unknown[]>("persona:feed_cache", []) : []),
      ...cards,
    ];

    const parsedCards = sourceBuckets
      .map((item) => normalizeCoOccurrenceCard(item))
      .filter((item): item is CoOccurrenceCard => Boolean(item));

    const seen = new Set<string>();
    const deduped: CoOccurrenceCard[] = [];
    for (const card of parsedCards) {
      if (!card.id || seen.has(card.id)) continue;
      seen.add(card.id);
      deduped.push(card);
      if (deduped.length >= 400) break;
    }

    const matching = deduped.filter((card) =>
      card.tags.some((tag) => normalizeFollowedTag(tag) === normalizedPrimary),
    );
    if (!matching.length) return [];

    return getRelatedTagsFromCards(matching, primaryTag, 2);
  }, [active, cards, displayTags, isSignedIn]);
  const feedPreviewText = useMemo(
    () => getFeedPreview(String(active?.caption_long || ""), 260),
    [active],
  );

  useEffect(() => {
    setEngagement(readEngagement());
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      clearSignedInPersonaCache();
    }
  }, [isSignedIn, user?.id]);

  useEffect(() => {
    function refreshEngagementFromStorage() {
      setEngagement(readEngagement());
      if (!isSignedIn || !user?.id) {
        setFollowedTags(readFollowedTags());
      }
    }

    window.addEventListener("focus", refreshEngagementFromStorage);
    document.addEventListener("visibilitychange", refreshEngagementFromStorage);
    return () => {
      window.removeEventListener("focus", refreshEngagementFromStorage);
      document.removeEventListener("visibilitychange", refreshEngagementFromStorage);
    };
  }, [isSignedIn, user?.id]);

  useEffect(() => {
    if (!isSignedIn || !user?.id) {
      setFollowedTags(readFollowedTags());
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

  useEffect(() => {
    let cancelled = false;

    async function loadSavedState() {
      if (!isSignedIn || !user?.id) {
        const savedAll = readJSON<Card[]>("persona:saved", []);
        setSavedIds(savedAll.map((card) => card.id));
        return;
      }

      const { data, error } = await supabase
        .from("collections")
        .select("post_id")
        .eq("user_id", user.id);

      if (cancelled) return;

      if (error) {
        console.error("Supabase collections fetch error:", error);
        setSavedIds([]);
        return;
      }

      const ids = Array.isArray(data)
        ? data.map((item) => String((item as { post_id?: string }).post_id || "").trim()).filter(Boolean)
        : [];
      setSavedIds(ids);
    }

    loadSavedState().catch((error) => {
      if (cancelled) return;
      console.error("Failed to fetch Supabase collections", error);
      setSavedIds([]);
    });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, user?.id]);

  useEffect(() => {
    if (!active?.id) {
      setIsLiked(false);
      return;
    }
    const ensured = ensureEngagement(active.id);
    setEngagement((prev) => {
      if (prev[active.id]) return prev;
      return { ...prev, [active.id]: ensured };
    });
  }, [active]);

  useEffect(() => {
    let cancelled = false;

    async function loadLikedState() {
      if (!active?.id || !isSignedIn || !user?.id) {
        setIsLiked(false);
        return;
      }

      const { data, error } = await supabase
        .from("likes")
        .select("id")
        .eq("post_id", active.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Supabase like fetch error:", error);
        setIsLiked(false);
        return;
      }

      setIsLiked(Boolean(data?.id));
    }

    loadLikedState().catch((error) => {
      if (cancelled) return;
      console.error("Failed to fetch Supabase like", error);
      setIsLiked(false);
    });

    return () => {
      cancelled = true;
    };
  }, [active?.id, isSignedIn, user?.id]);

  useEffect(() => {
    return () => {
      if (heartBurstTimerRef.current) {
        window.clearTimeout(heartBurstTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  function updateCardCounts(cardId: string, updates: Partial<Pick<Card, "likes_count" | "comments_count" | "collections_count">>) {
    setCards((prev) => prev.map((card) => (
      card.id === cardId
        ? { ...card, ...updates }
        : card
    )));
  }

  async function hydrateCardCounts(posts: Card[]) {
    const postIds = Array.from(new Set(
      posts.map((post) => String(post.id || "").trim()).filter(Boolean),
    ));
    if (!postIds.length) return;
    const postIdSet = new Set(postIds);

    try {
      const [
        { data: likes, error: likesError },
        { data: comments, error: commentsError },
        { data: collections, error: collectionsError },
      ] = await Promise.all([
        supabase
          .from("likes")
          .select("post_id")
          .in("post_id", postIds),
        supabase
          .from("comments")
          .select("post_id")
          .in("post_id", postIds),
        supabase
          .from("collections")
          .select("post_id")
          .in("post_id", postIds),
      ]);

      if (likesError) {
        console.error("Supabase likes batch fetch error:", likesError);
      }
      if (commentsError) {
        console.error("Supabase comments batch fetch error:", commentsError);
      }
      if (collectionsError) {
        console.error("Supabase collections batch fetch error:", collectionsError);
      }

      const likeCounts = countByPostId(Array.isArray(likes) ? likes : []);
      const commentCounts = countByPostId(Array.isArray(comments) ? comments : []);
      const collectionCounts = countByPostId(Array.isArray(collections) ? collections : []);

      setCards((prev) => prev.map((card) => {
        if (!postIdSet.has(card.id)) return card;
        return {
          ...card,
          likes_count: likeCounts[card.id] ?? 0,
          comments_count: commentCounts[card.id] ?? 0,
          collections_count: collectionCounts[card.id] ?? 0,
        };
      }));
    } catch (error) {
      console.error("Failed to hydrate feed counts", error);
    }
  }

  function isOwnedByCurrentUser(card?: Card) {
    if (!card || !user) return false;
    const creatorId = String(card.creator_id || "").trim();
    const creatorHandle = normalizeHandle(card.creator_handle);
    const username = normalizeHandle(user.username || "");
    if (creatorId && creatorId === user.id) return true;
    if (creatorHandle && username && creatorHandle === username) return true;
    return false;
  }

  function resolveCreatorAvatar(card?: Card) {
    if (!card) return "";
    if (isOwnedByCurrentUser(card)) {
      return String(user?.imageUrl || "").trim();
    }
    return String(card.creator_avatar || "").trim();
  }

  useEffect(() => {
    if (isSignedIn) return;
    if (!user) return;
    const avatar = String(user.imageUrl || "").trim();
    if (!avatar) return;
    const username = normalizeHandle(user.username || "");
    const userId = String(user.id || "").trim();
    if (!username && !userId) return;

    try {
      const uploadsParsed = readStoredCards<StoredUploadRecord>("persona:uploads");
      if (!Array.isArray(uploadsParsed)) return;

      let changed = false;
      const repaired: CardWithId[] = uploadsParsed.map((entry) => {
        if (!entry || typeof entry !== "object") return entry;
        const obj = entry as Record<string, unknown>;
        const creatorId = String(obj.creator_id || "").trim();
        const creatorHandle = normalizeHandle(String(obj.creator_handle || ""));
        const isMine =
          (creatorId && userId && creatorId === userId) ||
          (creatorHandle && username && creatorHandle === username);
        if (!isMine) return entry;

        const next: Record<string, unknown> = { ...obj };
        if (String(obj.creator_avatar || "").trim() !== avatar) {
          next.creator_avatar = avatar;
          changed = true;
        }
        if (!creatorId && userId) {
          next.creator_id = userId;
          changed = true;
        }
        return next;
      });

      if (changed) {
        writeStoredCards("persona:uploads", repaired);
      }
    } catch {
      // no-op
    }
  }, [isSignedIn, user]);

  function topicOf(card: Card) {
    const fromTag = card.tags?.[0]?.trim();
    if (fromTag) return fromTag;
    const firstWord = card.caption_short?.trim().split(/\s+/)[0]?.replace(/[^\w'-]/g, "");
    return firstWord || "Style";
  }

  function addSeenFromCards(cardsBatch: Card[]) {
    const topics = cardsBatch.map(topicOf).filter(Boolean);
    const tags = cardsBatch
      .flatMap((c) => (Array.isArray(c.tags) ? c.tags : []))
      .map((tag) => tag.trim())
      .filter(Boolean);

    const nextTopics = Array.from(new Set([...seenTopicsRef.current, ...topics])).slice(-120);
    const nextTags = Array.from(new Set([...seenTagsRef.current, ...tags, ...topics])).slice(-250);

    seenTopicsRef.current = nextTopics;
    seenTagsRef.current = nextTags;
    setSeenTopics(nextTopics);
    setSeenTags(nextTags);
  }

  function normalizeUploadCard(raw: unknown): Card | null {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Card;
    if (
      typeof obj.id !== "string" ||
      typeof obj.image_url !== "string" ||
      typeof obj.caption_short !== "string" ||
      !Array.isArray(obj.tags)
    ) {
      return null;
    }
    if (!obj.image_url.trim() || obj.image_url.includes("picsum.photos")) return null;
    // Keep community upload objects exactly as stored in localStorage.
    return obj;
  }

  function selectUploadsForFeed(
    tastes: string[],
    styleKeywords: string[],
  ): Card[] {
    if (isSignedIn) return [];
    let uploads: unknown[] = [];
    try {
      uploads = readStoredCards("persona:uploads");
    } catch {
      uploads = [];
    }
    if (!Array.isArray(uploads) || !uploads.length) return [];

    const relevancePool = new Set(
      [...tastes, ...styleKeywords].map((x) => String(x).toLowerCase().trim()).filter(Boolean),
    );

    const normalized = uploads
      .map((item) => normalizeUploadCard(item))
      .filter((item): item is Card => Boolean(item));
    if (!normalized.length) return [];

    const newestUpload = normalized.length ? [normalized[0]] : [];
    const matchingUploads = normalized.filter((card) =>
      card.tags?.some((tag) => relevancePool.has(String(tag).toLowerCase().trim())),
    );

    const uploadsWithPriority = [...newestUpload, ...matchingUploads.slice(0, 1)];
    const seen = new Set<string>();
    return uploadsWithPriority.filter((card) => {
      const key = String(card.id || "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function fetchBatch(
    nextCursor: number,
    mode: "replace" | "append",
    savedAll?: Card[],
    options?: { limit?: number; communityPosts?: Card[] },
  ) {
    const storedTasteTags = readJSON<string[]>("persona:taste", []);
    const followed = isSignedIn && user?.id ? followedTags : readFollowedTags();
    const tastes = Array.from(
      new Map(
        [...storedTasteTags, ...followed]
          .map((tag) => String(tag || "").trim())
          .filter(Boolean)
          .map((tag) => [normalizeFollowedTag(tag), tag]),
      ).values(),
    );
    const savedSource = isSignedIn
      ? cards.filter((card) => savedIds.includes(card.id))
      : (savedAll ?? readJSON<Card[]>("persona:saved", []));
    const batchLimit = Math.max(1, Math.min(Number(options?.limit || (mode === "replace" ? 5 : 12)), 12));
    const uploadCards = selectUploadsForFeed(tastes, []);
    const cachedRealCards = isSignedIn
      ? []
      : readStoredCards<Card>("persona:feed_cache").filter(isRealFeedCard);
    const communityPosts = Array.isArray(options?.communityPosts)
      ? options.communityPosts.filter(isRealFeedCard)
      : (await fetchCommunityPostsFromSupabase(60)).filter(isRealFeedCard);
    const rankedCommunityPosts = rankCommunityCards(communityPosts, tastes);
    const realPool = dedupeById(
      [...rankedCommunityPosts, ...uploadCards, ...cachedRealCards].filter(isRealFeedCard),
      200,
    );

    if (!isSignedIn) {
      updateFeedCache(realPool, savedSource);
    }
    setLoadError(null);

    if (mode === "replace") {
      const replaceCards = realPool.slice(0, batchLimit);
      setCards(replaceCards);
      addSeenFromCards(replaceCards);
      setIndex(0);
      setExpanded(false);
      cursorRef.current = 0;
      setCursor(0);
      void hydrateCardCounts(replaceCards);
      return;
    }

    const start = cardsRef.current.length;
    const nextCards = realPool.slice(start, start + batchLimit);
    const existingIds = new Set(cardsRef.current.map((c) => c.id));
    const deduped = nextCards.filter((c) => !existingIds.has(c.id));
    setCards((prev) => [...prev, ...deduped]);
    addSeenFromCards(deduped);
    cursorRef.current = nextCursor;
    setCursor(nextCursor);
    void hydrateCardCounts(deduped);
  }

  async function loadMoreIfNeeded(nextIndex: number) {
    if (nextIndex < cards.length - 3 || isLoadingMore || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    const nextCursor = Math.max(cursorRef.current, cursor) + 1;

    try {
      await fetchBatch(nextCursor, "append");
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }

  function goTo(next: number) {
    if (next < 0) return;
    loadMoreIfNeeded(next);
    if (next >= cards.length) return;
    setIndex(next);
    setExpanded(false);
  }

  useEffect(() => {
    // Initial load: generate feed using taste + existing saves
    async function loadInitial() {
      setIsLoading(true);
      const savedAll = isSignedIn ? cards.filter((card) => savedIds.includes(card.id)) : readJSON<Card[]>("persona:saved", []);
      setSavedIds(savedAll.map((c) => c.id));

      const communityPosts = await fetchCommunityPostsFromSupabase(20);

      const uploads = isSignedIn ? [] : readStoredCards<Card>("persona:uploads");
      const cached = isSignedIn ? [] : readStoredCards<Card>("persona:feed_cache");
      const fastCards = dedupeById([...communityPosts, ...uploads, ...cached], 5);
      if (fastCards.length) {
        setCards(fastCards);
        addSeenFromCards(fastCards);
        setIndex(0);
        setExpanded(false);
        setIsLoading(false);
      }

      try {
        await fetchBatch(0, "replace", savedAll, { limit: 5, communityPosts });
      } catch (error) {
        console.error("Failed to load real feed", error);
        setLoadError("Could not load Persona feed. Please retry.");
      } finally {
        setIsLoading(false);
      }
    }
    loadInitial().catch(() => {
      // Error state is handled in fetchBatch.
    });

    // Load cached DNA quickly (optional)
    const cachedDNA = readJSON<StyleDNA | null>("persona:style_dna", null);
    if (cachedDNA?.one_liner) setDna(cachedDNA);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, user?.id]);

  async function retryLoad() {
    setIsLoading(true);
    const savedAll = isSignedIn ? cards.filter((card) => savedIds.includes(card.id)) : readJSON<Card[]>("persona:saved", []);
    setSavedIds(savedAll.map((c) => c.id));
    const communityPosts = await fetchCommunityPostsFromSupabase(20);

    try {
      await fetchBatch(0, "replace", savedAll, { communityPosts });
    } catch (error) {
      console.error("Failed to reload real feed", error);
      setLoadError("Could not load Persona feed. Please retry.");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveCard(card: Card) {
    if (!isSignedIn) {
      const redirectUrl = typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/";
      router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    if (!user?.id) return;

    const savedAll = isSignedIn
      ? cards.filter((entry) => savedIds.includes(entry.id))
      : readJSON<Card[]>("persona:saved", []);
    const exists = savedIds.includes(card.id);
    const nextSaved = exists
      ? savedAll.filter((c) => c.id !== card.id)
      : [card, ...savedAll.filter((c) => c.id !== card.id)];

    const request = exists
      ? supabase
        .from("collections")
        .delete()
        .eq("post_id", card.id)
        .eq("user_id", user.id)
      : supabase
        .from("collections")
        .insert({
          id: crypto.randomUUID(),
          post_id: card.id,
          user_id: user.id,
        });

    const { error: collectionError } = await request;

    if (collectionError) {
      console.error("Supabase collection toggle error:", collectionError);
      return;
    }

    if (!isSignedIn) {
      writeJSON("persona:saved", nextSaved);
    }
    setSavedIds(nextSaved.map((c) => c.id));
    const nextCollectionsCount = exists
      ? Math.max(0, Number(card.collections_count ?? 0) - 1)
      : Number(card.collections_count ?? 0) + 1;
    updateCardCounts(card.id, { collections_count: nextCollectionsCount });
    setEngagement((prevEngagement) => {
      const current = getEngagement(card.id, prevEngagement);
      const nextCounts = {
        ...current,
        collections_count: exists
          ? Math.max(0, current.collections_count - 1)
          : current.collections_count + 1,
      };
      const nextEngagement = { ...prevEngagement, [card.id]: nextCounts };
      writeEngagement(nextEngagement);
      return nextEngagement;
    });

    const { error } = await supabase
      .from("posts")
      .update({
        collections_count: nextCollectionsCount,
      })
      .eq("id", card.id);

    if (error) {
      console.error("Supabase collection counter update error:", error);
    }

    // Small toast instead of alert
    setToast(exists ? "Removed from collection" : "Collected");
    window.setTimeout(() => setToast(null), 900);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 900);

    // Re-generate immediately (the “learning” loop)
    setIsUpdating(true);
    try {
      await fetchBatch(0, "replace", nextSaved);
    } finally {
      setIsUpdating(false);
    }
  }

  function showActionToast(message: string) {
    setActionToast(message);
    window.setTimeout(() => setActionToast(null), 1500);
  }

  async function toggleLike(card: Card) {
    if (!isSignedIn) {
      const redirectUrl = typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/";
      router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    if (!user?.id) return;

    const wasLiked = isLiked;
    const request = wasLiked
      ? supabase
        .from("likes")
        .delete()
        .eq("post_id", card.id)
        .eq("user_id", user.id)
      : supabase
        .from("likes")
        .insert({
          id: crypto.randomUUID(),
          post_id: card.id,
          user_id: user.id,
        });

    const { error } = await request;

    if (error) {
      console.error("Supabase like toggle error:", error);
      return;
    }

    setIsLiked(!wasLiked);
    const nextLikesCount = wasLiked
      ? Math.max(0, Number(card.likes_count ?? 0) - 1)
      : Number(card.likes_count ?? 0) + 1;
    updateCardCounts(card.id, { likes_count: nextLikesCount });
    setEngagement((prevEngagement) => {
      const current = getEngagement(card.id, prevEngagement);
      const nextCounts = {
        ...current,
        likes_count: wasLiked
          ? Math.max(0, current.likes_count - 1)
          : current.likes_count + 1,
      };
      const nextEngagement = { ...prevEngagement, [card.id]: nextCounts };
      writeEngagement(nextEngagement);
      return nextEngagement;
    });

    const { error: counterError } = await supabase
      .from("posts")
      .update({
        likes_count: nextLikesCount,
      })
      .eq("id", card.id);

    if (counterError) {
      console.error("Supabase like counter update error:", counterError);
    }
  }

  async function likeCard(card: Card) {
    if (!isSignedIn) {
      const redirectUrl = typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/";
      router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    if (!user?.id || isLiked) return;

    const { error } = await supabase
      .from("likes")
      .insert({
        id: crypto.randomUUID(),
        post_id: card.id,
        user_id: user.id,
      });

    if (error) {
      console.error("Supabase like insert error:", error);
      return;
    }

    setIsLiked(true);
    const nextLikesCount = Number(card.likes_count ?? 0) + 1;
    updateCardCounts(card.id, { likes_count: nextLikesCount });
    setEngagement((prevEngagement) => {
      const current = getEngagement(card.id, prevEngagement);
      const nextCounts = {
        ...current,
        likes_count: current.likes_count + 1,
      };
      const nextEngagement = { ...prevEngagement, [card.id]: nextCounts };
      writeEngagement(nextEngagement);
      return nextEngagement;
    });

    const { error: counterError } = await supabase
      .from("posts")
      .update({
        likes_count: nextLikesCount,
      })
      .eq("id", card.id);

    if (counterError) {
      console.error("Supabase like counter update error:", counterError);
    }
  }

  function handleImageDoubleTap(card: Card) {
    if (!isSignedIn) {
      const redirectUrl = typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/";
      router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    if (!isLiked) {
      likeCard(card);
    }
    setShowHeartBurst(true);
    if (heartBurstTimerRef.current) {
      window.clearTimeout(heartBurstTimerRef.current);
    }
    heartBurstTimerRef.current = window.setTimeout(() => {
      setShowHeartBurst(false);
      heartBurstTimerRef.current = null;
    }, 700);
  }

  function creatorHrefFromHandle(handle?: string) {
    const raw = String(handle || "").trim();
    if (!raw) return "";
    return `/u/${raw.replace(/^@+/, "")}`;
  }

  async function handleShare() {
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Persona",
          text: active.caption_short,
          url: shareUrl,
        });
      } catch {
        // Ignore cancellation/errors to keep interaction non-blocking.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      showActionToast("Link copied");
    } catch {
      showActionToast("Unable to copy link");
    }
  }

  if (!cards.length) {
    if (loadError) {
      return (
        <div className="min-h-[70svh] px-6 py-6 flex flex-col items-center justify-center text-gray-600 gap-3 text-center">
          <div>{loadError}</div>
          <button
            onClick={retryLoad}
            className="px-4 py-2 rounded bg-black text-white text-sm"
          >
            Retry
          </button>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="min-h-[70svh] w-screen bg-white px-4 py-4">
          <div className="mx-auto w-full max-w-md">
            <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white animate-pulse">
              <div className="w-full aspect-[4/5] bg-gray-100" />
              <div className="p-4">
                <div className="h-3 w-2/3 rounded bg-gray-100" />
                <div className="mt-3 h-4 w-full rounded bg-gray-100" />
                <div className="mt-2 h-4 w-4/5 rounded bg-gray-100" />
                <div className="mt-5 flex items-center justify-between">
                  <div className="h-8 w-24 rounded bg-gray-100" />
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-gray-100" />
                    <div className="h-6 w-6 rounded-full bg-gray-100" />
                    <div className="h-6 w-6 rounded-full bg-gray-100" />
                  </div>
                </div>
                <div className="mt-3 h-3 w-1/2 rounded bg-gray-100" />
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-[70svh] px-6 py-10 flex items-center justify-center">
        <div className="w-full max-w-sm">
          <EmptyState
            title="No posts yet for your taste graph."
            body="Follow tags or post your first find to start shaping your feed."
            secondaryAction={{ label: "Explore tags", href: "/search", variant: "secondary" }}
            primaryAction={{
              label: "Post",
              href: isSignedIn
                ? "/upload"
                : `/sign-in?redirect_url=${encodeURIComponent("/")}`,
              variant: "primary",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen min-h-[100svh] bg-white text-black">
      {/* Toast */}
      {toast && (
        <div className="fixed top-14 right-4 z-50">
          <div className="rounded-full bg-black text-white text-xs px-3 py-2 shadow">
            {toast}
          </div>
        </div>
      )}

      {/* Style DNA (temporarily hidden) */}
      {false && dna && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 w-[92vw] max-w-xs">
          <motion.div
            layout
            transition={{ duration: 0.24, ease: "easeInOut" }}
            onClick={() => setDnaOpen((v) => !v)}
            className="rounded-xl border bg-white/90 backdrop-blur px-3 py-2 shadow-sm cursor-pointer"
            role="button"
            aria-expanded={dnaOpen}
            aria-label="Toggle Style DNA"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-gray-500">Your Style DNA</div>
                <div className="text-xs text-gray-700 truncate">
                  {dna?.one_liner || (dna?.keywords?.slice(0, 3).join(" • ") || "Style insights")}
                </div>
              </div>
              <div className="text-xs text-gray-500 shrink-0">{dnaOpen ? "▲" : "▼"}</div>
            </div>

            <AnimatePresence initial={false}>
              {dnaOpen ? (
                <motion.div
                  key="dna-expanded"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.24, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="pt-2">
                    <div className="text-sm font-medium text-black">{dna?.one_liner}</div>
                    {dna?.keywords?.length ? (
                      <div className="mt-1 text-xs text-gray-600">
                        {dna?.keywords?.slice(0, 8).join(" • ")}
                      </div>
                    ) : null}
                    {dna?.adjacent?.length ? (
                      <div className="mt-1 text-xs text-gray-500">
                        Adjacent: {dna?.adjacent?.slice(0, 5).join(" • ")}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      <main className="mx-auto w-full max-w-md px-4">
        <div>
          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              className="w-full"
              style={{ touchAction: "none" }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (expanded) return;
                if (info.offset.y < -100) goTo(index + 1);
                if (info.offset.y > 100) goTo(index - 1);
              }}
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex flex-col">
                <div className="rounded-2xl shadow-xl bg-white h-auto overflow-visible md:h-full flex flex-col">
                <div
                  className="relative w-full aspect-[4/3.8] md:aspect-[4/5] overflow-hidden rounded-t-2xl bg-gray-100"
                  onDoubleClick={() => handleImageDoubleTap(active)}
                >
                  <img
                    src={active.image_url}
                    className="object-cover object-center w-full h-full"
                    alt=""
                  />
                  <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                  <AnimatePresence>
                    {showHeartBurst ? (
                      <motion.div
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 1.2, opacity: 0 }}
                        transition={{ duration: 0.35 }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      >
                        <div className="text-white text-6xl drop-shadow-lg select-none">♥</div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                <div className="p-4 overflow-visible">
                  {displayTags.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {displayTags.slice(0, 5).map((tag) => {
                        const followed = isTagFollowed(tag, followedTags);
                        return (
                          <button
                            key={`${active.id}-${tag}`}
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/t/${encodeURIComponent(slugifyTag(tag))}`);
                            }}
                            className={`px-2 py-1 rounded-full text-[11px] border transition ${
                              followed
                                ? "bg-black text-white border-black"
                                : "bg-white text-gray-600 border-gray-300"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="mt-2 text-base font-medium">{active.caption_short}</div>
                  <div className="mt-2 flex items-center justify-between" onPointerDown={(e) => e.stopPropagation()}>
                    {!expanded ? (
                      <button onClick={() => setExpanded(true)} className="text-sm underline">
                        Read more
                      </button>
                    ) : (
                      <button
                        onClick={() => setExpanded(false)}
                        className="text-sm underline text-gray-700"
                      >
                        Show less
                      </button>
                    )}
                    <Link
                      href={`/post/${encodeURIComponent(active.id)}`}
                      className="text-sm underline text-gray-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open post
                    </Link>
                  </div>
                  {expanded ? (
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className="mt-2 text-sm text-gray-700 leading-relaxed"
                    >
                      {feedPreviewText}
                    </div>
                  ) : null}
                  <div className="mt-1 text-xs text-gray-500" onPointerDown={(e) => e.stopPropagation()}>
                    {active.source === "community" ? (
                      <div className="flex items-center gap-2">
                        {resolveCreatorAvatar(active) ? (
                          <img
                            src={resolveCreatorAvatar(active)}
                            alt={active.creator_name || active.creator_handle || "Creator avatar"}
                            className="w-7 h-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-[11px] font-medium">
                            {fallbackLetter(active.creator_handle, active.creator_name)}
                          </div>
                        )}
                        {active.creator_handle ? (
                          <Link
                            href={creatorHrefFromHandle(active.creator_handle)}
                            className="hover:text-gray-700 active:text-black transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            by @{cleanHandle(active.creator_handle)}
                          </Link>
                        ) : (
                          <span>by {active.creator_name || "@you"}</span>
                        )}
                      </div>
                    ) : active.creator_handle ? (
                      <Link
                        href={creatorHrefFromHandle(active.creator_handle)}
                        className="hover:text-gray-700 active:text-black transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        by @{cleanHandle(active.creator_handle)}
                      </Link>
                    ) : (
                      "Persona Editorial"
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{whyThis}</div>
                  {exploreNextTags.length ? (
                    <>
                      <div
                        className="mt-1 text-[11px] text-gray-500 md:hidden"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <span>Next taste:</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/t/${encodeURIComponent(slugifyTag(exploreNextTags[0]))}`);
                          }}
                          className="ml-1 text-gray-700 underline"
                        >
                          {exploreNextTags[0]} →
                        </button>
                      </div>
                      <div className="mt-2 hidden md:block">
                        <div className="text-[11px] text-gray-500 uppercase tracking-wide">
                          Explore next
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {exploreNextTags.map((tag) => {
                            const followed = isTagFollowed(tag, followedTags);
                            return (
                              <button
                                key={`explore-next-${active.id}-${tag}`}
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/t/${encodeURIComponent(slugifyTag(tag))}`);
                                }}
                                className={`rounded-full border px-3 py-1 text-xs ${
                                  followed
                                    ? "bg-black text-white border-black"
                                    : "bg-white text-gray-700 border-gray-300"
                                }`}
                              >
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : null}

                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    className="mt-3 flex items-center gap-4 text-gray-600"
                  >
                    <button
                      onClick={() => toggleLike(active)}
                      className={`flex items-center gap-1 hover:text-black active:scale-95 transition ${
                        isLiked ? "text-black" : ""
                      }`}
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
                      <span className="text-xs text-gray-600">{active?.likes_count ?? 0}</span>
                    </button>
                    <button
                      onClick={() => {
                        router.push(`/post/${encodeURIComponent(active.id)}`);
                      }}
                      className="flex items-center gap-1 hover:text-black active:scale-95 transition"
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
                      <span className="text-xs text-gray-600">{active?.comments_count ?? 0}</span>
                    </button>
                    <button
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
                    <button
                      onClick={() => saveCard(active)}
                      disabled={isUpdating}
                      className={`flex items-center gap-1 hover:text-black active:scale-95 transition ${
                        savedIds.includes(active.id) ? "text-black" : ""
                      }`}
                      aria-label={savedIds.includes(active.id) ? "Remove from collection" : "Save to collection"}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill={savedIds.includes(active.id) ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
                      </svg>
                      <span className="text-xs text-gray-600">{active?.collections_count ?? 0}</span>
                    </button>
                  </div>

                  {actionToast ? (
                    <div className="mt-2 text-xs text-gray-500">{actionToast}</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 text-center text-xs text-gray-400 hidden md:block">
                Drag up/down to browse • Tap “Read more”
              </div>
              <div className="mt-1 text-center text-[10px] text-gray-400 hidden md:block">
                {active?.source || "community"} • {String(active?.image_url || "").slice(0, 60)}
              </div>
              {isLoadingMore ? (
                <div className="mt-2 text-center text-xs text-gray-500">Loading more…</div>
              ) : null}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
