import { NextResponse } from "next/server";
import OpenAI from "openai";

type VisionBody = {
  image_url?: string;
};

type VisionResult = {
  object_type: string;
  brand: string;
  model: string;
  style: string;
  era: string;
  tags: string[];
  note: string;
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMPTY_RESULT: VisionResult = {
  object_type: "",
  brand: "",
  model: "",
  style: "",
  era: "",
  tags: [],
  note: "",
};

function sanitizeResult(raw: unknown): VisionResult {
  if (!raw || typeof raw !== "object") return EMPTY_RESULT;
  const obj = raw as Partial<VisionResult>;
  const tags = Array.isArray(obj.tags)
    ? obj.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 12)
    : [];

  return {
    object_type: String(obj.object_type || "").trim(),
    brand: String(obj.brand || "").trim(),
    model: String(obj.model || "").trim(),
    style: String(obj.style || "").trim(),
    era: String(obj.era || "").trim(),
    tags,
    note: String(obj.note || "").trim(),
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as VisionBody;
    const image_url = String(body?.image_url || "").trim();
    if (!image_url) {
      return NextResponse.json(EMPTY_RESULT);
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(EMPTY_RESULT);
    }

    const prompt = `
Return STRICT JSON only with shape:
{
  "object_type": string,
  "brand": string,
  "model": string,
  "style": string,
  "era": string,
  "tags": string[],
  "note": string
}

Analyze the image.
Requirements:
- Identify the main object in the image.
- Detect brand if visible or strongly recognizable.
- Detect model if possible.
- Detect style / era if relevant.
- Suggest concise Persona-friendly tags.
- Be conservative if uncertain.
- Prefer real object names and categories over vague descriptions.
- note must be 1-2 sentences, editorial but concise.
JSON ONLY.
`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url, detail: "auto" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "vision_tags",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              object_type: { type: "string" },
              brand: { type: "string" },
              model: { type: "string" },
              style: { type: "string" },
              era: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              note: { type: "string" },
            },
            required: ["object_type", "brand", "model", "style", "era", "tags", "note"],
          },
        },
      },
    });

    const text = response.output_text || "";
    if (!text) return NextResponse.json(EMPTY_RESULT);

    try {
      const parsed = JSON.parse(text);
      return NextResponse.json(sanitizeResult(parsed));
    } catch {
      return NextResponse.json(EMPTY_RESULT);
    }
  } catch {
    return NextResponse.json(EMPTY_RESULT);
  }
}
