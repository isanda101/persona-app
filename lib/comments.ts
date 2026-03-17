export type PersonaComment = {
  id: string;
  post_id?: string;
  author_name: string;
  author_handle: string;
  author_avatar?: string;
  author_id?: string;
  text: string;
  created_at: number;
};

export type CommentsMap = Record<string, PersonaComment[]>;

type CommentOwner = {
  author_id?: string;
  author_handle?: string;
};

const COMMENTS_KEY = "persona:comments";

function cleanHandle(handle?: string) {
  return String(handle || "").trim().replace(/^@+/, "").toLowerCase();
}

function isOwnedBy(comment: PersonaComment, owner?: CommentOwner) {
  if (!owner) return true;
  const ownerId = String(owner.author_id || "").trim();
  const ownerHandle = cleanHandle(owner.author_handle);
  const commentId = String(comment.author_id || "").trim();
  const commentHandle = cleanHandle(comment.author_handle);

  if (ownerId && commentId && ownerId === commentId) return true;
  if (ownerHandle && commentHandle && ownerHandle === commentHandle) return true;
  return false;
}

export function normalizeComment(value: unknown): PersonaComment | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const id = String(obj.id || "").trim();
  const text = String(obj.text || "").trim();
  if (!id || !text) return null;

  const rawCreatedAt = obj.created_at;
  const createdAt =
    typeof rawCreatedAt === "number"
      ? rawCreatedAt
      : typeof rawCreatedAt === "string"
        ? Date.parse(rawCreatedAt) || 0
        : 0;

  return {
    id,
    post_id: String(obj.post_id || "").trim() || undefined,
    author_name: String(obj.author_name || "").trim(),
    author_handle: String(obj.author_handle || "").trim(),
    author_avatar: String(obj.author_avatar || "").trim() || undefined,
    author_id: String(obj.author_id || "").trim() || undefined,
    text,
    created_at: createdAt,
  };
}

export function readComments(): CommentsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(COMMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: CommentsMap = {};
    for (const [postId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!postId.trim() || !Array.isArray(value)) continue;
      out[postId] = value
        .map((item) => normalizeComment(item))
        .filter((item) => item.id && item.text);
    }
    return out;
  } catch {
    return {};
  }
}

export function writeComments(value: CommentsMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(COMMENTS_KEY, JSON.stringify(value));
}

export function getComments(postId: string): PersonaComment[] {
  const id = String(postId || "").trim();
  if (!id) return [];
  const map = readComments();
  return Array.isArray(map[id]) ? map[id] : [];
}

export function addComment(postId: string, comment: PersonaComment): PersonaComment[] {
  const id = String(postId || "").trim();
  if (!id) return [];

  const map = readComments();
  const existing = Array.isArray(map[id]) ? map[id] : [];
  const next = [comment, ...existing];
  const updated: CommentsMap = { ...map, [id]: next };
  writeComments(updated);
  return next;
}

export function removeComment(postId: string, commentId: string, owner?: CommentOwner): PersonaComment[] {
  const id = String(postId || "").trim();
  const targetId = String(commentId || "").trim();
  if (!id || !targetId) return getComments(id);

  const map = readComments();
  const existing = Array.isArray(map[id]) ? map[id] : [];
  const target = existing.find((comment) => comment.id === targetId);
  if (!target || !isOwnedBy(target, owner)) {
    return existing;
  }

  const next = existing.filter((comment) => comment.id !== targetId);
  writeComments({ ...map, [id]: next });
  return next;
}
