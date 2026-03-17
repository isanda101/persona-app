import { normalizeTag } from "@/lib/tags";
import { supabase } from "@/lib/supabase";

const FOLLOWED_TAGS_KEY = "persona:followed_tags";

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const key = normalizeTag(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function readFollowedTags(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FOLLOWED_TAGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return dedupeTags(parsed.map((item) => String(item || "")));
  } catch {
    return [];
  }
}

export function writeFollowedTags(tags: string[]): string[] {
  if (typeof window === "undefined") return [];
  const next = dedupeTags(tags);
  localStorage.setItem(FOLLOWED_TAGS_KEY, JSON.stringify(next));
  return next;
}

export async function fetchFollowedTagsForUser(userId: string): Promise<string[]> {
  const id = String(userId || "").trim();
  if (!id) return [];

  const { data, error } = await supabase
    .from("followed_tags")
    .select("*")
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const tags = Array.isArray(data)
    ? data.map((item) => String((item as { tag?: string }).tag || "")).filter(Boolean)
    : [];

  return writeFollowedTags(tags);
}

export function isTagFollowed(tag: string, followedTags?: string[]): boolean {
  const key = normalizeTag(tag);
  if (!key) return false;
  const pool = Array.isArray(followedTags) ? followedTags : readFollowedTags();
  return pool.some((item) => normalizeTag(item) === key);
}

export function toggleFollowedTag(tag: string): { tags: string[]; followed: boolean } {
  const value = String(tag || "").trim();
  const key = normalizeTag(value);
  if (!key) return { tags: readFollowedTags(), followed: false };

  const current = readFollowedTags();
  const exists = current.some((item) => normalizeTag(item) === key);
  const next = exists
    ? current.filter((item) => normalizeTag(item) !== key)
    : [value, ...current];
  const written = writeFollowedTags(next);
  return { tags: written, followed: !exists };
}

export async function toggleFollowedTagForUser(
  userId: string,
  tag: string,
): Promise<{ tags: string[]; followed: boolean }> {
  const id = String(userId || "").trim();
  const key = normalizeTag(tag);
  if (!id || !key) {
    return { tags: readFollowedTags(), followed: false };
  }

  const current = readFollowedTags();
  const exists = current.some((item) => normalizeTag(item) === key);

  const request = exists
    ? supabase
      .from("followed_tags")
      .delete()
      .eq("user_id", id)
      .eq("tag", key)
    : supabase
      .from("followed_tags")
      .insert({
        id: crypto.randomUUID(),
        user_id: id,
        tag: key,
      });

  const { error } = await request;
  if (error) {
    throw error;
  }

  const next = exists
    ? current.filter((item) => normalizeTag(item) !== key)
    : [key, ...current];

  return {
    tags: writeFollowedTags(next),
    followed: !exists,
  };
}
