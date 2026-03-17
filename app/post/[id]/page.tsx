"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import PersonaHeader from "@/components/PersonaHeader";
import {
  getEngagement,
  readEngagement,
  writeEngagement,
  type EngagementMap,
} from "@/lib/engagement";
import { addComment, getComments, removeComment, type PersonaComment } from "@/lib/comments";
import { supabase } from "@/lib/supabase";
import { prioritizeUploadTags, sanitizeContentTags, slugifyTag } from "@/lib/tags";

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
  creator_avatar?: string;
  creator_id?: string;
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

  const tags = sanitizeContentTags(
    Array.isArray(obj.tags)
      ? obj.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 12)
      : [],
    12,
  );
  const source = obj.source === "community" ? "community" : "editorial";
  const creator_name = String(obj.creator_name || "").trim();
  const creator_handle = String(obj.creator_handle || "").trim();
  const creator_avatar = String(obj.creator_avatar || "").trim();
  const creator_id = String(obj.creator_id || "").trim();
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
    creator_avatar: creator_avatar || undefined,
    creator_id: creator_id || undefined,
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

function cleanHandle(handle?: string) {
  return String(handle || "").trim().replace(/^@+/, "");
}

function normalizeHandle(handle?: string) {
  return cleanHandle(handle).toLowerCase();
}

function formatHandle(handle?: string) {
  const clean = cleanHandle(handle);
  return clean ? `@${clean}` : "";
}

function fallbackLetter(handle?: string, name?: string) {
  const source = cleanHandle(handle) || String(name || "").trim();
  return source ? source.charAt(0).toUpperCase() : "U";
}

export default function PostDetailPage() {
  const router = useRouter();
  const { isSignedIn, user } = useUser();
  const params = useParams<{ id: string }>();
  const postId = decodeURIComponent(String(params?.id || ""));
  const [likes, setLikes] = useState<Record<string, boolean>>(() =>
    safeParseJSON<Record<string, boolean>>(localStorage.getItem("persona:likes"), {}),
  );
  const [savedIds, setSavedIds] = useState<string[]>(() =>
    readCardsFromKey("persona:saved").map((card) => card.id),
  );
  const [engagement, setEngagement] = useState<EngagementMap>(() => readEngagement());
  const [comments, setComments] = useState<PersonaComment[]>(() => getComments(postId));
  const [commentText, setCommentText] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [remotePost, setRemotePost] = useState<CardItem | null>(null);
  const [isLoadingRemotePost, setIsLoadingRemotePost] = useState(false);
  const [hasCheckedRemotePost, setHasCheckedRemotePost] = useState(false);
  const username = String(user?.username || "").trim().replace(/^@+/, "");
  const currentUserAvatar = String(user?.imageUrl || "").trim();

  const localPost = useMemo(() => {
    if (!postId || typeof window === "undefined") return null;

    const uploads = readCardsFromKey("persona:uploads");
    const collection = readCardsFromKey("persona:collection");
    const saved = readCardsFromKey("persona:saved");
    const feedCache = readCardsFromKey("persona:feed_cache");

    const pool = [...uploads, ...collection, ...saved, ...feedCache];
    return pool.find((card) => card.id === postId) || null;
  }, [postId]);
  const post = localPost || (remotePost?.id === postId ? remotePost : null);
  const postEngagement = useMemo(
    () => (post?.id ? getEngagement(post.id, engagement) : getEngagement("")),
    [post, engagement],
  );

  useEffect(() => {
    if (!postId || localPost) {
      return;
    }

    let cancelled = false;

    async function loadRemotePost() {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setIsLoadingRemotePost(true);
        setHasCheckedRemotePost(false);
      });

      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();

      if (cancelled) return;

      if (error) {
        console.error("Supabase post fetch error:", error);
        setRemotePost(null);
        setIsLoadingRemotePost(false);
        setHasCheckedRemotePost(true);
        return;
      }

      const normalized = normalizeCard(data);
      setRemotePost(normalized ? { ...normalized, source: "community" } : null);
      setIsLoadingRemotePost(false);
      setHasCheckedRemotePost(true);
    }

    loadRemotePost().catch((error) => {
      if (cancelled) return;
      console.error("Failed to fetch Supabase post", error);
      setRemotePost(null);
      setIsLoadingRemotePost(false);
      setHasCheckedRemotePost(true);
    });

    return () => {
      cancelled = true;
    };
  }, [localPost, postId]);

  const shouldShowNotFound = !post && (hasCheckedRemotePost || (!postId || Boolean(localPost)));

  function showActionMessage(message: string) {
    setActionMessage(message);
    window.setTimeout(() => setActionMessage(null), 1500);
  }

  function redirectToSignIn() {
    const redirectUrl =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/";
    router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
  }

  function toggleLike() {
    if (!post) return;
    if (!isSignedIn) {
      redirectToSignIn();
      return;
    }
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
    if (!isSignedIn) {
      redirectToSignIn();
      return;
    }
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

  function formatCommentTimestamp(createdAt: number) {
    const ts = Number(createdAt) || 0;
    if (!ts) return "";
    return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function handleSubmitComment() {
    if (!post || !isSignedIn) return;
    if (!username) return;
    const text = commentText.trim();
    if (!text) return;

    const authorName = String(
      user?.firstName ||
      user?.username ||
      "Persona User"
    ).trim();
      const authorHandle = `@${username}`;
    const authorAvatar = currentUserAvatar;
    const authorId = String(user?.id || "").trim();

    const comment: PersonaComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author_name: authorName,
      author_handle: authorHandle,
      author_avatar: authorAvatar || undefined,
      author_id: authorId || undefined,
      text,
      created_at: Date.now(),
    };

    const nextComments = addComment(post.id, comment);
    setComments(nextComments);
    setCommentText("");
    setEngagement((prevEngagement) => {
      const current = getEngagement(post.id, prevEngagement);
      const nextCounts = {
        ...current,
        comments_count: current.comments_count + 1,
      };
      const nextEngagement = { ...prevEngagement, [post.id]: nextCounts };
      writeEngagement(nextEngagement);
      return nextEngagement;
    });
  }

  function handleDeleteComment(comment: PersonaComment) {
    if (!post || !user) return;

    const nextComments = removeComment(post.id, comment.id, {
      author_id: user.id,
      author_handle: user.username || "",
    });

    if (nextComments.length === comments.length) return;

    setComments(nextComments);
    setEngagement((prevEngagement) => {
      const current = getEngagement(post.id, prevEngagement);
      const nextCounts = {
        ...current,
        comments_count: Math.max(0, current.comments_count - 1),
      };
      const nextEngagement = { ...prevEngagement, [post.id]: nextCounts };
      writeEngagement(nextEngagement);
      return nextEngagement;
    });
  }

  if (!post && isLoadingRemotePost) {
    return (
      <div className="min-h-screen bg-white text-black px-5 py-8">
        <div className="max-w-2xl mx-auto">
          <PersonaHeader showBack />
          <h1 className="text-2xl font-semibold">Post</h1>
          <div className="mt-4 text-gray-600">Loading post...</div>
        </div>
      </div>
    );
  }

  if (shouldShowNotFound) {
    return (
      <div className="min-h-screen bg-white text-black px-5 py-8">
        <div className="max-w-2xl mx-auto">
          <PersonaHeader showBack />
          <h1 className="text-2xl font-semibold">Post</h1>
          <div className="mt-4 text-gray-600">Post not found</div>
          <Link href="/u/you?tab=collected" className="mt-4 inline-block underline text-sm">
            Back to Collection
          </Link>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-white text-black px-5 py-8">
        <div className="max-w-2xl mx-auto">
          <PersonaHeader showBack />
          <h1 className="text-2xl font-semibold">Post</h1>
          <div className="mt-4 text-gray-600">Post not found</div>
          <Link href="/u/you?tab=collected" className="mt-4 inline-block underline text-sm">
            Back to Collection
          </Link>
        </div>
      </div>
    );
  }

  const title = post.caption_short || post.topic || "Untitled";
  const isLiked = Boolean(likes[post.id]);
  const isCollected = savedIds.includes(post.id);
  const creatorHandle = cleanHandle(post.creator_handle);
  const isCurrentUserCreator = Boolean(
    user &&
      ((post.creator_id && post.creator_id === user.id) ||
        (creatorHandle && creatorHandle.toLowerCase() === normalizeHandle(user.username || ""))),
  );
  const creatorAvatarSrc = String(
    isCurrentUserCreator ? currentUserAvatar : post.creator_avatar || "",
  ).trim();
  const visibleTags = prioritizeUploadTags(sanitizeContentTags(post.tags, 12), 12);

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
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              {creatorHandle ? (
                <>
                  {creatorAvatarSrc ? (
                    <img
                      src={creatorAvatarSrc}
                      alt={post.creator_name || formatHandle(post.creator_handle) || "Creator avatar"}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-medium">
                      {fallbackLetter(post.creator_handle, post.creator_name)}
                    </div>
                  )}
                  <Link
                    href={`/u/${encodeURIComponent(creatorHandle)}`}
                    className="hover:text-gray-700 active:text-black transition-colors"
                  >
                    by {formatHandle(post.creator_handle)}
                  </Link>
                </>
              ) : (
                <span>{creatorLine(post)}</span>
              )}
            </div>
            <div className="mt-1 text-xs text-gray-500">{sourceLabel(post)}</div>

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
                  onClick={() => {
                    const section = document.getElementById(`comments-${post.id}`);
                    if (!section) return;
                    section.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
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

            <div className="mt-3">
              {visibleTags.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {visibleTags.map((tag) => (
                    <Link
                      key={`${post.id}-${tag}`}
                      href={`/t/${encodeURIComponent(slugifyTag(tag))}`}
                      className="px-2 py-1 rounded-full text-[11px] border bg-white text-gray-600 border-gray-300"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500">No tags</div>
              )}
            </div>
            <div className="mt-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {post.caption_long || "No editorial text available."}
            </div>

            <div id={`comments-${post.id}`} className="mt-6 border-t border-gray-200 pt-4">
              <div className="text-sm font-medium text-gray-700">Comments</div>

              {isSignedIn ? (
                <div className="mt-3">
                  {!username ? (
                    <div className="mb-3 rounded-lg border border-gray-200 p-3">
                      <div className="text-sm text-gray-600">Create your Persona handle before commenting.</div>
                      <div className="mt-2">
                        <Link
                          href="/u/you"
                          className="inline-block px-3 py-2 rounded-lg bg-black text-white text-sm"
                        >
                          Go to Profile
                        </Link>
                      </div>
                    </div>
                  ) : null}
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment"
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSubmitComment}
                      disabled={!commentText.trim() || !username}
                      className={`px-3 py-2 rounded-lg text-sm ${
                        commentText.trim() && username
                          ? "bg-black text-white"
                          : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      Post
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-gray-200 p-3">
                  <div className="text-sm text-gray-600">Sign in to comment.</div>
                  <div className="mt-2">
                    <Link
                      href={`/sign-in?redirect_url=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : `/post/${encodeURIComponent(post.id)}`)}`}
                      className="inline-block px-3 py-2 rounded-lg bg-black text-white text-sm"
                    >
                      Sign in
                    </Link>
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-3">
                {comments.length ? comments.map((comment) => (
                  <div key={comment.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    {(() => {
                      const commentHandle = cleanHandle(comment.author_handle);
                      const isOwnComment = Boolean(
                        user &&
                          ((comment.author_id && comment.author_id === user.id) ||
                            (commentHandle &&
                              commentHandle.toLowerCase() === normalizeHandle(user.username || ""))),
                      );
                      const commentAvatar = String(
                        isOwnComment ? currentUserAvatar : comment.author_avatar || "",
                      ).trim();
                      return (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {commentAvatar ? (
                          <img
                            src={commentAvatar}
                            alt={comment.author_name || comment.author_handle || "Avatar"}
                            className="w-7 h-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-[11px] font-medium">
                            {fallbackLetter(comment.author_handle, comment.author_name)}
                          </div>
                        )}
                        <span>
                          {cleanHandle(comment.author_handle) ? (
                            <Link
                              href={`/u/${encodeURIComponent(cleanHandle(comment.author_handle))}`}
                              className="hover:text-gray-700 active:text-black transition-colors"
                            >
                              {formatHandle(comment.author_handle)}
                            </Link>
                          ) : (
                            comment.author_name
                          )}
                          {comment.created_at ? ` • ${formatCommentTimestamp(comment.created_at)}` : ""}
                        </span>
                      </div>
                      {isOwnComment ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment)}
                          className="text-xs text-gray-400 hover:text-gray-600 transition"
                          aria-label="Delete comment"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                      );
                    })()}
                    <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{comment.text}</div>
                  </div>
                )) : (
                  <div className="text-sm text-gray-500">No comments yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
