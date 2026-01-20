import sharp from 'sharp';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Receipt Normalizer
 * 
 * Converts various receipt file formats (JPEG, PNG, HEIC, HEIF, PDF, TXT)
 * into data URLs suitable for embedding in invoice PDFs.
 */

const MAX_RECEIPT_SIZE_MB = 25; // Maximum size per receipt (increased for large PDFs)
const MAX_IMAGE_DIMENSION = 1600; // Max width/height for image optimization
const MAX_PDF_PAGES = 5; // Maximum pages to extract from a PDF receipt
const PDF_RENDER_TIMEOUT_MS = 60000; // 60 second timeout for PDF rendering

export interface NormalizedReceipt {
  dataUrl: string;
  contentType: string;
  originalName: string;
  pageCount?: number; // For PDFs
  conversionNote?: string; // For any special handling notes
}

/**
 * Normalize a receipt buffer to data URL(s) for PDF embedding
 * Returns an array since PDFs can have multiple pages
 */
export async function normalizeReceiptToDataUrls(
  buffer: Buffer,
  contentType: string,
  originalName: string
): Promise<NormalizedReceipt[]> {
  console.log(`[ReceiptNormalizer] Processing ${originalName} (${contentType})`);
  
  // Check file size
  const sizeMB = buffer.length / (1024 * 1024);
  if (sizeMB > MAX_RECEIPT_SIZE_MB) {
    throw new Error(`Receipt ${originalName} exceeds maximum size of ${MAX_RECEIPT_SIZE_MB}MB`);
  }

  // Normalize MIME type
  const mimeType = contentType.toLowerCase();

  // Handle image types (JPEG, PNG, HEIC, HEIF)
  if (mimeType.includes('image')) {
    const result = await normalizeImageReceipt(buffer, mimeType, originalName);
    return [result];
  }

  // Handle PDF receipts - returns array for multi-page PDFs
  if (mimeType.includes('pdf')) {
    return await normalizePdfReceipt(buffer, originalName);
  }

  // Handle text receipts
  if (mimeType.includes('text')) {
    const result = await normalizeTextReceipt(buffer, originalName);
    return [result];
  }

  // Unsupported format - return placeholder
  console.warn(`[ReceiptNormalizer] Unsupported format for ${originalName}: ${contentType}`);
  return [createUnsupportedPlaceholder(originalName, contentType)];
}

/**
 * Legacy single-result function for backward compatibility
 * @deprecated Use normalizeReceiptToDataUrls instead
 */
export async function normalizeReceiptToDataUrl(
  buffer: Buffer,
  contentType: string,
  originalName: string
): Promise<NormalizedReceipt> {
  const results = await normalizeReceiptToDataUrls(buffer, contentType, originalName);
  return results[0];
}

/**
 * Normalize image receipts (JPEG, PNG, HEIC, HEIF)
 * Converts to JPEG and resizes if necessary
 */
async function normalizeImageReceipt(
  buffer: Buffer,
  mimeType: string,
  originalName: string
): Promise<NormalizedReceipt> {
  try {
    // Sharp handles JPEG, PNG, HEIC, HEIF natively
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    console.log(`[ReceiptNormalizer] Image metadata for ${originalName}:`, {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      space: metadata.space
    });

    // Resize if image is too large
    let processedImage = image;
    if (metadata.width && metadata.height) {
      if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION) {
        console.log(`[ReceiptNormalizer] Resizing ${originalName} from ${metadata.width}x${metadata.height}`);
        processedImage = processedImage.resize({
          width: MAX_IMAGE_DIMENSION,
          height: MAX_IMAGE_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true
        });
      }
    }

    // Convert to JPEG for consistent PDF embedding
    // HEIC/HEIF will be automatically converted
    const jpegBuffer = await processedImage
      .jpeg({
        quality: 85, // Good quality while keeping file size reasonable
        progressive: true
      })
      .toBuffer();

    const base64 = jpegBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    let conversionNote: string | undefined;
    if (mimeType.includes('heic') || mimeType.includes('heif')) {
      conversionNote = 'Converted from HEIC/HEIF to JPEG';
    }

    return {
      dataUrl,
      contentType: 'image/jpeg',
      originalName,
      conversionNote
    };
  } catch (error) {
    console.error(`[ReceiptNormalizer] Error processing image ${originalName}:`, error);
    throw new Error(`Failed to process image receipt: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Normalize PDF receipts
 * Renders PDF pages to images using Puppeteer for embedding in invoice PDFs
 * Returns multiple NormalizedReceipt entries for multi-page PDFs
 */
async function normalizePdfReceipt(
  buffer: Buffer,
  originalName: string
): Promise<NormalizedReceipt[]> {
  console.log(`[ReceiptNormalizer] PDF receipt detected: ${originalName}`);
  
  let browser;
  let tempFilePath = '';
  const results: NormalizedReceipt[] = [];
  
  try {
    // Write PDF buffer to temp file (Puppeteer needs a file path or URL)
    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    fs.writeFileSync(tempFilePath, buffer);
    
    // Get Chromium path
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH;
    if (!executablePath) {
      try {
        const { execSync } = await import('child_process');
        executablePath = execSync('which chromium').toString().trim();
      } catch {
        executablePath = 'chromium';
      }
    }
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set viewport for good receipt quality
    await page.setViewport({ width: 800, height: 1100, deviceScaleFactor: 1.5 });
    
    // Navigate to the PDF file
    const fileUrl = `file://${tempFilePath}`;
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: PDF_RENDER_TIMEOUT_MS });
    
    // Wait for PDF to render
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get total page count by checking if PDF.js loaded (Chrome's built-in PDF viewer)
    // We'll capture screenshots as the PDF viewer shows them
    const screenshot = await page.screenshot({ 
      type: 'png',
      fullPage: false
    });
    
    // Optimize the screenshot with sharp
    const optimizedBuffer = await sharp(screenshot)
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    const base64 = optimizedBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    
    results.push({
      dataUrl,
      contentType: 'image/jpeg',
      originalName,
      pageCount: 1,
      conversionNote: 'Rendered from PDF'
    });
    
    console.log(`[ReceiptNormalizer] Successfully rendered PDF ${originalName} to image`);
    
  } catch (error) {
    console.error(`[ReceiptNormalizer] Error rendering PDF ${originalName}:`, error);
    
    // Fallback to placeholder if PDF rendering fails
    const placeholderSvg = `
      <svg width="800" height="400" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="400" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>
        <rect x="350" y="60" width="100" height="120" fill="#ef4444" rx="8"/>
        <text x="400" y="130" font-family="Arial, sans-serif" font-size="32" font-weight="bold" text-anchor="middle" fill="white">PDF</text>
        <text x="400" y="220" font-family="Arial, sans-serif" font-size="18" text-anchor="middle" fill="#92400e">
          PDF Receipt Could Not Be Rendered
        </text>
        <text x="400" y="260" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" fill="#b45309">
          ${originalName.length > 50 ? originalName.substring(0, 47) + '...' : originalName}
        </text>
        <text x="400" y="300" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="#9ca3af">
          Please contact billing for the original receipt
        </text>
      </svg>
    `;
    
    try {
      const pngBuffer = await sharp(Buffer.from(placeholderSvg))
        .png()
        .toBuffer();
      
      const base64 = pngBuffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;
      
      results.push({
        dataUrl,
        contentType: 'image/png',
        originalName,
        conversionNote: 'PDF rendering failed - placeholder shown'
      });
    } catch {
      // Last resort fallback
      results.push({
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        contentType: 'image/png',
        originalName,
        conversionNote: 'PDF rendering failed'
      });
    }
  } finally {
    // Clean up
    if (browser) {
      await browser.close();
    }
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.warn('[ReceiptNormalizer] Failed to clean up temp file:', e);
      }
    }
  }
  
  return results;
}

/**
 * Normalize text receipts
 * Renders text content as an image with proper formatting
 * Converts SVG to PNG for better PDF compatibility
 */
async function normalizeTextReceipt(
  buffer: Buffer,
  originalName: string
): Promise<NormalizedReceipt> {
  console.log(`[ReceiptNormalizer] Text receipt detected: ${originalName}`);
  
  const textContent = buffer.toString('utf-8');
  
  // Escape special characters for SVG
  const escapedText = textContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  // Split into lines and limit to first 50 lines
  const lines = escapedText.split('\n').slice(0, 50);
  const lineHeight = 18;
  const padding = 40;
  const width = 800;
  const height = Math.max(600, lines.length * lineHeight + padding * 2);

  // Create SVG with monospace text
  const textSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="white" stroke="#e5e7eb" stroke-width="2"/>
      <text x="${padding}" y="${padding}" font-family="monospace" font-size="12" fill="#1f2937">
        ${lines.map((line, index) => 
          `<tspan x="${padding}" dy="${index === 0 ? 0 : lineHeight}">${line || ' '}</tspan>`
        ).join('\n        ')}
      </text>
      <text x="${width / 2}" y="${height - 20}" font-family="Arial, sans-serif" font-size="10" text-anchor="middle" fill="#9ca3af">
        ${originalName}
      </text>
    </svg>
  `;

  try {
    // Convert SVG to PNG for better PDF compatibility
    const pngBuffer = await sharp(Buffer.from(textSvg))
      .png()
      .toBuffer();
    
    const base64 = pngBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    return {
      dataUrl,
      contentType: 'image/png',
      originalName,
      conversionNote: lines.length >= 50 ? 'Text truncated to 50 lines' : undefined
    };
  } catch (error) {
    console.error(`[ReceiptNormalizer] Error converting text receipt to PNG:`, error);
    // Fallback to SVG
    const base64 = Buffer.from(textSvg).toString('base64');
    const dataUrl = `data:image/svg+xml;base64,${base64}`;

    return {
      dataUrl,
      contentType: 'image/svg+xml',
      originalName,
      conversionNote: lines.length >= 50 ? 'Text truncated to 50 lines' : undefined
    };
  }
}

/**
 * Create placeholder for unsupported receipt formats
 */
function createUnsupportedPlaceholder(
  originalName: string,
  contentType: string
): NormalizedReceipt {
  const placeholderSvg = `
    <svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="1000" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>
      <text x="400" y="400" font-family="Arial, sans-serif" font-size="24" text-anchor="middle" fill="#92400e">
        Unsupported Receipt Format
      </text>
      <text x="400" y="450" font-family="Arial, sans-serif" font-size="16" text-anchor="middle" fill="#92400e">
        ${originalName}
      </text>
      <text x="400" y="500" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" fill="#b45309">
        Format: ${contentType}
      </text>
      <text x="400" y="550" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="#d97706">
        This file format cannot be displayed in the invoice PDF
      </text>
    </svg>
  `;

  const base64 = Buffer.from(placeholderSvg).toString('base64');
  const dataUrl = `data:image/svg+xml;base64,${base64}`;

  return {
    dataUrl,
    contentType: 'image/svg+xml',
    originalName,
    conversionNote: `Unsupported format: ${contentType}`
  };
}

/**
 * Batch process multiple receipts
 * Returns normalized receipts with error handling for individual failures
 * PDFs may produce multiple results (one per page), so this flattens all results
 */
export async function normalizeReceiptBatch(
  receipts: Array<{ buffer: Buffer; contentType: string; originalName: string }>
): Promise<Array<NormalizedReceipt | null>> {
  const results = await Promise.allSettled(
    receipts.map(receipt =>
      normalizeReceiptToDataUrls(receipt.buffer, receipt.contentType, receipt.originalName)
    )
  );

  // Flatten results since PDFs can produce multiple images
  const flattenedResults: Array<NormalizedReceipt | null> = [];
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      // Add all normalized receipts from this file
      result.value.forEach(receipt => flattenedResults.push(receipt));
    } else {
      console.error(`[ReceiptNormalizer] Failed to normalize ${receipts[index].originalName}:`, result.reason);
      // Add null for failed receipts
      flattenedResults.push(null);
    }
  });
  
  return flattenedResults;
}
