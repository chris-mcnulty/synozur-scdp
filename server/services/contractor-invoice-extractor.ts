import { z } from "zod";
import { getAIProviderAsync, type ChatMessage, type ChatMessageContentPart } from "./ai-provider.js";
import { logAiUsage } from "./ai-service.js";
import { normalizeReceiptToDataUrls } from "./receipt-normalizer.js";
import { AI_FEATURES } from "@shared/schema";

// ─── Extraction shape ────────────────────────────────────────────────────────

export const contractorInvoiceLineSchema = z.object({
  kind: z.enum(["service", "expense"]),
  description: z.string(),
  hours: z.number().optional(),
  rate: z.number().optional(),
  amount: z.number(),
  confidence: z.number().min(0).max(1).optional(),
});

export const contractorInvoiceExtractionSchema = z.object({
  invoiceNumber: z.string(),
  invoiceDate: z.string(), // YYYY-MM-DD
  contractorName: z.string().optional(),
  engagementLabel: z.string().optional(), // e.g. "SOW-2026-Q1", "Phase 2"
  subtotalFees: z.number().optional(),
  subtotalExpenses: z.number().optional(),
  total: z.number(),
  notes: z.string().optional(),
  lines: z.array(contractorInvoiceLineSchema),
  overallConfidence: z.number().min(0).max(1),
});

export type ContractorInvoiceExtraction = z.infer<typeof contractorInvoiceExtractionSchema>;
export type ContractorInvoiceLineExtraction = z.infer<typeof contractorInvoiceLineSchema>;

// ─── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a project accounting analyst extracting structured data from contractor cost invoices.

You will be shown one or more images of a contractor invoice submitted to a professional-services firm for work performed on client projects. Extract:

{
  "invoiceNumber": string,
  "invoiceDate": "YYYY-MM-DD",
  "contractorName": string (optional — business or person name on the invoice),
  "engagementLabel": string (optional — any SOW label, engagement name, or project phase mentioned),
  "subtotalFees": number (optional — sum of service/time lines only),
  "subtotalExpenses": number (optional — sum of expense/reimbursable lines only),
  "total": number,
  "notes": string (optional — any payment terms or special notes),
  "lines": [
    {
      "kind": "service" | "expense",
      "description": string,
      "hours": number (optional — for service lines only),
      "rate": number (optional — hourly or daily rate, for service lines),
      "amount": number,
      "confidence": number 0.0-1.0
    }
  ],
  "overallConfidence": number 0.0-1.0
}

Rules:
- kind="service" for time-based lines (hours × rate). kind="expense" for pass-through costs (travel, supplies, etc.).
- Pull all amounts as raw numbers — no currency symbols or commas.
- Dates in ISO YYYY-MM-DD format only. If month only, use the 1st.
- If you can calculate hours × rate = amount, verify it before including.
- If the document is illegible or not an invoice, return total: 0 and an empty lines array with overallConfidence: 0.
- Return ONLY the JSON object — no markdown fences, no commentary.`;

// ─── Result shape ─────────────────────────────────────────────────────────────

export interface ContractorInvoiceExtractionResult {
  data: ContractorInvoiceExtraction;
  ran: boolean;
  reason?: string;
  raw?: string;
}

interface ExtractArgs {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  tenantId: string;
  userId?: string;
}

// ─── Main extractor ───────────────────────────────────────────────────────────

export async function extractContractorInvoice(
  args: ExtractArgs,
): Promise<ContractorInvoiceExtractionResult> {
  const { buffer, contentType, fileName, tenantId, userId } = args;

  let normalized;
  try {
    normalized = await normalizeReceiptToDataUrls(buffer, contentType, fileName);
  } catch (err: any) {
    return emptyResult(false, `Normalization failed: ${err.message || err}`);
  }

  const isPdf = contentType.toLowerCase().includes("pdf");
  const placeholderOnly =
    isPdf && normalized.every((n: any) => n.conversionNote?.includes("placeholder"));
  if (placeholderOnly) {
    return emptyResult(
      false,
      "PDF rendering is not enabled. Enter line items manually or re-upload as an image.",
    );
  }

  const imageParts: ChatMessageContentPart[] = normalized
    .filter((n: any) => n.contentType.startsWith("image/"))
    .map((n: any) => ({
      type: "image_url" as const,
      image_url: { url: n.dataUrl, detail: "high" as const },
    }));

  if (imageParts.length === 0) {
    return emptyResult(false, "No renderable image pages produced from upload.");
  }

  const userContent: ChatMessageContentPart[] = [
    {
      type: "text",
      text: `Extract structured invoice data from the following ${imageParts.length} page(s).`,
    },
    ...imageParts,
  ];

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  const provider = await getAIProviderAsync();
  const startTime = Date.now();
  let raw = "";

  try {
    const result = await provider.chatCompletion({
      messages,
      responseFormat: "json",
      maxTokens: 4096,
    });
    raw = result.content;
    logAiUsage(
      { tenantId, userId, feature: AI_FEATURES.VENDOR_INVOICE_EXTRACTION },
      provider,
      result,
      Date.now() - startTime,
    );
  } catch (err: any) {
    logAiUsage(
      { tenantId, userId, feature: AI_FEATURES.VENDOR_INVOICE_EXTRACTION },
      provider,
      null,
      Date.now() - startTime,
      err,
    );
    return emptyResult(false, `Extraction failed: ${err.message || err}`);
  }

  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { data: emptyExtraction(), ran: true, reason: "Model returned non-JSON output", raw };
  }

  const validation = contractorInvoiceExtractionSchema.safeParse(parsed);
  if (!validation.success) {
    return {
      data: coerceFallback(parsed),
      ran: true,
      reason: `Validation failed: ${validation.error.issues.slice(0, 3).map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      raw,
    };
  }

  return { data: validation.data, ran: true, raw };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyExtraction(): ContractorInvoiceExtraction {
  return {
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    total: 0,
    lines: [],
    overallConfidence: 0,
  };
}

function emptyResult(ran: boolean, reason: string): ContractorInvoiceExtractionResult {
  return { data: emptyExtraction(), ran, reason };
}

function coerceFallback(parsed: unknown): ContractorInvoiceExtraction {
  const fallback = emptyExtraction();
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, any>;
    if (typeof obj.invoiceNumber === "string") fallback.invoiceNumber = obj.invoiceNumber;
    if (typeof obj.invoiceDate === "string") fallback.invoiceDate = obj.invoiceDate;
    if (typeof obj.total === "number") fallback.total = obj.total;
    if (typeof obj.contractorName === "string") fallback.contractorName = obj.contractorName;
  }
  return fallback;
}
