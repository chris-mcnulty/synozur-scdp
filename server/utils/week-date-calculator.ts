/**
 * Utility functions for converting week numbers to actual dates based on kickoff date
 */

/**
 * Get the Monday of the week containing the given date
 */
export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Get the Sunday of the week containing the given date
 */
export function getSundayOfWeek(date: Date): Date {
  const monday = getMondayOfWeek(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

/**
 * Calculate actual dates from week numbers based on kickoff date
 * @param kickoffDate - The kickoff meeting date
 * @param weekNumber - The week number from the estimate (0, 1, 2, etc.)
 * @returns Object with start and end dates for the week
 */
export function calculateWeekDates(kickoffDate: Date | string, weekNumber: number): {
  startDate: Date;
  endDate: Date;
  weekLabel: string;
} {
  const kickoff = typeof kickoffDate === 'string' ? new Date(kickoffDate) : kickoffDate;
  
  // Get the Monday of the kickoff week (Week 1)
  const week1Monday = getMondayOfWeek(kickoff);
  
  // Calculate the target week's Monday
  // Week 0 is the week before kickoff, Week 1 is kickoff week, etc.
  const weekOffset = weekNumber - 1; // Subtract 1 because Week 1 is the base week
  const targetMonday = new Date(week1Monday);
  targetMonday.setDate(week1Monday.getDate() + (weekOffset * 7));
  
  const startDate = targetMonday;
  const endDate = getSundayOfWeek(targetMonday);
  
  // Format week label
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const startMonth = monthNames[startDate.getMonth()];
  const startDay = startDate.getDate();
  const endMonth = monthNames[endDate.getMonth()];
  const endDay = endDate.getDate();
  
  let weekLabel: string;
  if (startMonth === endMonth) {
    weekLabel = `${startMonth} ${startDay}-${endDay}`;
  } else {
    weekLabel = `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  }
  
  return {
    startDate,
    endDate,
    weekLabel
  };
}

/**
 * Convert a Date to YYYY-MM-DD format string
 */
export function dateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate week number from a date relative to kickoff
 * @param kickoffDate - The kickoff meeting date
 * @param targetDate - The date to calculate the week number for
 * @returns The week number (0 for week before kickoff, 1 for kickoff week, etc.)
 */
export function calculateWeekNumber(kickoffDate: Date | string, targetDate: Date | string): number {
  const kickoff = typeof kickoffDate === 'string' ? new Date(kickoffDate) : kickoffDate;
  const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  
  const week1Monday = getMondayOfWeek(kickoff);
  const targetMonday = getMondayOfWeek(target);
  
  const diffTime = targetMonday.getTime() - week1Monday.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.round(diffDays / 7);
  
  return diffWeeks + 1; // Add 1 because Week 1 is the kickoff week
}

/**
 * Get a human-readable week description
 */
export function getWeekDescription(weekNumber: number): string {
  if (weekNumber === 0) return 'Pre-kickoff week';
  if (weekNumber === 1) return 'Kickoff week';
  return `Week ${weekNumber}`;
}