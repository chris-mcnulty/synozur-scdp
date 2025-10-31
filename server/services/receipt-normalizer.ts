import sharp from 'sharp';

/**
 * Receipt Normalizer
 * 
 * Converts various receipt file formats (JPEG, PNG, HEIC, HEIF, PDF, TXT)
 * into data URLs suitable for embedding in invoice PDFs.
 */

const MAX_RECEIPT_SIZE_MB = 10; // Maximum size per receipt
const MAX_IMAGE_DIMENSION = 1600; // Max width/height for image optimization

export interface NormalizedReceipt {
  dataUrl: string;
  contentType: string;
  originalName: string;
  pageCount?: number; // For PDFs
  conversionNote?: string; // For any special handling notes
}

/**
 * Normalize a receipt buffer to a data URL for PDF embedding
 */
export async function normalizeReceiptToDataUrl(
  buffer: Buffer,
  contentType: string,
  originalName: string
): Promise<NormalizedReceipt> {
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
    return await normalizeImageReceipt(buffer, mimeType, originalName);
  }

  // Handle PDF receipts
  if (mimeType.includes('pdf')) {
    return await normalizePdfReceipt(buffer, originalName);
  }

  // Handle text receipts
  if (mimeType.includes('text')) {
    return normalizeTextReceipt(buffer, originalName);
  }

  // Unsupported format - return placeholder
  console.warn(`[ReceiptNormalizer] Unsupported format for ${originalName}: ${contentType}`);
  return createUnsupportedPlaceholder(originalName, contentType);
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
 * For now, we create a placeholder page indicating it's a PDF receipt
 * In future, could use pdf-lib or pdfjs-dist to extract first page as image
 */
async function normalizePdfReceipt(
  buffer: Buffer,
  originalName: string
): Promise<NormalizedReceipt> {
  console.log(`[ReceiptNormalizer] PDF receipt detected: ${originalName}`);
  
  // For now, create a simple placeholder image with text
  // Future enhancement: Use pdf-lib to extract first page and convert to image
  const placeholderSvg = `
    <svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="1000" fill="#f9fafb" stroke="#e5e7eb" stroke-width="2"/>
      <text x="400" y="400" font-family="Arial, sans-serif" font-size="24" text-anchor="middle" fill="#374151">
        PDF Receipt Attached
      </text>
      <text x="400" y="450" font-family="Arial, sans-serif" font-size="16" text-anchor="middle" fill="#6b7280">
        ${originalName}
      </text>
      <text x="400" y="500" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" fill="#9ca3af">
        Original PDF file included with invoice
      </text>
    </svg>
  `;

  const base64 = Buffer.from(placeholderSvg).toString('base64');
  const dataUrl = `data:image/svg+xml;base64,${base64}`;

  return {
    dataUrl,
    contentType: 'image/svg+xml',
    originalName,
    conversionNote: 'PDF receipt placeholder (original PDF attached separately)'
  };
}

/**
 * Normalize text receipts
 * Renders text content as an image with proper formatting
 */
function normalizeTextReceipt(
  buffer: Buffer,
  originalName: string
): NormalizedReceipt {
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

  const base64 = Buffer.from(textSvg).toString('base64');
  const dataUrl = `data:image/svg+xml;base64,${base64}`;

  return {
    dataUrl,
    contentType: 'image/svg+xml',
    originalName,
    conversionNote: lines.length >= 50 ? 'Text truncated to 50 lines' : undefined
  };
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
 */
export async function normalizeReceiptBatch(
  receipts: Array<{ buffer: Buffer; contentType: string; originalName: string }>
): Promise<Array<NormalizedReceipt | null>> {
  const results = await Promise.allSettled(
    receipts.map(receipt =>
      normalizeReceiptToDataUrl(receipt.buffer, receipt.contentType, receipt.originalName)
    )
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      console.error(`[ReceiptNormalizer] Failed to normalize ${receipts[index].originalName}:`, result.reason);
      // Return null for failed receipts instead of throwing
      return null;
    }
  });
}
