import { format } from "date-fns";

/**
 * Date utilities for handling business dates without timezone conversion
 * Business dates (invoices, SOWs, MSAs, expenses) should be stored and displayed exactly as entered
 */

/**
 * Format a business date string (YYYY-MM-DD) for display without timezone conversion
 * @param dateString - Date string in YYYY-MM-DD format
 * @param formatStr - Format string (defaults to "MMM d, yyyy")
 * @returns Formatted date string
 */
export function formatBusinessDate(dateString: string | null | undefined, formatStr: string = "MMM d, yyyy"): string {
  if (!dateString) return "";
  
  // Parse date components directly from string to avoid timezone conversion
  const [year, month, day] = dateString.split('-').map(Number);
  
  if (!year || !month || !day) return "";
  
  // Create date object with explicit local components (no timezone conversion)
  const date = new Date(year, month - 1, day);
  
  // Use date-fns format with the local date object
  return format(date, formatStr);
}

/**
 * Format a timestamp for display (these can use normal Date parsing since they include time info)
 * @param timestamp - ISO timestamp string
 * @param formatStr - Format string (defaults to "MMM d, yyyy 'at' h:mm a")
 * @returns Formatted timestamp string
 */
export function formatTimestamp(timestamp: string | null | undefined, formatStr: string = "MMM d, yyyy 'at' h:mm a"): string {
  if (!timestamp) return "";
  
  // For timestamps with time components, normal Date parsing is appropriate
  const date = new Date(timestamp);
  return format(date, formatStr);
}

/**
 * Get today's date in YYYY-MM-DD format for business date inputs
 * @returns Today's date as YYYY-MM-DD string
 */
export function getTodayBusinessDate(): string {
  const today = new Date();
  return today.getFullYear() + '-' + 
         String(today.getMonth() + 1).padStart(2, '0') + '-' + 
         String(today.getDate()).padStart(2, '0');
}

/**
 * Validate business date string format and components
 * @param dateString - Date string to validate
 * @returns True if valid business date
 */
export function isValidBusinessDate(dateString: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;
  
  const [year, month, day] = dateString.split('-').map(Number);
  return year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}