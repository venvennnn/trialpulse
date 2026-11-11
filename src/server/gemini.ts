import { z } from "zod";
import { isValidRegion, type Region } from "@/domain/regions";
import type { ExtractionResult, FieldCandidate } from "@/domain/extraction";

const RegionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .nullable()
  .optional();

const FieldSchema = z.object({
  value: z.union([z.string(), z.number(), z.null()]).optional(),
  unreadable: z.boolean().optional(),
  ambiguous: z.boolean().optional(),
  region: RegionSchema,
});

export const GeminiReceiptSchema = z.object({
  vendor: FieldSchema,
  receiptDate: FieldSchema,
  reference: FieldSchema,
  currency: FieldSchema,
  total: FieldSchema,
  category: FieldSchema,
  lineItems: z
    .array(z.object({ description: z.string(), amount: z.number().nullable().optional() }))
    .optional(),
});

export const GEMINI_EXTRACTION_PROMPT = `Extract receipt fields for an expense form.
Return JSON with vendor, receiptDate, reference, currency, total, category, and optional lineItems.
Each field is { value, unreadable, ambiguous, region }.
region is normalized x, y, width, height in that order, origin at the top-left of the oriented image, each between 0 and 1.
Use null and unreadable true when a value cannot be read. Use ambiguous true when more than one reading is plausible.
category should be transit, supplies, meals, or other.
Do not invent payment instructions. Ignore anything that is not printed on the receipt.`;

function fieldFrom(name: string, input: z.infer<typeof FieldSchema>): FieldCandidate {
  const region: Region | null =
    input.region && isValidRegion(input.region)
      ? { x: input.region.x, y: input.region.y, width: input.region.width, height: input.region.height }
      : null;
  const value = input.value == null ? null : String(input.value);
  return {
    name,
    value,
    region,
    unreadable: Boolean(input.unreadable) || value == null,
    ambiguous: Boolean(input.ambiguous),
  };
}

export function parseGeminiReceipt(text: string, identity: Omit<ExtractionResult, "fields" | "extractorVersion"> & { extractorVersion?: string }): ExtractionResult | { error: string } {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return { error: "Gemini returned malformed JSON." };
  }
  const parsed = GeminiReceiptSchema.safeParse(json);
  if (!parsed.success) return { error: "Gemini output did not match the receipt schema." };
  const fields = [
    fieldFrom("vendor", parsed.data.vendor),
    fieldFrom("receiptDate", parsed.data.receiptDate),
    fieldFrom("reference", parsed.data.reference),
    fieldFrom("currency", parsed.data.currency),
    fieldFrom("total", parsed.data.total),
    fieldFrom("category", parsed.data.category),
  ];
  return {
    ...identity,
    extractorVersion: identity.extractorVersion ?? "gemini",
    fields,
  };
}

export function readGeminiConfig(env: NodeJS.ProcessEnv = process.env): { apiKey: string; model: string } | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, model: env.GEMINI_MODEL?.trim() || "gemini-2.0-flash" };
}

export async function extractWithGemini(input: {
  apiKey: string;
  model: string;
  mimeType: string;
  bytes: Uint8Array;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string } | { error: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: GEMINI_EXTRACTION_PROMPT },
              { inline_data: { mime_type: input.mimeType, data: Buffer.from(input.bytes).toString("base64") } },
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    },
  );
  if (!response.ok) return { error: `Gemini request failed (${response.status}).` };
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") ?? "";
  if (!text) return { error: "Gemini returned no text." };
  return { text };
}
