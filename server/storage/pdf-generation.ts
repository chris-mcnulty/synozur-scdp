import {
  type Client, type Project,
  type InvoiceBatch, type InvoiceLine, type InvoiceAdjustment,
  expenses, expenseAttachments
} from "@shared/schema";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { db } from "../db";
import { normalizeAmount, round2, calculateEffectiveTaxAmount } from "./helpers";
import { receiptStorage } from "../services/receipt-storage";
import { normalizeReceiptBatch, type NormalizedReceipt } from "../services/receipt-normalizer";

const __pdfGenFilename = fileURLToPath(import.meta.url);
const __pdfGenDirname = path.dirname(__pdfGenFilename);
const _pdfGenProjectRoot = path.resolve(__pdfGenDirname, '..', '..');
let _synozurLogoDataUri: string | undefined;
try {
  const _logoPath = path.join(_pdfGenProjectRoot, 'client', 'src', 'assets', 'logos', 'SA-Logo-Horizontal-color.png');
  const _logoBuffer = fs.readFileSync(_logoPath);
  _synozurLogoDataUri = `data:image/png;base64,${_logoBuffer.toString('base64')}`;
} catch {
  // logo file not available — footer will degrade gracefully
}

function formatDateInTimezone(date: Date, timezone: string): string {
  try {
    return date.toLocaleDateString('en-US', { timeZone: timezone });
  } catch {
    return date.toLocaleDateString('en-US');
  }
}

function getNowInTimezone(timezone: string): Date {
  const nowStr = new Date().toLocaleString('en-US', { timeZone: timezone });
  return new Date(nowStr);
}

// Helper function to calculate due date based on payment terms
function calculateDueDate(paymentTerms?: string, baseDate?: Date | string | null, timezone: string = 'America/New_York'): string {
  let startDate: Date;
  if (baseDate) {
    if (typeof baseDate === 'string') {
      const [year, month, day] = baseDate.split('-').map(Number);
      startDate = new Date(year, month - 1, day);
    } else {
      startDate = new Date(baseDate);
    }
  } else {
    startDate = getNowInTimezone(timezone);
  }
  
  let daysToAdd = 30; // Default to Net 30
  
  if (paymentTerms) {
    const lowerTerms = paymentTerms.toLowerCase();
    if (lowerTerms.includes('due upon receipt') || lowerTerms.includes('due on receipt')) {
      daysToAdd = 0;
    } else if (lowerTerms.includes('net 7')) {
      daysToAdd = 7;
    } else if (lowerTerms.includes('net 10')) {
      daysToAdd = 10;
    } else if (lowerTerms.includes('net 15')) {
      daysToAdd = 15;
    } else if (lowerTerms.includes('net 21')) {
      daysToAdd = 21;
    } else if (lowerTerms.includes('net 30')) {
      daysToAdd = 30;
    } else if (lowerTerms.includes('net 45')) {
      daysToAdd = 45;
    } else if (lowerTerms.includes('net 60')) {
      daysToAdd = 60;
    } else if (lowerTerms.includes('net 90')) {
      daysToAdd = 90;
    } else {
      // Try to extract number from terms (e.g., "Net 25")
      const match = lowerTerms.match(/net\s*(\d+)/);
      if (match) {
        daysToAdd = parseInt(match[1], 10);
      }
    }
  }
  
  const dueDate = new Date(startDate);
  dueDate.setDate(dueDate.getDate() + daysToAdd);
  return formatDateInTimezone(dueDate, timezone);
}

// Expense category code to friendly label mapping
const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  travel: "Travel",
  hotel: "Hotel",
  meals: "Meals",
  taxi: "Taxi/Transportation",
  airfare: "Airfare",
  carrental: "Car Rental",
  parking: "Parking",
  entertainment: "Entertainment",
  other: "Other",
  mileage: "Mileage",
  perdiem: "Per Diem",
};


export async function generateInvoicePDF(params: {
  batch: InvoiceBatch & { totalLinesCount: number; clientCount: number; projectCount: number };
  lines: (InvoiceLine & { project: Project; client: Client })[];
  adjustments: InvoiceAdjustment[];
  companySettings: {
    companyName: string | undefined;
    companyLogo?: string | undefined;
    companyAddress?: string | undefined;  
    companyPhone?: string | undefined;
    companyEmail?: string | undefined;
    companyWebsite?: string | undefined;
    paymentTerms?: string | undefined;
    showConstellationFooter?: boolean;
  };
  timezone?: string;
}): Promise<Buffer> {
  const { batch, lines, adjustments, companySettings, timezone = 'America/New_York' } = params;
  const tz = timezone;

  // Group lines by client and project
  const groupedLines: { client: Client; project: Project; lines: any[] }[] = [];
  const clientProjectMap: { [key: string]: { client: Client; project: Project; lines: any[] } } = {};
  
  for (const line of lines) {
    const key = `${line.client.id}-${line.project.id}`;
    if (!clientProjectMap[key]) {
      clientProjectMap[key] = {
        client: line.client,
        project: line.project,
        lines: []
      };
    }
    
    // Prepare line data for template
    const originalAmount = parseFloat(line.originalAmount || line.amount || '0');
    // Use billedAmount if it's explicitly set (including 0), otherwise use amount
    const billedAmount = line.billedAmount !== null && line.billedAmount !== undefined
      ? parseFloat(String(line.billedAmount))
      : parseFloat(line.amount || '0');
    const variance = billedAmount - originalAmount;
    
    // Convert expense category code to friendly label
    const expenseCategoryLabel = line.expenseCategory 
      ? (EXPENSE_CATEGORY_LABELS[line.expenseCategory] || line.expenseCategory)
      : null;
    
    // Check if this line has currency conversion info
    const hasCurrencyConversion = line.originalCurrency && line.originalCurrencyAmount && line.exchangeRate;
    
    const lineData = {
      ...line,
      originalAmount: originalAmount.toFixed(2),
      billedAmount: billedAmount.toFixed(2),
      varianceAmount: Math.abs(variance).toFixed(2),
      varianceIsPositive: variance >= 0,
      amount: parseFloat(line.amount || '0').toFixed(2),
      rate: line.rate ? parseFloat(line.rate).toFixed(2) : null,
      expenseCategory: expenseCategoryLabel, // Use friendly label instead of code
      // Currency conversion display
      hasCurrencyConversion,
      originalCurrency: line.originalCurrency || null,
      originalCurrencyAmount: line.originalCurrencyAmount ? parseFloat(line.originalCurrencyAmount).toFixed(2) : null,
      exchangeRate: line.exchangeRate ? parseFloat(line.exchangeRate).toFixed(4) : null
    };
    
    clientProjectMap[key].lines.push(lineData);
  }

  // Convert to array and sort lines within each group by date
  for (const group of Object.values(clientProjectMap)) {
    // Sort lines by date (extracted from description if present, e.g., "... (2024-01-15)")
    group.lines.sort((a, b) => {
      // Try to extract date from description - format: "... (YYYY-MM-DD)" at end
      const dateRegex = /\((\d{4}-\d{2}-\d{2})\)\s*$/;
      const matchA = a.description?.match(dateRegex);
      const matchB = b.description?.match(dateRegex);
      
      const dateA = matchA ? matchA[1] : (a.date || '');
      const dateB = matchB ? matchB[1] : (b.date || '');
      
      return dateA.localeCompare(dateB);
    });
    groupedLines.push(group);
  }

  // Calculate totals
  const subtotal = lines.reduce((sum, line) => {
    // Use billedAmount if it's explicitly set (including 0), otherwise use amount
    const amount = line.billedAmount !== null && line.billedAmount !== undefined 
      ? line.billedAmount 
      : line.amount || '0';
    return sum + parseFloat(String(amount));
  }, 0);

  // Calculate taxable subtotal (only lines marked as taxable)
  const taxableSubtotal = lines.reduce((sum, line) => {
    // Skip non-taxable lines (like expenses)
    if (line.taxable === false) return sum;
    const amount = line.billedAmount !== null && line.billedAmount !== undefined 
      ? line.billedAmount 
      : line.amount || '0';
    return sum + parseFloat(String(amount));
  }, 0);

  // Calculate non-taxable subtotal for display
  const nonTaxableSubtotal = subtotal - taxableSubtotal;

  const discountAmount = batch.discountAmount ? parseFloat(batch.discountAmount) : 0;
  const originalTotal = lines.reduce((sum, line) => sum + parseFloat(line.originalAmount || line.amount || '0'), 0);
  const totalAdjustments = subtotal - originalTotal;
  const subtotalAfterDiscount = subtotal - discountAmount;
  
  // Calculate taxable amount after proportional discount allocation
  const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0;
  const taxableAfterDiscount = taxableSubtotal - (taxableSubtotal * discountRatio);
  
  // Calculate tax (only on taxable items, not expenses)
  // Respects manual override if set
  const taxRate = batch.taxRate ? parseFloat(batch.taxRate) : 0;
  const taxAmountOverride = batch.taxAmountOverride ? parseFloat(batch.taxAmountOverride) : null;
  const taxAmount = calculateEffectiveTaxAmount(taxableAfterDiscount, taxRate, taxAmountOverride);
  const isManualTaxOverride = taxAmountOverride !== null;
  // Calculate effective tax percentage for display purposes
  const effectiveTaxPercent = taxableAfterDiscount > 0 ? round2((taxAmount / taxableAfterDiscount) * 100) : 0;
  
  const total = subtotalAfterDiscount + taxAmount;

  // Get unique clients
  const uniqueClients = Array.from(new Set(lines.map(l => l.client.id))).map(clientId => {
    return lines.find(l => l.client.id === clientId)!.client;
  });

  // Strip internal-only audit records — they must never appear on a client-facing PDF
  const clientFacingAdjustments = adjustments.filter(adj => adj.scope !== 'force_unfinalize');

  const hasAdjustments = clientFacingAdjustments.length > 0 || lines.some(l => l.billedAmount && l.billedAmount !== l.amount);
  
  // Check if any lines have currency conversions
  const hasCurrencyConversions = lines.some(l => l.originalCurrency && l.originalCurrencyAmount);
  
  // Determine invoice currency (from first client or default to USD)
  const invoiceCurrency = uniqueClients[0]?.currency || 'USD';

  // Fetch receipt attachments for expense lines
  console.log('[PDF] Fetching receipt attachments for invoice...');
  const receiptImages: NormalizedReceipt[] = [];
  // Collect PDF receipts separately for merging at end (instead of rendering as images)
  const pdfReceiptBuffers: { buffer: Buffer; originalName: string }[] = [];
  const MAX_RECEIPTS_PER_INVOICE = 50; // Limit to prevent oversized PDFs
  const MAX_PDF_RECEIPTS = 20; // Limit number of PDF receipts to merge
  const MAX_TOTAL_PDF_SIZE_MB = 50; // Max total size for all PDF receipts
  let receiptsLimitExceeded = false;
  let totalReceiptsFound = 0;
  let currentPdfTotalSize = 0;
  
  try {
    // Get all expense lines from the invoice
    const expenseLines = lines.filter(line => line.type === 'expense');
    
    if (expenseLines.length > 0) {
      console.log(`[PDF] Found ${expenseLines.length} expense line(s) in invoice`);
      
      // Use sourceExpenseId for precise matching — prevents cross-batch contamination
      // that occurred with the old broad project+date-range+billedFlag query, which
      // incorrectly pulled in expenses from other previously-billed batches sharing
      // the same project and overlapping date window.
      const sourceExpenseIds = expenseLines
        .map((l: any) => l.sourceExpenseId)
        .filter(Boolean) as string[];
      
      let invoiceExpenses: any[] = [];
      
      if (sourceExpenseIds.length > 0) {
        invoiceExpenses = await db.select()
          .from(expenses)
          .where(inArray(expenses.id, sourceExpenseIds));
        console.log(`[PDF] Found ${invoiceExpenses.length} expense(s) via sourceExpenseId (precise match)`);
      } else {
        // Legacy fallback: lines predate sourceExpenseId; use project+date range
        const projectIds = Array.from(new Set(lines.map((l: any) => l.project.id)));
        invoiceExpenses = await db.select()
          .from(expenses)
          .where(
            and(
              inArray(expenses.projectId, projectIds),
              gte(expenses.date, batch.startDate),
              lte(expenses.date, batch.endDate),
              eq(expenses.billedFlag, true)
            )
          );
        console.log(`[PDF] Found ${invoiceExpenses.length} billed expense(s) via date range (legacy fallback)`);
      }
      
      if (invoiceExpenses.length > 0) {
        // Fetch all attachments for these expenses from expenseAttachments table
        const expenseIds = invoiceExpenses.map(e => e.id);
        const attachments = await db.select()
          .from(expenseAttachments)
          .where(inArray(expenseAttachments.expenseId, expenseIds));
        
        // Also collect expenses with direct receiptUrl (legacy/simple upload method)
        const expensesWithReceiptUrl = invoiceExpenses.filter(e => e.receiptUrl);
        
        console.log(`[PDF] Found ${attachments.length} attachment(s) and ${expensesWithReceiptUrl.length} direct receiptUrl(s)`);
        totalReceiptsFound = attachments.length + expensesWithReceiptUrl.length;
        
        // Apply limit to prevent oversized PDFs
        const attachmentsToInclude = attachments.slice(0, MAX_RECEIPTS_PER_INVOICE);
        const remainingSlots = MAX_RECEIPTS_PER_INVOICE - attachmentsToInclude.length;
        const receiptUrlsToInclude = expensesWithReceiptUrl.slice(0, remainingSlots);
        
        if (totalReceiptsFound > MAX_RECEIPTS_PER_INVOICE) {
          receiptsLimitExceeded = true;
          console.warn(`[PDF] Receipt limit exceeded: ${totalReceiptsFound} found, including first ${MAX_RECEIPTS_PER_INVOICE}`);
        }
        
        // Download and process attachments from expenseAttachments table
        if (attachmentsToInclude.length > 0) {
          const receiptsToProcess = await Promise.all(
            attachmentsToInclude.map(async (attachment) => {
              try {
                // Download receipt from storage
                const receiptBuffer = await receiptStorage.getReceipt(attachment.itemId);
                return {
                  buffer: receiptBuffer,
                  contentType: attachment.contentType,
                  originalName: attachment.fileName
                };
              } catch (error) {
                console.error(`[PDF] Failed to download receipt ${attachment.fileName}:`, error);
                return null;
              }
            })
          );
          
          // Filter out failed downloads
          const validReceipts = receiptsToProcess.filter(r => r !== null) as Array<{ 
            buffer: Buffer; 
            contentType: string; 
            originalName: string 
          }>;
          
          // Separate PDF receipts from image receipts
          const imageReceipts: typeof validReceipts = [];
          for (const receipt of validReceipts) {
            const isPdf = receipt.contentType.includes('pdf') || 
                          receipt.originalName.toLowerCase().endsWith('.pdf');
            if (isPdf) {
              // Collect PDF buffers for merging at end of invoice (with limits)
              const pdfSizeBytes = receipt.buffer.length;
              const pdfSizeMB = pdfSizeBytes / (1024 * 1024);
              
              if (pdfReceiptBuffers.length >= MAX_PDF_RECEIPTS) {
                console.log(`[PDF] Skipping PDF receipt (max count reached): ${receipt.originalName}`);
                receiptsLimitExceeded = true;
              } else if (currentPdfTotalSize + pdfSizeBytes > MAX_TOTAL_PDF_SIZE_MB * 1024 * 1024) {
                console.log(`[PDF] Skipping PDF receipt (size limit reached): ${receipt.originalName} (${pdfSizeMB.toFixed(1)}MB)`);
                receiptsLimitExceeded = true;
              } else {
                pdfReceiptBuffers.push({
                  buffer: receipt.buffer,
                  originalName: receipt.originalName
                });
                currentPdfTotalSize += pdfSizeBytes;
                console.log(`[PDF] Collected PDF receipt for merging: ${receipt.originalName} (${pdfSizeMB.toFixed(1)}MB)`);
              }
            } else {
              imageReceipts.push(receipt);
            }
          }
          
          // Normalize only image receipts for embedding in invoice HTML
          if (imageReceipts.length > 0) {
            console.log(`[PDF] Normalizing ${imageReceipts.length} image receipt(s)...`);
            const normalizedReceipts = await normalizeReceiptBatch(imageReceipts);
            
            // Add successfully normalized receipts to the array
            normalizedReceipts.forEach(receipt => {
              if (receipt) {
                receiptImages.push(receipt);
              }
            });
          }
        }
        
        // Download and process receipts from direct receiptUrl field
        if (receiptUrlsToInclude.length > 0) {
          console.log(`[PDF] Fetching ${receiptUrlsToInclude.length} direct receiptUrl receipt(s)...`);
          const directReceipts = await Promise.all(
            receiptUrlsToInclude.map(async (expense) => {
              try {
                // Fetch receipt from URL
                const response = await fetch(expense.receiptUrl!);
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}`);
                }
                const buffer = Buffer.from(await response.arrayBuffer());
                const contentType = response.headers.get('content-type') || 'image/jpeg';
                // Create a filename from the expense description or ID
                const originalName = `receipt-${expense.description || expense.id}.${contentType.includes('pdf') ? 'pdf' : contentType.includes('png') ? 'png' : 'jpg'}`;
                return {
                  buffer,
                  contentType,
                  originalName
                };
              } catch (error) {
                console.error(`[PDF] Failed to fetch receipt from URL for expense ${expense.id}:`, error);
                return null;
              }
            })
          );
          
          // Filter out failed downloads
          const validDirectReceipts = directReceipts.filter(r => r !== null) as Array<{ 
            buffer: Buffer; 
            contentType: string; 
            originalName: string 
          }>;
          
          // Separate PDF receipts from image receipts (same as above)
          const directImageReceipts: typeof validDirectReceipts = [];
          for (const receipt of validDirectReceipts) {
            const isPdf = receipt.contentType.includes('pdf') || 
                          receipt.originalName.toLowerCase().endsWith('.pdf');
            if (isPdf) {
              // Collect PDF buffers for merging at end of invoice (with limits)
              const pdfSizeBytes = receipt.buffer.length;
              const pdfSizeMB = pdfSizeBytes / (1024 * 1024);
              
              if (pdfReceiptBuffers.length >= MAX_PDF_RECEIPTS) {
                console.log(`[PDF] Skipping PDF receipt (max count reached): ${receipt.originalName}`);
                receiptsLimitExceeded = true;
              } else if (currentPdfTotalSize + pdfSizeBytes > MAX_TOTAL_PDF_SIZE_MB * 1024 * 1024) {
                console.log(`[PDF] Skipping PDF receipt (size limit reached): ${receipt.originalName} (${pdfSizeMB.toFixed(1)}MB)`);
                receiptsLimitExceeded = true;
              } else {
                pdfReceiptBuffers.push({
                  buffer: receipt.buffer,
                  originalName: receipt.originalName
                });
                currentPdfTotalSize += pdfSizeBytes;
                console.log(`[PDF] Collected PDF receipt (from URL) for merging: ${receipt.originalName} (${pdfSizeMB.toFixed(1)}MB)`);
              }
            } else {
              directImageReceipts.push(receipt);
            }
          }
          
          // Normalize only image receipts
          if (directImageReceipts.length > 0) {
            console.log(`[PDF] Normalizing ${directImageReceipts.length} direct URL image receipt(s)...`);
            const normalizedDirectReceipts = await normalizeReceiptBatch(directImageReceipts);
            
            normalizedDirectReceipts.forEach(receipt => {
              if (receipt) {
                receiptImages.push(receipt);
              }
            });
          }
        }
        
        console.log(`[PDF] Successfully normalized ${receiptImages.length} total receipt(s)`);
      }
    }
  } catch (error) {
    console.error('[PDF] Error fetching receipt attachments:', error);
    // Continue with PDF generation even if receipt fetching fails
  }

  // Prepare template data
  const templateData = {
    // Company info
    companyName: companySettings.companyName || 'Your Company Name',
    companyLogo: companySettings.companyLogo,
    companyAddress: companySettings.companyAddress,
    companyPhone: companySettings.companyPhone,
    companyEmail: companySettings.companyEmail,
    companyWebsite: companySettings.companyWebsite,
    // Use batch-specific payment terms if available, otherwise fall back to global setting
    paymentTerms: batch.paymentTerms || companySettings.paymentTerms,
    // Show Constellation footer (tenant-level setting, defaults to true)
    showConstellationFooter: companySettings.showConstellationFooter ?? true,
    synozurLogoDataUri: _synozurLogoDataUri,
    
    // Batch info
    batchId: batch.batchId,
    glInvoiceNumber: batch.glInvoiceNumber, // External GL system invoice number
    startDate: batch.startDate,
    endDate: batch.endDate,
    status: batch.status,
    generatedDate: formatDateInTimezone(getNowInTimezone(tz), tz),
    totalProjects: batch.projectCount,
    totalLines: batch.totalLinesCount,
    
    // Invoice header details (legacy format) - use asOfDate for invoice date and due date calculation
    invoiceDate: batch.asOfDate 
      ? formatDateInTimezone(new Date(batch.asOfDate + 'T00:00:00'), tz)
      : formatDateInTimezone(getNowInTimezone(tz), tz),
    dueDate: calculateDueDate(batch.paymentTerms || companySettings.paymentTerms, batch.asOfDate, tz),
    paymentMethod: uniqueClients[0]?.paymentMethod || 'ACH Transfer',
    
    // Client info
    uniqueClients,
    
    // Currency info
    invoiceCurrency,
    hasCurrencyConversions,

    // Multi-currency batch info (quote vs cost)
    quoteCurrency: (batch.quoteCurrency || 'USD').toUpperCase(),
    costCurrency: (batch.costCurrency || 'USD').toUpperCase(),
    exchangeRate: batch.exchangeRate ? parseFloat(batch.exchangeRate).toFixed(4) : null,
    exchangeRateLockedAt: batch.exchangeRateLockedAt
      ? formatDateInTimezone(new Date(batch.exchangeRateLockedAt), tz)
      : null,
    exchangeRateSource: batch.exchangeRateSource || null,
    hasDualCurrency: !!(
      batch.quoteCurrency &&
      batch.costCurrency &&
      batch.quoteCurrency.toUpperCase() !== batch.costCurrency.toUpperCase() &&
      batch.exchangeRate &&
      parseFloat(batch.exchangeRate) > 0
    ),
    quoteSubtotal: batch.exchangeRate && parseFloat(batch.exchangeRate) > 0
      ? (subtotal / parseFloat(batch.exchangeRate)).toFixed(2)
      : null,
    quoteSubtotalAfterDiscount: batch.exchangeRate && parseFloat(batch.exchangeRate) > 0
      ? (subtotalAfterDiscount / parseFloat(batch.exchangeRate)).toFixed(2)
      : null,
    quoteTaxAmount: batch.exchangeRate && parseFloat(batch.exchangeRate) > 0 && taxAmount > 0
      ? (taxAmount / parseFloat(batch.exchangeRate)).toFixed(2)
      : null,
    quoteTotal: batch.exchangeRate && parseFloat(batch.exchangeRate) > 0
      ? (total / parseFloat(batch.exchangeRate)).toFixed(2)
      : null,
    
    // Line items
    groupedLines,
    hasAdjustments,
    columnCount: hasAdjustments ? 7 : 6,
    
    // Adjustments (system-only audit scopes already stripped above)
    adjustments: clientFacingAdjustments.map(adj => ({
      reason: adj.reason,
      targetAmount: adj.targetAmount ? parseFloat(adj.targetAmount).toFixed(2) : '0',
      method: adj.method,
      sowNumber: adj.metadata ? (adj.metadata as any).sowNumber : null
    })),
    
    // Totals
    subtotal: subtotal.toFixed(2),
    discountAmount: discountAmount > 0 ? discountAmount.toFixed(2) : null,
    discountPercent: batch.discountPercent ? parseFloat(batch.discountPercent).toFixed(1) : null,
    subtotalAfterDiscount: subtotalAfterDiscount.toFixed(2),
    taxRate: taxRate > 0 ? taxRate.toFixed(2) : null,
    taxAmount: taxAmount > 0 ? taxAmount.toFixed(2) : null,
    taxAmountOverride: batch.taxAmountOverride ? parseFloat(batch.taxAmountOverride).toFixed(2) : null,
    isManualTaxOverride,
    effectiveTaxPercent: effectiveTaxPercent > 0 ? effectiveTaxPercent.toFixed(2) : null,
    originalTotal: originalTotal.toFixed(2),
    totalAdjustments: totalAdjustments.toFixed(2),
    totalAdjustmentIsPositive: totalAdjustments >= 0,
    total: total.toFixed(2),
    
    // Receipt images (embedded in invoice body)
    receiptImages,
    hasReceipts: receiptImages.length > 0 || pdfReceiptBuffers.length > 0,
    hasImageReceipts: receiptImages.length > 0,
    hasPdfReceipts: pdfReceiptBuffers.length > 0,
    pdfReceiptsCount: pdfReceiptBuffers.length,
    receiptsLimitExceeded,
    totalReceiptsFound,
    maxReceiptsPerInvoice: MAX_RECEIPTS_PER_INVOICE
  };

  // Load template
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, '..');
  const templatePath = path.join(projectRoot, 'server', 'invoice-template.html');
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const template = Handlebars.compile(templateSource);
  
  // Generate HTML
  const html = template(templateData);
  
  // Generate PDF using Puppeteer
  let browser;
  try {
    // Determine Chromium executable path
    // Use environment variable if set, otherwise find system Chromium
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    
    if (!executablePath) {
      // Try to find chromium in PATH
      try {
        const { execSync } = await import('child_process');
        executablePath = execSync('which chromium').toString().trim();
        console.log('[PDF] Using system Chromium:', executablePath);
      } catch {
        // Fallback to common path
        executablePath = 'chromium';
        console.log('[PDF] Using fallback chromium path');
      }
    } else {
      console.log('[PDF] Using Chromium from environment variable:', executablePath);
    }
    
    // Configure launch args for serverless/containerized environments
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--single-process',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update'
    ];
    
    console.log('[PDF] Launching Chromium for PDF generation...');
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: launchArgs,
      timeout: 120000 // 2 minutes for browser launch
    });
    
    const page = await browser.newPage();
    // Set a longer timeout for page operations
    page.setDefaultNavigationTimeout(120000); // 2 minutes
    page.setDefaultTimeout(120000); // 2 minutes
    
    // Use 'domcontentloaded' instead of 'networkidle0' for faster rendering
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',  
        left: '0.5in'
      }
    });
    
    // Close browser before merging PDFs
    await browser.close();
    browser = undefined;
    
    // If we have PDF receipts to merge, append them to the invoice
    if (pdfReceiptBuffers.length > 0) {
      console.log(`[PDF] Merging ${pdfReceiptBuffers.length} PDF receipt(s) to invoice...`);
      
      const MAX_TOTAL_PAGES = 100; // Global limit on total appended pages
      let totalPagesAppended = 0;
      
      try {
        // Load the invoice PDF we just generated
        const invoicePdf = await PDFDocument.load(pdf);
        
        // Process each PDF receipt
        for (const pdfReceipt of pdfReceiptBuffers) {
          // Check global page limit
          if (totalPagesAppended >= MAX_TOTAL_PAGES) {
            console.log(`[PDF] Reached global page limit (${MAX_TOTAL_PAGES}), skipping remaining PDFs`);
            break;
          }
          
          try {
            console.log(`[PDF] Appending PDF: ${pdfReceipt.originalName}`);
            
            // Load the receipt PDF
            const receiptPdf = await PDFDocument.load(pdfReceipt.buffer, {
              ignoreEncryption: true // Try to load even if encrypted
            });
            
            // Get all pages from the receipt PDF
            const pageCount = receiptPdf.getPageCount();
            console.log(`[PDF]   - ${pdfReceipt.originalName} has ${pageCount} page(s)`);
            
            // Calculate pages to copy (per-receipt and global limits)
            const perReceiptLimit = 5; // Max 5 pages per PDF receipt
            const remainingGlobalSlots = MAX_TOTAL_PAGES - totalPagesAppended;
            const pagesToCopy = Math.min(pageCount, perReceiptLimit, remainingGlobalSlots);
            
            const copiedPages = await invoicePdf.copyPages(
              receiptPdf, 
              Array.from({ length: pagesToCopy }, (_, i) => i)
            );
            
            // Add each copied page to the invoice
            for (const copiedPage of copiedPages) {
              invoicePdf.addPage(copiedPage);
              totalPagesAppended++;
            }
            
            if (pageCount > pagesToCopy) {
              console.log(`[PDF]   - Truncated to ${pagesToCopy} pages (had ${pageCount})`);
            }
          } catch (receiptError) {
            console.error(`[PDF] Failed to merge PDF receipt ${pdfReceipt.originalName}:`, receiptError);
            // Continue with other receipts even if one fails
          }
        }
        
        // Save the merged PDF
        const mergedPdfBytes = await invoicePdf.save();
        console.log(`[PDF] Successfully merged PDF receipts. Total pages appended: ${totalPagesAppended}. Final size: ${Math.round(mergedPdfBytes.length / 1024)}KB`);
        
        return Buffer.from(mergedPdfBytes);
      } catch (mergeError) {
        console.error('[PDF] Failed to merge PDF receipts, returning invoice without attachments:', mergeError);
        // Return the original invoice if merging fails
        return Buffer.from(pdf);
      }
    }
    
    return Buffer.from(pdf);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Sub-SOW PDF generation
interface SubSOWPdfInput {
  tenantName: string;
  tenantLogo?: string | null;
  projectName: string;
  clientName: string;
  resourceName: string;
  resourceEmail: string;
  resourceRole: string;
  isSalaried: boolean;
  totalHours: number;
  totalCost: number;
  assignments: Array<{
    epicName?: string;
    stageName?: string;
    description: string;
    hours: number;
    rate: number;
    amount: number;
  }>;
  narrative: string;
  generatedDate: string;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  // Multi-currency context (optional for backward compat)
  quoteCurrency?: string | null;
  costCurrency?: string | null;
  exchangeRate?: number | string | null;
  exchangeRateLockedAt?: Date | string | null;
  exchangeRateSource?: string | null;
}

function formatMoney(amount: number, currency: string, fractionDigits = 2): string {
  const safeCurrency = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCurrency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    return `${safeCurrency} ${amount.toLocaleString('en-US', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}`;
  }
}

export async function generateSubSOWPdf(input: SubSOWPdfInput): Promise<Buffer> {
  const { marked } = await import('marked');
  
  // Convert markdown narrative to HTML
  const narrativeHtml = input.narrative ? await marked(input.narrative) : '';
  
  // Group assignments by epic
  const epicGroups = new Map<string, typeof input.assignments>();
  for (const assignment of input.assignments) {
    const epicName = assignment.epicName || 'General';
    if (!epicGroups.has(epicName)) {
      epicGroups.set(epicName, []);
    }
    epicGroups.get(epicName)!.push(assignment);
  }
  
  // Currency context
  const costCurrency = (input.costCurrency || 'USD').toUpperCase();
  const quoteCurrency = (input.quoteCurrency || costCurrency).toUpperCase();
  const exchangeRate = input.exchangeRate != null ? Number(input.exchangeRate) : null;
  const hasFx = quoteCurrency !== costCurrency && !!exchangeRate && exchangeRate > 0;
  const toQuote = (amt: number) => (hasFx ? amt / (exchangeRate as number) : amt);

  // Build assignment rows
  const assignmentsByEpic = Array.from(epicGroups.entries()).map(([epicName, assignments]) => {
    const epicTotalHours = assignments.reduce((sum, a) => sum + a.hours, 0);
    const epicTotalAmount = assignments.reduce((sum, a) => sum + a.amount, 0);
    return {
      epicName,
      totalHours: epicTotalHours,
      totalAmount: formatMoney(epicTotalAmount, costCurrency, 2),
      totalAmountQuote: hasFx ? formatMoney(toQuote(epicTotalAmount), quoteCurrency, 2) : null,
      assignments: assignments.map(a => ({
        stageName: a.stageName || '',
        description: a.description,
        hours: a.hours.toFixed(1),
        rate: formatMoney(a.rate, costCurrency, 2),
        amount: formatMoney(a.amount, costCurrency, 2),
      })),
    };
  });

  const lockedAt = input.exchangeRateLockedAt
    ? (typeof input.exchangeRateLockedAt === 'string' ? new Date(input.exchangeRateLockedAt) : input.exchangeRateLockedAt)
    : null;
  const lockedAtStr = lockedAt ? lockedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
  const rateSourceLabel = input.exchangeRateSource === 'manual' ? 'manual override' : input.exchangeRateSource === 'locked' ? 'locked' : 'live';

  const templateData = {
    tenantName: input.tenantName,
    tenantLogo: input.tenantLogo,
    projectName: input.projectName,
    clientName: input.clientName,
    resourceName: input.resourceName,
    resourceEmail: input.resourceEmail,
    resourceRole: input.resourceRole,
    isSalaried: input.isSalaried,
    isSubcontractor: !input.isSalaried,
    totalHours: input.totalHours.toFixed(1),
    totalCost: formatMoney(input.totalCost, costCurrency, 2),
    totalCostQuote: hasFx ? formatMoney(toQuote(input.totalCost), quoteCurrency, 2) : null,
    quoteCurrency,
    costCurrency,
    showCurrencyNote: hasFx,
    exchangeRateText: hasFx ? `1 ${quoteCurrency} = ${(exchangeRate as number).toFixed(4)} ${costCurrency}` : null,
    rateSourceLabel,
    rateLockedAtStr: lockedAtStr,
    generatedDate: input.generatedDate,
    projectStartDate: input.projectStartDate,
    projectEndDate: input.projectEndDate,
    narrative: narrativeHtml,
    hasNarrative: !!input.narrative,
    assignmentsByEpic,
    hasAssignments: input.assignments.length > 0,
  };

  // Load template
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, '..');
  const templatePath = path.join(projectRoot, 'server', 'sub-sow-template.html');
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const template = Handlebars.compile(templateSource);
  
  // Generate HTML
  const html = template(templateData);
  
  // Generate PDF using Puppeteer
  let browser;
  try {
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    
    if (!executablePath) {
      try {
        const { execSync } = await import('child_process');
        executablePath = execSync('which chromium').toString().trim();
        console.log('[Sub-SOW PDF] Using system Chromium:', executablePath);
      } catch {
        executablePath = 'chromium';
        console.log('[Sub-SOW PDF] Using fallback chromium path');
      }
    }
    
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--single-process',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update'
    ];
    
    console.log('[Sub-SOW PDF] Launching Chromium for PDF generation...');
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: launchArgs,
      timeout: 60000
    });
    
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);
    
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    });
    
    console.log('[Sub-SOW PDF] PDF generated successfully');
    return Buffer.from(pdf);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ============================================================================
// ESTIMATE PROPOSAL PDF
// ============================================================================

export interface EstimateProposalPdfInput {
  estimateName: string;
  clientName: string;
  estimateDate: string | null;
  validUntil: string | null;
  totalHours: number;
  totalFees: number;
  presentedTotal: number | null;
  lineItemsByEpic: Array<{
    epicName: string;
    items: Array<{
      description: string;
      adjustedHours: number;
      totalAmount: number;
    }>;
    epicHours: number;
    epicAmount: number;
  }>;
  generatedDate: string;
  versionNumber: number | null;
  versionDate: string | null;
  tenantName: string;
  // Multi-currency context (optional for backward compat)
  quoteCurrency?: string | null;
  costCurrency?: string | null;
  exchangeRate?: number | string | null;
  exchangeRateLockedAt?: Date | string | null;
  exchangeRateSource?: string | null;
}

export async function generateEstimateProposalPdf(input: EstimateProposalPdfInput): Promise<Buffer> {
  const costCurrency = (input.costCurrency || 'USD').toUpperCase();
  const quoteCurrency = (input.quoteCurrency || costCurrency).toUpperCase();
  const exchangeRate = input.exchangeRate != null ? Number(input.exchangeRate) : null;
  const hasFx = quoteCurrency !== costCurrency && !!exchangeRate && exchangeRate > 0;
  const toQuote = (amt: number) => (hasFx ? amt / (exchangeRate as number) : amt);
  const fmtQuote = (amt: number) => formatMoney(toQuote(amt), quoteCurrency, 0);

  const rowsHtml = input.lineItemsByEpic.map(({ epicName, items, epicHours, epicAmount }) => {
    const itemRows = items.map((item) => `
      <tr>
        <td class="desc">${escapeHtml(item.description)}</td>
        <td class="num">${item.adjustedHours.toFixed(1)}</td>
        <td class="num">${fmtQuote(item.totalAmount)}</td>
      </tr>
    `).join("");

    const epicRow = `
      <tr class="epic-row">
        <td colspan="3">${escapeHtml(epicName)}</td>
      </tr>
      ${itemRows}
      <tr class="subtotal-row">
        <td>Subtotal — ${escapeHtml(epicName)}</td>
        <td class="num">${epicHours.toFixed(1)} hrs</td>
        <td class="num">${fmtQuote(epicAmount)}</td>
      </tr>
    `;
    return epicRow;
  }).join("");

  // presentedTotal is the customer-facing total (already in quoteCurrency per the
  // To-Client Total UI). totalFees is the sum of line item totalAmount values,
  // which are stored in costCurrency, so it must be converted to quoteCurrency.
  const displayTotalQuote = input.presentedTotal != null
    ? input.presentedTotal
    : toQuote(input.totalFees);
  const displayTotalCost = hasFx ? displayTotalQuote * (exchangeRate as number) : displayTotalQuote;
  const versionLine = input.versionNumber != null
    ? `Estimate v${input.versionNumber}${input.versionDate ? ` · Snapshot ${input.versionDate}` : ""} · `
    : "";

  const lockedAt = input.exchangeRateLockedAt
    ? (typeof input.exchangeRateLockedAt === 'string' ? new Date(input.exchangeRateLockedAt) : input.exchangeRateLockedAt)
    : null;
  const lockedAtStr = lockedAt ? lockedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
  const rateSourceLabel = input.exchangeRateSource === 'manual' ? 'manual override' : input.exchangeRateSource === 'locked' ? 'locked' : 'live';
  const fxNoteHtml = hasFx
    ? `<div class="fx-note">Amounts shown in ${quoteCurrency}. Exchange rate: 1 ${quoteCurrency} = ${(exchangeRate as number).toFixed(4)} ${costCurrency} (${rateSourceLabel}${lockedAtStr ? `, set ${lockedAtStr}` : ''}).</div>`
    : '';
  const headerCurrencyHtml = `<span>Currency: ${quoteCurrency}</span>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #222; padding: 40px; }
  h1 { font-size: 20pt; color: #1a2e4a; margin-bottom: 4px; }
  .meta { color: #555; font-size: 10pt; margin-bottom: 24px; }
  .meta span { margin-right: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #1a2e4a; color: #fff; padding: 8px 10px; text-align: left; font-size: 10pt; }
  th.num { text-align: right; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; font-size: 10pt; }
  td.num { text-align: right; }
  td.desc { max-width: 320px; }
  tr.epic-row td { background: #f1f5f9; font-weight: 700; color: #1a2e4a; padding: 6px 10px; border-top: 2px solid #cbd5e1; }
  tr.subtotal-row td { background: #f8fafc; font-style: italic; color: #555; font-size: 9.5pt; }
  .total-row { margin-top: 24px; text-align: right; font-size: 13pt; font-weight: 700; color: #1a2e4a; }
  .total-sub { font-size: 9.5pt; font-weight: 400; color: #555; margin-top: 4px; }
  .fx-note { margin-top: 16px; padding: 10px 12px; background: #fef3c7; color: #92400e; font-size: 9.5pt; border-radius: 4px; }
  .footer { margin-top: 40px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 8.5pt; color: #888; }
</style>
</head>
<body>
  <h1>${escapeHtml(input.estimateName)}</h1>
  <div class="meta">
    <span>Client: ${escapeHtml(input.clientName)}</span>
    ${input.estimateDate ? `<span>Date: ${input.estimateDate}</span>` : ""}
    ${input.validUntil ? `<span>Valid until: ${input.validUntil}</span>` : ""}
    ${headerCurrencyHtml}
  </div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Hours</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="3" style="color:#888;text-align:center;padding:20px">No line items</td></tr>`}
    </tbody>
  </table>
  <div class="total-row">
    Total: ${formatMoney(displayTotalQuote, quoteCurrency, 0)}
    &nbsp;(${input.totalHours.toFixed(1)} hrs)
    ${hasFx ? `<div class="total-sub">Equivalent: ${formatMoney(displayTotalCost, costCurrency, 0)}</div>` : ""}
  </div>
  ${fxNoteHtml}
  <div class="footer">
    ${versionLine}Generated ${input.generatedDate} · ${escapeHtml(input.tenantName)}
  </div>
</body>
</html>`;

  let browser: import('puppeteer').Browser | null = null;
  try {
    const puppeteerModule = await import('puppeteer');
    browser = await puppeteerModule.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } });
    console.log('[ESTIMATE-PDF] Proposal PDF generated successfully');
    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close();
  }
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
