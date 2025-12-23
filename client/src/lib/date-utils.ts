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

/**
 * Parse a business date (YYYY-MM-DD string or Date) to a Date object without timezone shift
 * This creates a date at noon local time to avoid any day boundary issues
 * 
 * PostgreSQL's date type returns YYYY-MM-DD strings, which is our primary format.
 * Returns null if input is invalid so callers can handle appropriately.
 */
export function parseBusinessDate(dateInput: string | Date | null | undefined): Date | null {
  // Handle null/undefined explicitly
  if (dateInput === null || dateInput === undefined) {
    return null;
  }
  
  // Handle Date objects directly - extract local date components
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), 12, 0, 0);
  }
  
  // Convert to string
  const dateString = String(dateInput);
  
  // Primary: Handle YYYY-MM-DD format (PostgreSQL date type returns this)
  // Use regex to extract just the date portion, ignoring any time/timezone suffix
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, yearStr, monthStr, dayStr] = match;
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      // Create date at noon local time to avoid any day boundary issues
      return new Date(year, month - 1, day, 12, 0, 0);
    }
  }
  
  console.error('[parseBusinessDate] Could not parse date:', dateInput);
  return null;
}

/**
 * Safely parse a business date, returning today's date at noon if parsing fails
 * Use this when a fallback is acceptable (e.g., initial calendar display)
 */
export function parseBusinessDateOrToday(dateInput: string | Date | null | undefined): Date {
  const parsed = parseBusinessDate(dateInput);
  if (parsed) return parsed;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}