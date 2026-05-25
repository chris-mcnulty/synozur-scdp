import { z } from "zod";
import { getAIProviderAsync, type ChatMessage, type ChatMessageContentPart } from "./ai-provider.js";
import { logAiUsage } from "./ai-service.js";
import { normalizeReceiptToDataUrls, type NormalizedReceipt } from "./receipt-normalizer.js";
import { AI_FEATURES, vendorInvoiceExtractionSchema, type VendorInvoiceExtraction } from "@shared/schema";

const SYSTEM_PROMPT = `You are an accounts-payable analyst extracting structured data from contractor invoices.

You will be shown one or more images of an invoice. Your job is to return strict JSON that conforms to this shape:

{
  "vendorName": string,
  "vendorBusinessId": string?,
  "vendorInvoiceNumber": string,
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD" (optional),
  "currency": "USD" | "CAD" | "EUR" | "GBP" | other ISO-4217 (default "USD"),
  "subtotal": number (optional),
  "taxAmount": number (optional),
  "total": number,
  "notes": string (optional),
  "lines": [
    {
      "kind": "service" | "expense" | "tax" | "discount" | "other",
      "description": string,
      "periodStart": "YYYY-MM-DD" (optional, for service lines),
      "periodEnd": "YYYY-MM-DD" (optional, for service lines),
      "quantity": number (optional),
      "unit": "hours" | "each" | "mile" | "day" (optional),
      "unitAmount": number (optional),
      "lineAmount": number,
      "expenseCategory": string (optional, only for kind=expense — one of: travel, hotel, meals, taxi, airfare, parking, entertainment, mileage, perdiem, other),
      "projectHint": string (optional — any project name or code that appears near this line),
      "confidence": number 0.0-1.0
    }
  ],
  "overallConfidence": number 0.0-1.0
}

Rules:
- Classify each line as "service" (time-based, billed in hours/days) or "expense" (reimbursable cost). Tax / discount / other are passthrough lines.
- Pull amounts as raw numbers (no currency symbols, no commas).
- Dates: ISO format only. If only a month is given, use the 1st of that month.
- Set confidence per line and overall based on legibility and how confident you are in each field.
- If the invoice is illegible or doesn't look like an invoice, return total: 0 and an empty lines array with overallConfidence: 0.
- Return ONLY the JSON object — no markdown fences, no commentary.`;

export interface VendorInvoiceExtractionResult {
  /** Parsed and Zod-validated extraction payload. */
  data: VendorInvoiceExtraction;
  /** Whether the extractor actually ran the LLM (false when we short-circuited). */
  ran: boolean;
  /** Why we couldn't extract — set when `ran` is false or output failed validation. */
  reason?: string;
  /** Raw model output for audit / training. */
  raw?: string;
}

interface ExtractArgs {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  tenantId: string;
  userId?: string;
}

/**
 * Run an LLM vision extraction over an uploaded invoice document.
 *
 * v1 limitations:
 * - Image formats (JPEG, PNG, HEIC, HEIF) extract well.
 * - PDFs are not natively renderable (Puppeteer is disabled in production),
 *   so we short-circuit and return `ran: false`. The caller should create a
 *   draft vendor invoice with no lines and let the user enter them manually.
 */
export async function extractVendorInvoice(
  args: ExtractArgs,
): Promise<VendorInvoiceExtractionResult> {
  const { buffer, contentType, fileName, tenantId, userId } = args;

  let normalized: NormalizedReceipt[];
  try {
    normalized = await normalizeReceiptToDataUrls(buffer, contentType, fileName);
  } catch (err: any) {
    return emptyResult(false, `Normalization failed: ${err.message || err}`);
  }

  const isPdf = contentType.toLowerCase().includes("pdf");
  const placeholderOnly =
    isPdf && normalized.every(n => n.conversionNote?.includes("placeholder"));
  if (placeholderOnly) {
    return emptyResult(
      false,
      "PDF rendering is not enabled. Enter line items manually or re-upload as an image.",
    );
  }

  const imageParts: ChatMessageContentPart[] = normalized
    .filter(n => n.contentType.startsWith("image/"))
    .map(n => ({ type: "image_url" as const, image_url: { url: n.dataUrl, detail: "high" as const } }));

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

  // Robust JSON parse — strip code fences if the model wrapped output.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      data: emptyExtraction(),
      ran: true,
      reason: "Model returned non-JSON output",
      raw,
    };
  }

  const validation = vendorInvoiceExtractionSchema.safeParse(parsed);
  if (!validation.success) {
    return {
      data: coerceFallbackExtraction(parsed),
      ran: true,
      reason: `Validation failed: ${formatZodError(validation.error)}`,
      raw,
    };
  }

  return { data: validation.data, ran: true, raw };
}

function emptyExtraction(): VendorInvoiceExtraction {
  return {
    vendorInvoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    currency: "USD",
    total: 0,
    lines: [],
  };
}

function emptyResult(ran: boolean, reason: string): VendorInvoiceExtractionResult {
  return { data: emptyExtraction(), ran, reason };
}

function coerceFallbackExtraction(parsed: unknown): VendorInvoiceExtraction {
  // Best-effort partial parse. We accept whatever fields validate and drop
  // the rest, so the caller can show the user something rather than nothing.
  const fallback = emptyExtraction();
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, any>;
    if (typeof obj.vendorInvoiceNumber === "string") fallback.vendorInvoiceNumber = obj.vendorInvoiceNumber;
    if (typeof obj.invoiceDate === "string") fallback.invoiceDate = obj.invoiceDate;
    if (typeof obj.currency === "string") fallback.currency = obj.currency;
    if (typeof obj.total === "number") fallback.total = obj.total;
    if (typeof obj.vendorName === "string") fallback.vendorName = obj.vendorName;
  }
  return fallback;
}

function formatZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 3)
    .map(i => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
}
