import { NextResponse } from "next/server";
import OpenAI from "openai";

type SavedSignal = { caption_short?: string; tags?: string[] };

type Body = {
  tastes?: string[];
  saved?: SavedSignal[];
  cursor?: number;
  avoid_topics?: string[];
  avoid_tags?: string[];
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
  image_query: string;
  image_url: string;
  caption_short: string;
  caption_long: string;
  tags: string[];
  attribution?: string;
};
type Scored = { score: number; index: number; item: any };

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const imgCache = new Map<string, { image_url: string; attribution?: string }>();

async function fetchUnsplashImage(query: string) {
  if (!UNSPLASH_ACCESS_KEY) return null;

  const q = query.trim();
  if (!q) return null;

  const cached = imgCache.get(q.toLowerCase());
  if (cached) return cached;

  const url =
    "https://api.unsplash.com/search/photos?" +
    new URLSearchParams({
      query: q,
      per_page: "12",
      orientation: "portrait",
      content_filter: "high",
    }).toString();

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
      // prevent next from caching API fetches unexpectedly
      cache: "no-store",
    });

    if (!res.ok) return null;
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) return null;

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

    imgCache.set(q.toLowerCase(), out);
    return out;
  } catch {
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

function deriveImageQuery(topic: string, tags: string[]) {
  const tagText = tags.join(" ").toLowerCase();
  const topicText = topic.toLowerCase();
  const has = (value: string) => tagText.includes(value) || topicText.includes(value);

  if (has("gucci")) return "gucci sneakers fashion";
  if (has("rolex")) return "rolex gmt watch close up";
  if (has("porsche")) return "porsche 911 sports car";
  if (has("eames")) return "eames lounge chair interior";
  if (has("levi's") || has("levis") || has("denim")) return "vintage levis denim jeans";

  return `${(tags || []).slice(0, 3).join(" ")} editorial photo`.trim();
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;

  const tastes = Array.isArray(body.tastes) && body.tastes.length
    ? body.tastes.map(String)
    : ["Rolex", "Ralph Lauren", "Nike", "Vintage", "Quiet Luxury"];

  const saved = Array.isArray(body.saved) ? body.saved : [];
  const cursor = Number.isFinite(body.cursor as number) ? Number(body.cursor) : 0;
  const avoid_topics = safeArrayStrings(body.avoid_topics, 120);
  const avoid_tags = safeArrayStrings(body.avoid_tags, 160);
  const avoidSet = new Set(avoid_topics.map((x) => x.toLowerCase().trim()).filter(Boolean));
  const tasteSet = new Set(tastes.map((t) => t.toLowerCase().trim()));

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
    return NextResponse.json({ ...out, warning: "OPENAI_API_KEY not set." });
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

    const resp = await client.chat.completions.create({
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
      return NextResponse.json({ ...out, warning: `JSON parse failed: ${String(e?.message || e)}` });
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

    await Promise.all(
      normalizedCards.slice(0, 8).map(async (card) => {
        const query = card.image_query || deriveImageQuery(card.topic, card.tags);
        const image = await fetchUnsplashImage(query);
        if (!image) return;
        card.image_url = image.image_url;
        card.attribution = image.attribution;
      }),
    );

    // NEVER return empty cards
    if (!normalizedCards.length) {
      const out = fallback();
      return NextResponse.json({ ...out, warning: "No cards returned; fallback used." });
    }

    return NextResponse.json({ cards: normalizedCards, style_dna });
  } catch (err: any) {
    const out = fallback();
    return NextResponse.json({ ...out, warning: String(err?.message || err) });
  }
}
