export function normalizeTag(tag: string): string {
  return String(tag || "").trim().toLowerCase();
}

export function slugifyTag(tag: string): string {
  return normalizeTag(tag).replace(/\s+/g, "-");
}

export function unslugifyTag(slug: string): string {
  const value = normalizeTag(slug).replace(/-+/g, " ");
  if (!value) return "";
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
