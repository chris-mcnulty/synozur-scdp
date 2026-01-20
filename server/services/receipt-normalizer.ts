import sharp from 'sharp';
// Note: Puppeteer-based PDF rendering disabled due to production resource constraints
// PDF receipts are shown as informative placeholders with the original PDF attached to invoice

/**
 * Receipt Normalizer
 * 
 * Converts various receipt file formats (JPEG, PNG, HEIC, HEIF, PDF, TXT)
 * into data URLs suitable for embedding in invoice PDFs.
 */

const MAX_RECEIPT_SIZE_MB = 25; // Maximum size per receipt (increased for large PDFs)
const MAX_IMAGE_DIMENSION = 1600; // Max width/height for image optimization
const MAX_PDF_PAGES = 5; // Maximum pages to extract from a PDF receipt
// PDF rendering via Puppeteer disabled - using placeholder approach for production reliability

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
 * Creates an informative placeholder image indicating the PDF is attached to the invoice
 * Note: Puppeteer-based PDF rendering disabled due to production resource constraints
 */
async function normalizePdfReceipt(
  buffer: Buffer,
  originalName: string
): Promise<NormalizedReceipt[]> {
  console.log(`[ReceiptNormalizer] PDF receipt detected: ${originalName} (${Math.round(buffer.length / 1024)}KB)`);
  
  // Truncate filename for display
  const displayName = originalName.length > 60 ? originalName.substring(0, 57) + '...' : originalName;
  
  // Create an informative placeholder that clearly indicates PDF is attached
  const placeholderSvg = `
    <svg width="800" height="500" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#f8fafc;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#e2e8f0;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(#bgGradient)" rx="8"/>
      <rect x="20" y="20" width="760" height="460" fill="white" stroke="#cbd5e1" stroke-width="1" rx="6"/>
      
      <!-- PDF Icon -->
      <rect x="340" y="80" width="120" height="140" fill="#dc2626" rx="8"/>
      <rect x="350" y="90" width="100" height="120" fill="#fef2f2" rx="4"/>
      <text x="400" y="160" font-family="Arial, sans-serif" font-size="32" font-weight="bold" text-anchor="middle" fill="#dc2626">PDF</text>
      
      <!-- Title -->
      <text x="400" y="270" font-family="Arial, sans-serif" font-size="20" font-weight="bold" text-anchor="middle" fill="#1e293b">
        PDF Receipt Attached
      </text>
      
      <!-- Filename -->
      <text x="400" y="310" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" fill="#475569">
        ${displayName}
      </text>
      
      <!-- Instructions -->
      <text x="400" y="360" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" fill="#64748b">
        Original PDF file included with invoice
      </text>
      
      <!-- Footer -->
      <text x="400" y="440" font-family="Arial, sans-serif" font-size="11" text-anchor="middle" fill="#94a3b8">
        PDF receipt placeholder (original PDF attached separately)
      </text>
    </svg>
  `;
  
  try {
    const pngBuffer = await sharp(Buffer.from(placeholderSvg))
      .png()
      .toBuffer();
    
    const base64 = pngBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;
    
    console.log(`[ReceiptNormalizer] Created placeholder for PDF: ${originalName}`);
    
    return [{
      dataUrl,
      contentType: 'image/png',
      originalName,
      conversionNote: 'PDF placeholder - original attached to invoice'
    }];
  } catch (error) {
    console.error(`[ReceiptNormalizer] Error creating PDF placeholder:`, error);
    
    // Minimal fallback
    return [{
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      contentType: 'image/png',
      originalName,
      conversionNote: 'PDF placeholder'
    }];
  }
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
