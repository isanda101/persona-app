import { NextResponse } from "next/server";
import OpenAI from "openai";

type SavedSignal = { caption_short?: string; tags?: string[] };

type Body = {
  tastes?: string[];
  saved?: SavedSignal[];
  cursor?: number;
  avoid_topics?: string[];
  avoid_tags?: string[];
  upload?: {
    note?: string;
    tags?: string[];
    image_url?: string | null;
  };
};

type StyleDNA = {
  vibe: string;
  keywords: string[];
  adjacent: string[];
  one_liner: string;
};

type Card = {
  id: string;
  topic: string;
  image_query?: string;
  image_url: string;
  caption_short: string;
  caption_long: string;
  tags: string[];
  attribution?: string;
  source?: "community" | "editorial";
};
type Scored = { score: number; index: number; item: any };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
type CacheEntry = { image_url: string; attribution?: string; expires: number };
const imgCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
let lastUnsplashStatus: { status?: number; error?: string } = {};
let unsplashBlockedUntil = 0;

async function fetchUnsplashImage(query: string) {
  if (!UNSPLASH_ACCESS_KEY) return null;
  if (Date.now() < unsplashBlockedUntil) return null;

  const q = query.trim();
  if (!q) return null;

  const key = q.toLowerCase();
  const cached = imgCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return { image_url: cached.image_url, attribution: cached.attribution };
  }
  if (cached && cached.expires <= Date.now()) {
    imgCache.delete(key);
  }

  const url =
    "https://api.unsplash.com/search/photos?" +
    new URLSearchParams({
      query: q,
      per_page: "12",
      orientation: "portrait",
      content_filter: "high",
    }).toString();

  try {
    lastUnsplashStatus = {};
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
      // prevent next from caching API fetches unexpectedly
      cache: "no-store",
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      lastUnsplashStatus = {
        status: res.status,
        error: errorText,
      };
      if (res.status === 403 && errorText.includes("Rate Limit Exceeded")) {
        unsplashBlockedUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
      }
      return null;
    }
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) {
      lastUnsplashStatus = { status: 200, error: "no_results" };
      return null;
    }

    const keywords = Array.from(
      new Set(
        q
          .toLowerCase()
          .split(/\s+/)
          .map((k) => k.trim())
          .filter((k) => k.length >= 4),
      ),
    );

    const scored: Scored[] = results.map((item: any, index: number) => {
      const text = `${String(item?.alt_description || "")} ${String(item?.description || "")}`.toLowerCase();
      const score = keywords.reduce((acc, kw) => (text.includes(kw) ? acc + 1 : acc), 0);
      return { item, score, index };
    });

    const best = scored
      .sort((a: Scored, b: Scored) => (b.score - a.score) || (a.index - b.index))[0];
    const picked = best?.score > 0 ? best.item : results[0];
    if (!picked?.urls?.regular) return null;

    const out = {
      image_url: picked.urls.regular,
      attribution: `Photo by ${picked.user?.name || "Unknown"} on Unsplash`,
    };

    imgCache.set(key, { ...out, expires: Date.now() + CACHE_TTL_MS });
    return out;
  } catch (err) {
    lastUnsplashStatus = { error: String((err as Error)?.message || err) };
    return null;
  }
}

function img(topic: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(topic)}/1200/800`;
}

function fallbackDNA(tastes: string[], saved: SavedSignal[]): StyleDNA {
  const t = tastes.slice(0, 5);
  const s = (saved || [])
    .flatMap((x) => (Array.isArray(x.tags) ? x.tags : []))
    .slice(0, 6);

  const keywords = Array.from(
    new Set([...t, ...s, "Design", "Culture", "Vintage", "Craft"])
  ).slice(0, 10);

  return {
    vibe: "Curated modern taste",
    keywords,
    adjacent: ["Architecture", "Photography", "Interiors", "Objects", "Runway", "Vintage"],
    one_liner: `A curated mix of ${t.join(", ")} with an editorial, culture-forward eye.`,
  };
}

function fallbackCard(topic: string, id: string): Card {
  const defaultQuery = `${topic} editorial photo`;
  return {
    id,
    topic,
    image_query: defaultQuery,
    image_url: img(topic),
    caption_short: `${topic}: a clean, quick editorial note—why it matters right now.`,
    caption_long: `Expanded take on ${topic}. (Fallback text — AI unavailable.)`,
    tags: [topic, "Style", "Culture", "Aesthetic", "Reference"],
    attribution: "Picsum (placeholder)",
  };
}

function safeArrayStrings(v: any, max = 20): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean).slice(0, max);
}

const BRAND_HINTS = [
  "Rolex",
  "Nike",
  "Gucci",
  "Louis Vuitton",
  "Prada",
  "Tommy Hilfiger",
  "Ralph Lauren",
  "Supreme",
  "BAPE",
  "Stüssy",
  "Off-White",
  "Porsche",
  "Ferrari",
  "BMW",
  "Mercedes",
  "IKEA",
  "Eames",
  "Cartier",
  "Omega",
];

const OBJECT_HINTS = [
  "Tracksuit",
  "Jacket",
  "Sneakers",
  "Shoe",
  "Bag",
  "Watch",
  "Chair",
  "Sofa",
  "Car",
  "Jeans",
  "Denim",
  "Coat",
  "Boots",
  "Table",
];

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function buildUploadTopic(note: string, tags: string[]) {
  const cleanTags = tags.map((tag) => String(tag || "").trim()).filter(Boolean);
  const noteText = String(note || "").trim();

  const findBrand = () =>
    BRAND_HINTS.find((brand) =>
      cleanTags.some((tag) => tag.toLowerCase() === brand.toLowerCase() || tag.toLowerCase().includes(brand.toLowerCase())),
    );

  const findObject = () =>
    OBJECT_HINTS.find((obj) =>
      cleanTags.some((tag) => tag.toLowerCase() === obj.toLowerCase() || tag.toLowerCase().includes(obj.toLowerCase())),
    );

  const brand = findBrand();
  const objectType = findObject();

  if (brand && objectType) {
    const candidateModel = cleanTags.find((tag) => {
      const t = tag.toLowerCase();
      return !t.includes(brand.toLowerCase()) && !t.includes(objectType.toLowerCase()) && tag.length >= 3;
    });
    if (candidateModel) return `${brand} ${toTitleCase(candidateModel)}`;
    return `${brand} ${objectType}`;
  }

  if (noteText) return noteText;
  if (cleanTags.length >= 2) return `${toTitleCase(cleanTags[0])} ${toTitleCase(cleanTags[1])}`;
  if (cleanTags.length === 1) return toTitleCase(cleanTags[0]);
  return "Community Upload";
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

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const image_debug: any[] = [];
  const getDebug = () => ({
    has_unsplash_key: Boolean(process.env.UNSPLASH_ACCESS_KEY),
    unsplash_last: lastUnsplashStatus,
    unsplash_blocked: Date.now() < unsplashBlockedUntil,
  });

  const tastes = Array.isArray(body.tastes) && body.tastes.length
    ? body.tastes.map(String)
    : ["Rolex", "Ralph Lauren", "Nike", "Vintage", "Quiet Luxury"];

  const saved = Array.isArray(body.saved) ? body.saved : [];
  const cursor = Number.isFinite(body.cursor as number) ? Number(body.cursor) : 0;
  const avoid_topics = safeArrayStrings(body.avoid_topics, 120);
  const avoid_tags = safeArrayStrings(body.avoid_tags, 160);
  const avoidSet = new Set(avoid_topics.map((x) => x.toLowerCase().trim()).filter(Boolean));
  const tasteSet = new Set(tastes.map((t) => t.toLowerCase().trim()));

  // Upload mode: return one editorial card using upload note/tags (+ image_url).
  if (body.upload && typeof body.upload === "object") {
    const { note, tags, image_url } = body.upload;
    const safeTags = safeArrayStrings(tags, 12);
    const safeNote = typeof note === "string" ? note.trim() : "";
    const topic = buildUploadTopic(safeNote, safeTags);

    const editorialPrompt = `
Write an editorial style description about the following object.

Topic: ${topic}
Tags: ${safeTags.join(", ")}

Write like a design / fashion magazine with an object-aware, collector-aware voice.

Requirements:
- 120 to 180 words
- Describe the object
- Mention design details, materials, cultural context
- Write in an engaging editorial tone
`;

    let caption_long = `An editorial community upload featuring ${topic}.`;
    try {
      const completion = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: editorialPrompt,
      });
      caption_long =
        completion.output_text ||
        `An editorial community upload featuring ${topic}.`;
    } catch {
      caption_long = `An editorial community upload featuring ${topic}.`;
    }

    const caption_short =
      topic.length > 60 ? topic.slice(0, 60) : topic;

    return NextResponse.json({
      cards: [
        {
          id: `upload-${Date.now()}`,
          topic,
          image_query: "",
          image_url: typeof image_url === "string" ? image_url : "",
          caption_short,
          caption_long,
          tags: safeTags,
          attribution: "Uploaded by community",
          source: "community",
        },
      ],
    });
  }

  // Always have deterministic fallback ready
  const fallback = () => {
    const cards = Array.from({ length: 12 }).map((_, i) => {
      const topic = tastes[(i + cursor) % tastes.length];
      return fallbackCard(topic, `${cursor}-${i + 1}`);
    });
    return { cards, style_dna: fallbackDNA(tastes, saved) };
  };

  // If no key, return fallback JSON
  if (!process.env.OPENAI_API_KEY) {
    const out = fallback();
    return NextResponse.json({ ...out, warning: "OPENAI_API_KEY not set.", debug: getDebug(), image_debug });
  }

  try {
    const preferenceCounts = new Map<string, number>();
    saved.forEach((s) => {
      if (!Array.isArray(s.tags)) return;
      s.tags.forEach((tag) => {
        const key = String(tag || "").trim();
        if (!key) return;
        preferenceCounts.set(key, (preferenceCounts.get(key) ?? 0) + 1);
      });
    });
    const topPreferences = Array.from(preferenceCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([tag]) => tag);

    const savedCompact = saved.slice(0, 30).map((s) => ({
      caption_short: (s.caption_short || "").slice(0, 160),
      tags: Array.isArray(s.tags) ? s.tags.slice(0, 8) : [],
    }));

    const prompt = `
Return STRICT JSON ONLY with shape:
{
  "style_dna": { "vibe": string, "keywords": string[], "adjacent": string[], "one_liner": string },
  "cards": [ { "topic": string, "caption_short": string, "caption_long": string, "tags": string[] } ]
}

You are Persona Editor: high-end fashion + culture editor.
Batch cursor: ${cursor}

Inputs:
- tastes: ${JSON.stringify(tastes)}
- top_preferences: ${JSON.stringify(topPreferences)}
- saved_signals: ${JSON.stringify(savedCompact)}
- avoid_topics: ${JSON.stringify(avoid_topics.slice(-80))}
- avoid_tags: ${JSON.stringify(avoid_tags.slice(-160))}

Rules:
- style_dna must exist.
- Produce 12 cards.
- 70% of cards should align with tastes + top_preferences.
- 30% of cards should come from style_dna.adjacent exploration.
- Avoid topics in avoid_topics (case-insensitive).
- Avoid tags/themes in avoid_tags.
- caption_short must be under 20 words.
- caption_long must be approximately 120–180 words.
- Write caption_long like an editorial piece from a design or fashion magazine.
- Focus on the specific object in the image or topic.
- Include historical context, design details, and cultural significance.
- Avoid generic phrases like "luxury brand" or "known for quality".
- Write a detailed editorial explanation about the object or topic. Include design details, historical background, and why it matters culturally or to collectors.
- tags 4–7 tags and include the topic.
JSON ONLY.`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const text = resp.choices[0]?.message?.content ?? "{}";

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e: any) {
      const out = fallback();
      return NextResponse.json({
        ...out,
        warning: `JSON parse failed: ${String(e?.message || e)}`,
        debug: getDebug(),
        image_debug,
      });
    }

    const dna = parsed?.style_dna;
    const rawCards = Array.isArray(parsed?.cards) ? parsed.cards : [];

    const style_dna: StyleDNA =
      dna && typeof dna.one_liner === "string"
        ? {
            vibe: String(dna.vibe || "Curated modern taste"),
            keywords: safeArrayStrings(dna.keywords, 12),
            adjacent: safeArrayStrings(dna.adjacent, 12),
            one_liner: String(dna.one_liner || ""),
          }
        : fallbackDNA(tastes, saved);

    const mappedCards: Card[] =
      rawCards.length
        ? rawCards.slice(0, 12).map((c: any, i: number) => {
            const topic = String(c.topic || tastes[(i + cursor) % tastes.length] || "Style");
            return {
              id: `raw-${i + 1}`,
              topic,
              image_query: deriveImageQuery(
                topic,
                safeArrayStrings(c.tags, 12).length ? safeArrayStrings(c.tags, 12) : [topic, "Style", "Culture"],
              ),
              image_url: img(topic),
              caption_short: String(c.caption_short || `${topic}: editorial note.`).slice(0, 220),
              caption_long: String(c.caption_long || `Expanded take on ${topic}.`),
              tags: safeArrayStrings(c.tags, 12).length ? safeArrayStrings(c.tags, 12) : [topic, "Style", "Culture"],
              attribution: "Picsum (placeholder)",
            };
          })
        : fallback().cards;

    const filteredCards = mappedCards.filter((card) => {
      const firstTag = String(card.tags?.[0] || "").toLowerCase().trim();
      const topic = String(card.tags?.[0] || card.caption_short || "")
        .split(":")[0]
        .toLowerCase()
        .trim();
      return !(avoidSet.has(topic) || avoidSet.has(firstTag));
    });

    const fillPool = [
      ...safeArrayStrings(style_dna.adjacent, 20),
      ...tastes,
    ].filter(Boolean);
    let poolIdx = 0;
    const cards = [...filteredCards];

    if (cards.length < 8) {
      while (cards.length < 12) {
        const topic =
          fillPool[poolIdx] ||
          tastes[poolIdx % Math.max(1, tastes.length)] ||
          "Style";
        poolIdx += 1;
        cards.push(fallbackCard(String(topic), `fill-${cards.length + 1}`));
      }
    } else {
      while (cards.length < 12) {
        const topic =
          fillPool[poolIdx] ||
          tastes[poolIdx % Math.max(1, tastes.length)] ||
          "Style";
        poolIdx += 1;
        cards.push(fallbackCard(String(topic), `fill-${cards.length + 1}`));
      }
    }

    const normalizedCards: Card[] = cards.slice(0, 12).map((card, i) => {
      const topic = String(card.tags?.[0] || tastes[(i + cursor) % tastes.length] || "Style");
      const tags =
        safeArrayStrings(card.tags, 12).length ? safeArrayStrings(card.tags, 12) : [topic, "Style", "Culture"];
      return {
        id: `${cursor}-${i + 1}`,
        topic: String(card.topic || topic),
        image_query: String(card.image_query || deriveImageQuery(String(card.topic || topic), tags)),
        image_url: String(card.image_url || img(topic)),
        caption_short: String(card.caption_short || `${topic}: editorial note.`).slice(0, 220),
        caption_long: String(card.caption_long || `Expanded take on ${topic}.`),
        tags,
        attribution: card.attribution || "Picsum (placeholder)",
      };
    });

    const requiredThemes: Array<{
      enabled: boolean;
      min: number;
      keywords: string[];
      fallbackTopics: string[];
    }> = [
      {
        enabled: tasteSet.has("vintage"),
        min: 3,
        keywords: ["vintage", "archive", "heritage", "neo-vintage"],
        fallbackTopics: ["Vintage Archive", "Heritage Vintage", "Neo-Vintage Design", "Archive Fashion"],
      },
      {
        enabled: tasteSet.has("quiet luxury"),
        min: 3,
        keywords: ["minimal", "tailoring", "materials", "heritage luxury"],
        fallbackTopics: ["Minimal Tailoring", "Quiet Materials", "Heritage Luxury", "Understated Minimal"],
      },
    ];

    const cardText = (card: Card) =>
      `${card.caption_short} ${card.caption_long} ${Array.isArray(card.tags) ? card.tags.join(" ") : ""}`.toLowerCase();

    for (const theme of requiredThemes) {
      if (!theme.enabled) continue;
      let count = normalizedCards.filter((card) =>
        theme.keywords.some((kw) => cardText(card).includes(kw)),
      ).length;
      let cursorReplace = 0;

      while (count < theme.min) {
        const replaceCandidates = normalizedCards
          .map((card, idx) => ({ card, idx }))
          .filter(({ card }) => !theme.keywords.some((kw) => cardText(card).includes(kw)))
          .sort((a, b) => {
            const aLen = String(a.card.caption_short || "").length;
            const bLen = String(b.card.caption_short || "").length;
            if (aLen !== bLen) return aLen - bLen;
            return b.idx - a.idx;
          });

        const target = replaceCandidates[0];
        if (!target) break;

        const topic = theme.fallbackTopics[cursorReplace % theme.fallbackTopics.length];
        cursorReplace += 1;
        const replaced = fallbackCard(topic, target.card.id);
        replaced.tags = [topic, ...theme.keywords.slice(0, 3), "Style"].slice(0, 7);
        normalizedCards[target.idx] = replaced;

        count = normalizedCards.filter((card) =>
          theme.keywords.some((kw) => cardText(card).includes(kw)),
        ).length;
      }
    }

    const cardsNeedingImage = normalizedCards
      .filter((card) => !card.image_url || card.image_url.includes("picsum.photos"))
      .slice(0, 3);

    await Promise.all(
      cardsNeedingImage.map(async (card) => {
        const query = card.image_query || deriveImageQuery(card.topic, card.tags);
        const image = await fetchUnsplashImage(query);
        image_debug.push({
          topic: card.topic,
          image_query: card.image_query,
          used_unsplash: Boolean(image),
          unsplash_ok: image ? true : false,
        });
        if (!image) return;
        card.image_url = image.image_url;
        card.attribution = image.attribution;
      }),
    );

    // NEVER return empty cards
    if (!normalizedCards.length) {
      const out = fallback();
      return NextResponse.json({ ...out, warning: "No cards returned; fallback used.", debug: getDebug(), image_debug });
    }

    return NextResponse.json({ cards: normalizedCards, style_dna, debug: getDebug(), image_debug });
  } catch (err: any) {
    const out = fallback();
    return NextResponse.json({ ...out, warning: String(err?.message || err), debug: getDebug(), image_debug });
  }
}
