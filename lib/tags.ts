export function normalizeTag(tag: string): string {
  return String(tag || "").trim().toLowerCase();
}

const SOURCE_LABEL_TAGS = new Set([
  "community",
  "editorial",
  "persona community",
  "persona editorial",
]);

const BRAND_HINTS = [
  "rolex",
  "nike",
  "gucci",
  "louis vuitton",
  "prada",
  "tommy hilfiger",
  "ralph lauren",
  "supreme",
  "bape",
  "stussy",
  "off-white",
  "porsche",
  "ferrari",
  "bmw",
  "mercedes",
  "ikea",
  "eames",
  "cartier",
  "omega",
  "suzuki",
];

const OBJECT_HINTS = [
  "tracksuit",
  "jacket",
  "sneakers",
  "shoe",
  "bag",
  "watch",
  "chair",
  "sofa",
  "car",
  "suv",
  "jeans",
  "denim",
  "coat",
  "boots",
  "table",
  "off-road",
  "4x4",
  "running",
];

const STYLE_HINTS = [
  "vintage",
  "quiet luxury",
  "japanese denim",
  "american heritage",
  "streetwear",
  "minimal",
  "industrial",
  "mid-century",
  "heritage",
  "aesthetic",
  "style",
  "design",
  "avant garde",
];

const WEAK_GENERIC_HINTS = [
  "style",
  "culture",
  "object",
  "aesthetic",
  "reference",
  "design",
  "fashion",
  "look",
  "trend",
];

export function isSourceLabelTag(tag: string): boolean {
  const normalized = normalizeTag(tag);
  return SOURCE_LABEL_TAGS.has(normalized);
}

export function sanitizeContentTags(tags: string[], max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const value = String(raw || "").trim();
    const key = normalizeTag(value);
    if (!value || !key || seen.has(key) || isSourceLabelTag(value)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function includesHint(value: string, hints: string[]): boolean {
  return hints.some((hint) => value === hint || value.includes(hint));
}

function tagPriority(tag: string): number {
  const value = normalizeTag(tag);
  if (!value) return 6;
  if (includesHint(value, WEAK_GENERIC_HINTS)) return 9;
  if (includesHint(value, BRAND_HINTS)) return 0;
  if (includesHint(value, OBJECT_HINTS)) return 2;
  if (includesHint(value, STYLE_HINTS)) return 3;
  const looksLikeModel = /\d/.test(value) || /[-/]/.test(value) || value.split(" ").length >= 2;
  if (looksLikeModel) return 1;
  return 4;
}

export function prioritizeUploadTags(tags: string[], max = 12): string[] {
  const cleaned = sanitizeContentTags(tags, max);
  return cleaned
    .map((tag, index) => ({ tag, index, priority: tagPriority(tag) }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .slice(0, max)
    .map((item) => item.tag);
}

type BuildIdentityFirstTagsInput = {
  brand?: string;
  model?: string;
  objectType?: string;
  style?: string;
  tags?: string[];
  max?: number;
};

function pushUniqueTag(target: string[], value: string) {
  const normalized = normalizeTag(value);
  if (!normalized) return;
  if (target.some((item) => normalizeTag(item) === normalized)) return;
  target.push(value);
}

export function buildIdentityFirstTags(input: BuildIdentityFirstTagsInput): string[] {
  const max = Math.max(1, Math.min(Number(input.max || 6), 12));
  const identity = sanitizeContentTags(
    [
      String(input.brand || "").trim(),
      String(input.model || "").trim(),
      String(input.objectType || "").trim(),
    ],
    6,
  );
  const remainder = prioritizeUploadTags(
    sanitizeContentTags(
      [
        String(input.style || "").trim(),
        ...(Array.isArray(input.tags) ? input.tags : []),
      ],
      24,
    ),
    24,
  );

  const ordered: string[] = [];
  for (const tag of identity) pushUniqueTag(ordered, tag);
  for (const tag of remainder) {
    pushUniqueTag(ordered, tag);
    if (ordered.length >= max) break;
  }

  return ordered.slice(0, max);
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

type CardWithTags = {
  tags?: string[];
};

export function getRelatedTagsFromCards(
  cards: CardWithTags[],
  currentTag: string,
  limit = 6,
): string[] {
  const currentKey = normalizeTag(currentTag);
  if (!currentKey) return [];

  const counts = new Map<string, number>();
  const displayMap = new Map<string, string>();

  for (const card of cards) {
    const tags = Array.isArray(card.tags) ? card.tags : [];
    for (const raw of tags) {
      const displayTag = String(raw || "").trim();
      if (!displayTag) continue;
      const key = normalizeTag(displayTag);
      if (!key || key === currentKey) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!displayMap.has(key)) displayMap.set(key, displayTag);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([key]) => displayMap.get(key) || key);
}
