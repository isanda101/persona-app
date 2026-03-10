import { NextResponse } from "next/server";
import OpenAI from "openai";

type ModerateBody = {
  image_url?: string;
};

type ModerateCategories = {
  sexual?: boolean;
  violence?: boolean;
  "violence/graphic"?: boolean;
  hate?: boolean;
  "hate/threatening"?: boolean;
  "self-harm"?: boolean;
  "self-harm/intent"?: boolean;
  "self-harm/instructions"?: boolean;
};

type ModerateResponse = {
  ok: boolean;
  flagged: boolean;
  categories: ModerateCategories;
  reason: string;
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FALLBACK_BLOCKED: ModerateResponse = {
  ok: false,
  flagged: true,
  categories: {},
  reason: "We couldn't verify this image for safety.",
};

const BLOCK_REASON = "This image can't be posted on Persona.";

const POLICY_KEYS: Array<keyof ModerateCategories> = [
  "sexual",
  "violence",
  "violence/graphic",
  "hate",
  "hate/threatening",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
];

function readPolicyCategories(raw: unknown): ModerateCategories {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: ModerateCategories = {};

  for (const key of POLICY_KEYS) {
    const value = obj[key];
    if (typeof value === "boolean") out[key] = value;
  }

  return out;
}

function isPolicyFlagged(categories: ModerateCategories): boolean {
  return POLICY_KEYS.some((key) => categories[key] === true);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ModerateBody;
    const image_url = String(body?.image_url || "").trim();

    if (!image_url || !process.env.OPENAI_API_KEY) {
      return NextResponse.json(FALLBACK_BLOCKED);
    }

    try {
      const moderation = await openai.moderations.create({
        model: "omni-moderation-latest",
        input: [
          {
            type: "image_url",
            image_url: { url: image_url },
          },
        ],
      });

      const firstResult = Array.isArray(moderation?.results) ? moderation.results[0] : null;
      const categories = readPolicyCategories(firstResult?.categories);
      const flagged = isPolicyFlagged(categories);

      const response: ModerateResponse = flagged
        ? {
            ok: false,
            flagged: true,
            categories,
            reason: BLOCK_REASON,
          }
        : {
            ok: true,
            flagged: false,
            categories,
            reason: "",
          };

      return NextResponse.json(response);
    } catch {
      return NextResponse.json(FALLBACK_BLOCKED);
    }
  } catch {
    return NextResponse.json(FALLBACK_BLOCKED);
  }
}
