export type PersonaComment = {
  id: string;
  author_name: string;
  author_handle: string;
  author_avatar?: string;
  text: string;
  created_at: number;
};

export type CommentsMap = Record<string, PersonaComment[]>;

const COMMENTS_KEY = "persona:comments";

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
        .map((item) => {
          const obj = item as Record<string, unknown>;
          return {
            id: String(obj.id || "").trim(),
            author_name: String(obj.author_name || "").trim(),
            author_handle: String(obj.author_handle || "").trim(),
            author_avatar: String(obj.author_avatar || "").trim() || undefined,
            text: String(obj.text || "").trim(),
            created_at: Number(obj.created_at) || 0,
          };
        })
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
