"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
};

type StyleDNA = {
  vibe?: string;
  keywords?: string[];
  adjacent?: string[];
  one_liner?: string;
};

type SavedSignal = {
  caption_short?: string;
  tags?: string[];
};

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
  const existing = readJSON<Card[]>("persona:feed_cache", []);
  const saved = Array.isArray(savedCards) ? savedCards : readJSON<Card[]>("persona:saved", []);
  const merged = [...incoming, ...saved, ...existing].filter(
    (card) => card && typeof card.id === "string" && card.id.trim(),
  );

  const seen = new Set<string>();
  const next: Card[] = [];
  for (const card of merged) {
    const key = String(card.id || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(card);
    if (next.length >= 200) break;
  }

  writeJSON("persona:feed_cache", next);
}

function deriveImageQuery(topic: string, tags: string[]) {
  const tagText = tags.join(" ").toLowerCase();
  const topicText = topic.toLowerCase();
  const has = (value: string) => tagText.includes(value) || topicText.includes(value);

  if (has("gucci")) {
    if (topicText.includes("bag")) return "gucci bag marmont";
    if (topicText.includes("sneaker") || tagText.includes("sneaker")) return "gucci sneakers";
    return "gucci fashion";
  }
  if (has("rolex")) return "rolex gmt watch close up";
  if (has("porsche")) return "porsche 911 sports car";
  if (has("eames")) return "eames lounge chair interior";
  if (has("levi's") || has("levis") || has("denim")) return "vintage levis denim jeans";

  return `${(tags || []).slice(0, 3).join(" ")} editorial photo`.trim();
}

function img(topic: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(topic)}/1200/800`;
}

export default function PersonaFeed() {
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
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [isLiked, setIsLiked] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const cursorRef = useRef(0);
  const cardsRef = useRef<Card[]>([]);
  const seenTopicsRef = useRef<string[]>([]);
  const seenTagsRef = useRef<string[]>([]);

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

  useEffect(() => {
    const storedLikes = readJSON<Record<string, boolean>>("persona:likes", {});
    setLikes(storedLikes);
  }, []);

  useEffect(() => {
    if (!active?.id) {
      setIsLiked(false);
      return;
    }
    setIsLiked(Boolean(likes[active.id]));
  }, [active, likes]);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

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
    // Keep community upload objects exactly as stored in localStorage.
    return obj;
  }

  function selectUploadsForFeed(
    tastes: string[],
    styleKeywords: string[],
  ): Card[] {
    let uploads: unknown[] = [];
    try {
      uploads = JSON.parse(localStorage.getItem("persona:uploads") || "[]");
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

    const uploadsWithPriority = [...newestUpload, ...matchingUploads.slice(0, 2)];
    const seen = new Set<string>();
    return uploadsWithPriority.filter((card) => {
      const key = String(card.id || "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function fetchBatch(nextCursor: number, mode: "replace" | "append", savedAll?: Card[]) {
    const tastes = readJSON<string[]>("persona:taste", []);
    const savedSource = savedAll ?? readJSON<Card[]>("persona:saved", []);
    const saved: SavedSignal[] = Array.isArray(savedSource)
      ? savedSource.slice(0, 30).map((c) => ({ caption_short: c.caption_short, tags: c.tags }))
      : [];
    const avoid_topics = seenTopics.slice(-80);
    const savedTags = savedSource
      .flatMap((c) => (Array.isArray(c.tags) ? c.tags : []))
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(-80);
    const avoid_tags = Array.from(new Set([...seenTagsRef.current.slice(-160), ...savedTags])).slice(
      -160,
    );

    let data: { cards?: Card[]; style_dna?: StyleDNA };
    try {
      const res = await fetch("/api/generate-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tastes, saved, cursor: nextCursor, avoid_topics, avoid_tags }),
      });
      data = (await res.json()) as { cards?: Card[]; style_dna?: StyleDNA };
      setLoadError(null);
    } catch (error) {
      console.error("Failed to fetch /api/generate-cards", error);
      setLoadError("Could not load Persona feed. Please retry.");
      return;
    }

    if (Array.isArray(data.cards) && data.cards.length) {
      const newCards: Card[] = data.cards.map((card: Card, i: number) => ({
        ...card,
        id: String(card.id || `${nextCursor}-${i + 1}`),
      }));

      const effectiveStyleKeywords = Array.isArray(data.style_dna?.keywords)
        ? data.style_dna?.keywords || []
        : Array.isArray(dna?.keywords)
          ? dna.keywords || []
          : [];
      const uploadCards =
        mode === "replace"
          ? selectUploadsForFeed(tastes, effectiveStyleKeywords)
          : [];
      const finalCards =
        mode === "replace"
          ? [...uploadCards, ...newCards]
          : newCards;
      const finalDeduped = (() => {
        const seen = new Set<string>();
        return finalCards.filter((card) => {
          const key = String(card.id || "");
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      })();
      const safeCards = finalDeduped.map((card) => {
        if (
          card?.source === "community" ||
          String(card?.image_url || "").includes(".public.blob.vercel-storage.com")
        ) {
          return {
            ...card,
            source: "community" as const,
          };
        }
        const topic = String(card.topic || card.tags?.[0] || "Style");
        const tags = Array.isArray(card.tags) && card.tags.length
          ? card.tags
          : [topic, "Style", "Culture"];
        return {
          ...card,
          id: String(card.id || `${nextCursor}-${Math.random().toString(36).slice(2, 8)}`),
          image_query: String(card.image_query || deriveImageQuery(topic, tags)),
          image_url: String(card.image_url || img(topic)),
          caption_short: String(card.caption_short || `${topic}: editorial note.`).slice(0, 220),
          caption_long: String(card.caption_long || `Expanded take on ${topic}.`),
          tags,
        };
      });

      // Cache feed cards for Collection liked-id reconstruction.
      updateFeedCache(safeCards, savedSource);

      if (mode === "replace") {
        setCards(safeCards);
        addSeenFromCards(safeCards);
        setIndex(0);
        setExpanded(false);
        cursorRef.current = nextCursor;
        setCursor(nextCursor);
      } else {
        const existingIds = new Set(cardsRef.current.map((c) => c.id));
        const deduped = newCards.filter((c) => !existingIds.has(c.id));
        setCards((prev) => [...prev, ...deduped]);
        addSeenFromCards(deduped);
        cursorRef.current = nextCursor;
        setCursor((prev) => prev + 1);
      }
    }

    if (data.style_dna) {
      setDna(data.style_dna);
      writeJSON("persona:style_dna", data.style_dna);
    }
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
      const savedAll = readJSON<Card[]>("persona:saved", []);
      setSavedIds(savedAll.map((c) => c.id));
      try {
        await fetchBatch(0, "replace", savedAll);
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
  }, []);

  async function retryLoad() {
    setIsLoading(true);
    const savedAll = readJSON<Card[]>("persona:saved", []);
    setSavedIds(savedAll.map((c) => c.id));
    try {
      await fetchBatch(0, "replace", savedAll);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveCard(card: Card) {
    const savedAll = readJSON<Card[]>("persona:saved", []);

    // Same id-based toggle behavior for every card source.
    const exists = savedAll.some((c) => c.id === card.id);
    const nextSaved = exists
      ? savedAll.filter((c) => c.id !== card.id)
      : [card, ...savedAll];

    writeJSON("persona:saved", nextSaved);
    setSavedIds(nextSaved.map((c) => c.id));

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

  function toggleLike(card: Card) {
    setLikes((prev) => {
      const next = { ...prev };
      if (next[card.id]) {
        delete next[card.id];
      } else {
        next[card.id] = true;
      }
      writeJSON("persona:likes", next);
      setIsLiked(Boolean(next[card.id]));
      return next;
    });
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
        <div className="h-screen flex flex-col items-center justify-center text-gray-600 gap-3 px-6 text-center">
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
        <div className="h-screen w-screen bg-white flex items-center justify-center px-4">
          <div className="w-full max-w-sm animate-pulse">
            <div className="rounded-2xl overflow-hidden shadow-xl bg-white h-[78vh] border">
              <div className="w-full h-2/3 bg-gray-200" />
              <div className="p-4 h-1/3">
                <div className="h-3 bg-gray-200 rounded w-4/5" />
                <div className="mt-3 h-4 bg-gray-200 rounded w-full" />
                <div className="mt-2 h-4 bg-gray-200 rounded w-3/4" />
                <div className="mt-5 flex gap-2">
                  <div className="h-9 rounded bg-gray-200 w-28" />
                  <div className="h-9 rounded bg-gray-200 w-20" />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="h-screen flex items-center justify-center text-gray-500">
        Loading Persona…
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-white text-black overflow-hidden">
      {/* Top nav */}
      <div className="absolute top-4 left-4 z-20 flex gap-3 items-center">
        <div className="bg-black text-white px-3 py-1 rounded-full text-sm">Persona</div>
        <a href="/saved" className="text-sm underline">
          Collection
        </a>
        <a href="/upload" className="text-sm underline">
          Upload
        </a>
        <a href="/taste" className="text-sm underline">
          Taste
        </a>
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute top-4 right-4 z-30">
          <div className="rounded-full bg-black text-white text-xs px-3 py-2 shadow">
            {toast}
          </div>
        </div>
      )}

      {/* Style DNA */}
      {dna?.one_liner && (
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
                  {dna.one_liner || (dna.keywords?.slice(0, 3).join(" • ") || "Style insights")}
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
                    <div className="text-sm font-medium text-black">{dna.one_liner}</div>
                    {dna.keywords?.length ? (
                      <div className="mt-1 text-xs text-gray-600">
                        {dna.keywords.slice(0, 8).join(" • ")}
                      </div>
                    ) : null}
                    {dna.adjacent?.length ? (
                      <div className="mt-1 text-xs text-gray-500">
                        Adjacent: {dna.adjacent.slice(0, 5).join(" • ")}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      <div className="h-full w-full flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            className="w-full h-full max-w-sm mx-auto"
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
            <div className="h-full flex flex-col justify-center px-4">
              <div className="rounded-2xl overflow-hidden shadow-xl bg-white h-[78vh]">
                <div className={`relative w-full bg-gray-100 ${expanded ? "h-1/2" : "h-2/3"}`}>
                  <img
                    src={active.image_url}
                    className="object-cover w-full h-full"
                    alt=""
                  />
                  <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                </div>

                <div className={`p-4 ${expanded ? "h-1/2" : "h-1/3"}`}>
                  <div className="text-xs text-gray-500">
                    {active.tags.slice(0, 5).join(" • ")}
                  </div>
                  {active.source === "community" ? (
                    <div className="mt-1 inline-flex px-2 py-0.5 rounded-full text-[11px] border border-gray-300 text-gray-600">
                      Community
                    </div>
                  ) : null}

                  <div className="mt-2 text-base font-medium">{active.caption_short}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {active.source === "community"
                      ? "by @you"
                      : "Persona Editorial"}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{whyThis}</div>

                  <div className="mt-2 flex items-center justify-between">
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
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className="flex items-center gap-3 text-gray-600"
                    >
                      <button
                        onClick={() => toggleLike(active)}
                        className="hover:text-black active:scale-95 transition"
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
                        onClick={() => showActionToast("Comments coming soon")}
                        className="hover:text-black active:scale-95 transition"
                        aria-label="Chat"
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
                  </div>

                  {expanded ? (
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className="mt-2 text-sm text-gray-700 max-h-[30vh] overflow-y-auto pr-1 leading-relaxed"
                    >
                      {active.caption_long}
                    </div>
                  ) : null}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => saveCard(active)}
                      disabled={isUpdating}
                      className={`px-3 py-2 rounded text-sm transition ${
                        savedIds.includes(active.id)
                          ? "bg-gray-200 text-gray-700"
                          : "bg-black text-white"
                      }`}
                    >
                      {savedIds.includes(active.id) ? "✓ Collected" : "+ Collection"}
                    </button>

                    <button
                      onClick={() => goTo(index + 1)}
                      className="hidden md:block px-3 py-2 rounded bg-gray-100 text-sm"
                    >
                      Next
                    </button>
                  </div>
                  {actionToast ? (
                    <div className="mt-2 text-xs text-gray-500">{actionToast}</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 text-center text-xs text-gray-400">
                Drag up/down to browse • Tap “Read more”
              </div>
              <div className="mt-1 text-center text-[10px] text-gray-400">
                {active?.source || "editorial"} • {String(active?.image_url || "").slice(0, 60)}
              </div>
              {isLoadingMore ? (
                <div className="mt-1 text-center text-xs text-gray-500">Loading more…</div>
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
