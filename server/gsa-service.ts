/**
 * GSA Per Diem Rates Service
 * 
 * Fetches federal per diem rates from the GSA API
 * API Documentation: https://open.gsa.gov/api/perdiem/
 */

const GSA_API_BASE = 'https://api.gsa.gov/travel/perdiem/v2';

export interface GSARate {
  city: string;
  state: string;
  year: number;
  meals: number; // M&IE (Meals & Incidental Expenses)
  lodging: number;
  zip?: string;
  county?: string;
}

// M&IE breakdown by component (GSA standard breakdown table)
export interface MIEBreakdown {
  mieTotal: number;
  breakfast: number;
  lunch: number;
  dinner: number;
  incidentals: number;
}

// Per diem day with individual meal component selections
export interface PerDiemDay {
  date: string; // ISO date string
  isClientEngagement: boolean; // Whether working with client this day
  breakfast: boolean; // true = claim, false = provided by client
  lunch: boolean;
  dinner: boolean;
  incidentals: boolean;
  isPartialDay: boolean; // First or last day (75% rule)
}

// GSA M&IE breakdown table (FY2025)
// Source: https://www.gsa.gov/travel/plan-a-trip/per-diem-rates/mie-breakdowns
const MIE_BREAKDOWN_TABLE: MIEBreakdown[] = [
  { mieTotal: 59, breakfast: 13, lunch: 15, dinner: 26, incidentals: 5 }, // Standard CONUS
  { mieTotal: 64, breakfast: 14, lunch: 17, dinner: 28, incidentals: 5 },
  { mieTotal: 68, breakfast: 16, lunch: 19, dinner: 28, incidentals: 5 },
  { mieTotal: 74, breakfast: 17, lunch: 21, dinner: 31, incidentals: 5 },
  { mieTotal: 79, breakfast: 18, lunch: 22, dinner: 34, incidentals: 5 },
  { mieTotal: 84, breakfast: 19, lunch: 23, dinner: 37, incidentals: 5 },
  { mieTotal: 89, breakfast: 20, lunch: 25, dinner: 39, incidentals: 5 },
  { mieTotal: 92, breakfast: 21, lunch: 26, dinner: 40, incidentals: 5 },
];

/**
 * Get M&IE breakdown by total M&IE rate
 * Finds the closest matching tier from the GSA breakdown table
 */
export function getMIEBreakdown(mieTotal: number): MIEBreakdown {
  // Handle invalid input
  if (isNaN(mieTotal) || mieTotal <= 0) {
    return { mieTotal: 0, breakfast: 0, lunch: 0, dinner: 0, incidentals: 0 };
  }
  
  // Find exact match first
  const exactMatch = MIE_BREAKDOWN_TABLE.find(b => b.mieTotal === mieTotal);
  if (exactMatch) return exactMatch;
  
  // For low values (less than lowest tier), calculate proportionally
  if (mieTotal < 59) {
    const breakfast = Math.round(mieTotal * 0.22); // ~22% for breakfast
    const lunch = Math.round(mieTotal * 0.25);     // ~25% for lunch
    const dinner = Math.round(mieTotal * 0.44);    // ~44% for dinner
    const incidentals = Math.max(0, mieTotal - breakfast - lunch - dinner); // remainder for incidentals
    return { mieTotal, breakfast, lunch, dinner, incidentals };
  }
  
  // Find closest match for values between tiers
  let closest = MIE_BREAKDOWN_TABLE[0];
  let minDiff = Math.abs(mieTotal - closest.mieTotal);
  
  for (const breakdown of MIE_BREAKDOWN_TABLE) {
    const diff = Math.abs(mieTotal - breakdown.mieTotal);
    if (diff < minDiff) {
      minDiff = diff;
      closest = breakdown;
    }
  }
  
  // If M&IE is higher than all tiers, calculate proportionally
  if (mieTotal > 92) {
    // Use percentages: 15% breakfast, 25% lunch, 40% dinner, rest incidentals
    const breakfast = Math.round(mieTotal * 0.15);
    const lunch = Math.round(mieTotal * 0.25);
    const dinner = Math.round(mieTotal * 0.40);
    const incidentals = mieTotal - breakfast - lunch - dinner;
    return { mieTotal, breakfast, lunch, dinner, incidentals };
  }
  
  return closest;
}

/**
 * Calculate per diem total based on day-by-day selections
 * Allows deducting meals provided by client
 */
export function calculatePerDiemWithComponents(
  gsaRate: GSARate,
  days: PerDiemDay[]
): {
  totalAmount: number;
  breakdown: MIEBreakdown;
  dailyBreakdown: { date: string; amount: number; components: string[] }[];
} {
  const breakdown = getMIEBreakdown(gsaRate.meals);
  const dailyBreakdown: { date: string; amount: number; components: string[] }[] = [];
  let totalAmount = 0;
  
  for (const day of days) {
    if (!day.isClientEngagement) {
      // Skip days with no client engagement
      dailyBreakdown.push({ date: day.date, amount: 0, components: ['No client engagement'] });
      continue;
    }
    
    let dayAmount = 0;
    const components: string[] = [];
    
    // Add each meal component if not provided by client
    if (day.breakfast) {
      dayAmount += breakdown.breakfast;
      components.push(`Breakfast $${breakdown.breakfast}`);
    }
    if (day.lunch) {
      dayAmount += breakdown.lunch;
      components.push(`Lunch $${breakdown.lunch}`);
    }
    if (day.dinner) {
      dayAmount += breakdown.dinner;
      components.push(`Dinner $${breakdown.dinner}`);
    }
    if (day.incidentals) {
      dayAmount += breakdown.incidentals;
      components.push(`Incidentals $${breakdown.incidentals}`);
    }
    
    // Apply 75% rule for first/last day if it's a partial day
    if (day.isPartialDay && components.length > 0) {
      dayAmount = Math.round(dayAmount * 0.75 * 100) / 100;
      components.push('(75% partial day)');
    }
    
    totalAmount += dayAmount;
    dailyBreakdown.push({ date: day.date, amount: dayAmount, components });
  }
  
  return {
    totalAmount: Math.round(totalAmount * 100) / 100,
    breakdown,
    dailyBreakdown
  };
}

export interface DailyComponent {
  day: number;
  type: 'meals' | 'lodging';
  description: string;
  amount: number;
  isPartialDay?: boolean;
}

export interface PerDiemCalculation {
  fullDays: number;
  partialDays: number;
  mealsTotal: number;
  lodgingTotal: number;
  totalAmount: number;
  breakdown: string;
  gsaRate: GSARate;
  dailyComponents: DailyComponent[];
}

/**
 * Get GSA per diem rates by city and state
 */
export async function getPerDiemRatesByCity(city: string, state: string, year?: number): Promise<GSARate | null> {
  try {
    const targetYear = year || new Date().getFullYear();
    const url = `${GSA_API_BASE}/rates/city/${encodeURIComponent(city)}/state/${state}/year/${targetYear}`;
    
    console.log(`[GSA_API] Fetching rates from URL: ${url}`);
    
    // GSA API key from environment variable (required - API no longer works without key)
    const headers: HeadersInit = {};
    if (process.env.GSA_API_KEY) {
      headers['X-Api-Key'] = process.env.GSA_API_KEY;
      console.log(`[GSA_API] Using API key (length: ${process.env.GSA_API_KEY.length})`);
    } else {
      console.warn(`[GSA_API] No GSA_API_KEY environment variable set - API calls will fail`);
    }

    const response = await fetch(url, { headers });
    
    console.log(`[GSA_API] Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GSA_API] Error response (${response.status}): ${errorText}`);
      
      if (response.status === 404) {
        console.log(`[GSA_API] Rate not found for ${city}, ${state} in ${targetYear}`);
        return null;
      }
      if (response.status === 401 || response.status === 403) {
        console.error(`[GSA_API] Authentication error - check GSA_API_KEY`);
        throw new Error(`GSA API authentication error - API key may be missing or invalid`);
      }
      throw new Error(`GSA API error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[GSA_API] Response data:`, JSON.stringify(data, null, 2));
    
    // GSA API returns an array of rates with nested structure
    if (data.rates && data.rates.length > 0) {
      const locationRate = data.rates[0];
      console.log(`[GSA_API] Location rate:`, locationRate);
      
      // Rate details are nested in rate array
      if (locationRate.rate && locationRate.rate.length > 0) {
        const rateDetails = locationRate.rate[0];
        console.log(`[GSA_API] Rate details:`, rateDetails);
        
        // Get current month to find lodging rate
        const currentMonth = new Date().getMonth() + 1; // 1-based
        let lodgingRate = 0;
        
        if (rateDetails.months && rateDetails.months.month) {
          const monthData = rateDetails.months.month.find((m: any) => m.number === currentMonth);
          if (monthData) {
            lodgingRate = parseFloat(monthData.value) || 0;
          } else if (rateDetails.months.month.length > 0) {
            // Fallback to first month if current month not found
            lodgingRate = parseFloat(rateDetails.months.month[0].value) || 0;
          }
        }
        
        return {
          city: rateDetails.city || city,
          state: locationRate.state || state,
          year: targetYear,
          meals: parseFloat(rateDetails.meals) || 0,
          lodging: lodgingRate,
          county: rateDetails.county,
        };
      }
    }

    console.log(`[GSA_API] No rates found in response`);
    return null;
  } catch (error) {
    console.error(`[GSA_API] Error fetching GSA rates for ${city}, ${state}:`, error);
    throw error;
  }
}

/**
 * Get GSA per diem rates by ZIP code
 */
export async function getPerDiemRatesByZip(zip: string, year?: number): Promise<GSARate | null> {
  try {
    const targetYear = year || new Date().getFullYear();
    const url = `${GSA_API_BASE}/rates/zip/${zip}/year/${targetYear}`;
    
    console.log(`[GSA_API] Fetching rates by ZIP from URL: ${url}`);
    
    const headers: HeadersInit = {};
    if (process.env.GSA_API_KEY) {
      headers['X-Api-Key'] = process.env.GSA_API_KEY;
      console.log(`[GSA_API] Using API key (length: ${process.env.GSA_API_KEY.length})`);
    } else {
      console.warn(`[GSA_API] No GSA_API_KEY environment variable set - API calls will fail`);
    }

    const response = await fetch(url, { headers });
    
    console.log(`[GSA_API] Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GSA_API] Error response (${response.status}): ${errorText}`);
      
      if (response.status === 404) {
        console.log(`[GSA_API] Rate not found for ZIP ${zip} in ${targetYear}`);
        return null;
      }
      if (response.status === 401 || response.status === 403) {
        console.error(`[GSA_API] Authentication error - check GSA_API_KEY`);
        throw new Error(`GSA API authentication error - API key may be missing or invalid`);
      }
      throw new Error(`GSA API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.rates && data.rates.length > 0) {
      const locationRate = data.rates[0];
      
      // Rate details are nested in rate array
      if (locationRate.rate && locationRate.rate.length > 0) {
        const rateDetails = locationRate.rate[0];
        
        // Get current month to find lodging rate
        const currentMonth = new Date().getMonth() + 1; // 1-based
        let lodgingRate = 0;
        
        if (rateDetails.months && rateDetails.months.month) {
          const monthData = rateDetails.months.month.find((m: any) => m.number === currentMonth);
          if (monthData) {
            lodgingRate = parseFloat(monthData.value) || 0;
          } else if (rateDetails.months.month.length > 0) {
            // Fallback to first month if current month not found
            lodgingRate = parseFloat(rateDetails.months.month[0].value) || 0;
          }
        }
        
        return {
          city: rateDetails.city,
          state: locationRate.state,
          year: targetYear,
          meals: parseFloat(rateDetails.meals) || 0,
          lodging: lodgingRate,
          zip: zip,
          county: rateDetails.county,
        };
      }
    }

    return null;
  } catch (error) {
    console.error(`Error fetching GSA rates for ZIP ${zip}:`, error);
    throw error;
  }
}

/**
 * Calculate per diem total based on number of days
 * 
 * GSA Rules:
 * - First day of travel: 75% M&IE (partial day)
 * - Last day of travel: 75% M&IE (partial day)  
 * - Full days (between first and last): 100% M&IE
 * - Lodging: All nights except last day (no lodging on departure day)
 * 
 * Examples:
 * - 1 day trip: 1 partial day (75%), no lodging
 * - 2 day trip: 2 partial days (75% each), 1 night lodging
 * - 3 day trip: 2 partial days (75% each) + 1 full day (100%), 2 nights lodging
 */
export function calculatePerDiem(
  gsaRate: GSARate,
  totalDays: number,
  includePartialDays: boolean = true,
  includeLodging: boolean = false
): PerDiemCalculation {
  let fullDays = 0;
  let partialDays = 0;

  // Apply GSA partial day rules
  if (includePartialDays && totalDays > 0) {
    if (totalDays === 1) {
      // Single day trip: 1 partial day (75% M&IE)
      partialDays = 1;
      fullDays = 0;
    } else {
      // Multi-day trip: First and last days are partial (75%), middle days are full (100%)
      partialDays = 2; // First day + Last day
      fullDays = Math.max(0, totalDays - 2); // All days in between
    }
  } else {
    // No partial day calculation - treat all days as full days
    fullDays = totalDays;
    partialDays = 0;
  }

  // Calculate M&IE (Meals & Incidental Expenses)
  const fullDayMeals = fullDays * gsaRate.meals; // 100% of daily rate
  const partialDayMeals = partialDays * (gsaRate.meals * 0.75); // 75% of daily rate
  const mealsTotal = Math.round((fullDayMeals + partialDayMeals) * 100) / 100;

  // Calculate lodging (no lodging on last day - only nights where you stay)
  // Only include if user explicitly requests it
  let lodgingTotal = 0;
  let lodgingDays = 0;
  if (includeLodging) {
    lodgingDays = Math.max(0, totalDays - 1); // All nights except departure day
    lodgingTotal = Math.round(lodgingDays * gsaRate.lodging * 100) / 100;
  }

  const totalAmount = Math.round((mealsTotal + lodgingTotal) * 100) / 100;

  // Build human-readable breakdown
  const breakdownParts: string[] = [];
  if (partialDays > 0) {
    breakdownParts.push(`${partialDays} partial day${partialDays > 1 ? 's' : ''} @ $${(gsaRate.meals * 0.75).toFixed(2)} M&IE`);
  }
  if (fullDays > 0) {
    breakdownParts.push(`${fullDays} full day${fullDays > 1 ? 's' : ''} @ $${gsaRate.meals}/day M&IE`);
  }
  if (includeLodging && lodgingDays > 0) {
    breakdownParts.push(`${lodgingDays} night${lodgingDays > 1 ? 's' : ''} @ $${gsaRate.lodging}/night lodging`);
  }
  const breakdown = breakdownParts.join(' + ');

  // Build itemized daily components for optional itemization
  const dailyComponents: DailyComponent[] = [];
  
  for (let day = 1; day <= totalDays; day++) {
    // Determine if this is a partial day (first or last day)
    const isFirstDay = day === 1;
    const isLastDay = day === totalDays;
    const isPartialDay = includePartialDays && (isFirstDay || isLastDay);
    
    // Calculate meal amount for this day
    const mealRate = isPartialDay ? gsaRate.meals * 0.75 : gsaRate.meals;
    const mealAmount = Math.round(mealRate * 100) / 100;
    
    // Determine meal description
    let mealDescription = `Day ${day} M&IE`;
    if (isPartialDay) {
      if (isFirstDay) {
        mealDescription += ' (Partial day - Arrival)';
      } else if (isLastDay) {
        mealDescription += ' (Partial day - Departure)';
      }
    } else {
      mealDescription += ' (Full day)';
    }
    
    dailyComponents.push({
      day,
      type: 'meals',
      description: mealDescription,
      amount: mealAmount,
      isPartialDay,
    });
    
    // Add lodging component (all days except last day)
    if (includeLodging && !isLastDay) {
      dailyComponents.push({
        day,
        type: 'lodging',
        description: `Day ${day} Lodging`,
        amount: Math.round(gsaRate.lodging * 100) / 100,
      });
    }
  }

  return {
    fullDays,
    partialDays,
    mealsTotal,
    lodgingTotal,
    totalAmount,
    breakdown,
    gsaRate,
    dailyComponents,
  };
}

/**
 * Get default/standard CONUS rate (for locations without specific rates)
 */
export async function getStandardCONUSRate(year?: number): Promise<GSARate> {
  // Standard CONUS rates (updated annually by GSA)
  // These are fallback rates when specific city rates aren't available
  const targetYear = year || new Date().getFullYear();
  
  // 2025 standard CONUS rates (these should be updated annually)
  return {
    city: 'Standard CONUS',
    state: '',
    year: targetYear,
    meals: 59, // Standard M&IE rate for FY2025
    lodging: 98, // Standard lodging rate for FY2025
  };
}

// ============================================================================
// OCONUS (Outside Continental US) Per Diem Rate Functions
// Uses data from DoD OCONUS Per Diem files (updated annually, no API available)
// ============================================================================

export interface OconusGSARate {
  country: string;
  location: string;
  fiscalYear: number;
  meals: number;  // M&IE rate
  lodging: number;
  maxPerDiem: number;
  seasonStart?: string;
  seasonEnd?: string;
}

/**
 * Convert OCONUS database rate to GSARate-like structure for consistency
 */
export function convertOconusToGSARate(oconusRate: {
  country: string;
  location: string;
  fiscalYear: number;
  mie: number;
  lodging: number;
  maxPerDiem: number;
  seasonStart?: string;
  seasonEnd?: string;
}): OconusGSARate {
  return {
    country: oconusRate.country,
    location: oconusRate.location,
    fiscalYear: oconusRate.fiscalYear,
    meals: oconusRate.mie,
    lodging: oconusRate.lodging,
    maxPerDiem: oconusRate.maxPerDiem,
    seasonStart: oconusRate.seasonStart,
    seasonEnd: oconusRate.seasonEnd,
  };
}

/**
 * Calculate OCONUS per diem with components (similar to CONUS calculation)
 */
export function calculateOconusPerDiemWithComponents(
  rate: OconusGSARate,
  days: PerDiemDay[]
): {
  totalAmount: number;
  breakdown: MIEBreakdown;
  dailyBreakdown: { date: string; amount: number; components: string[] }[];
} {
  // Use same calculation as CONUS with the OCONUS M&IE rate
  const breakdown = getMIEBreakdown(rate.meals);
  const dailyBreakdown: { date: string; amount: number; components: string[] }[] = [];
  let totalAmount = 0;
  
  for (const day of days) {
    if (!day.isClientEngagement) {
      dailyBreakdown.push({ date: day.date, amount: 0, components: ['No client engagement'] });
      continue;
    }
    
    let dayAmount = 0;
    const components: string[] = [];
    
    if (day.breakfast) {
      dayAmount += breakdown.breakfast;
      components.push(`Breakfast $${breakdown.breakfast}`);
    }
    if (day.lunch) {
      dayAmount += breakdown.lunch;
      components.push(`Lunch $${breakdown.lunch}`);
    }
    if (day.dinner) {
      dayAmount += breakdown.dinner;
      components.push(`Dinner $${breakdown.dinner}`);
    }
    if (day.incidentals) {
      dayAmount += breakdown.incidentals;
      components.push(`Incidentals $${breakdown.incidentals}`);
    }
    
    if (day.isPartialDay && components.length > 0) {
      dayAmount = Math.round(dayAmount * 0.75 * 100) / 100;
      components.push('(75% partial day)');
    }
    
    totalAmount += dayAmount;
    dailyBreakdown.push({ date: day.date, amount: dayAmount, components });
  }
  
  return {
    totalAmount: Math.round(totalAmount * 100) / 100,
    breakdown,
    dailyBreakdown
  };
}

/**
 * Calculate simple OCONUS per diem (days × M&IE rate)
 */
export function calculateOconusPerDiem(
  rate: OconusGSARate,
  days: number,
  includePartialDays: boolean = true,
  includeLodging: boolean = false
): { totalAmount: number; mealsTotal: number; lodgingTotal: number } {
  let mealsTotal = 0;
  let lodgingTotal = 0;
  
  if (includePartialDays && days > 1) {
    const fullDays = days - 2;
    const partialDays = 2;
    mealsTotal = (fullDays * rate.meals) + (partialDays * rate.meals * 0.75);
  } else {
    mealsTotal = days * rate.meals;
  }
  
  if (includeLodging) {
    lodgingTotal = days * rate.lodging;
  }
  
  return {
    totalAmount: Math.round((mealsTotal + lodgingTotal) * 100) / 100,
    mealsTotal: Math.round(mealsTotal * 100) / 100,
    lodgingTotal: Math.round(lodgingTotal * 100) / 100
  };
}

/**
 * Check if a location is OCONUS (Outside Continental US)
 * Returns true for Alaska, Hawaii, US territories, and foreign countries
 */
export function isOconusLocation(country: string): boolean {
  const oconusRegions = [
    'ALASKA', 'HAWAII', 'PUERTO RICO', 'GUAM', 'US VIRGIN ISLANDS',
    'AMERICAN SAMOA', 'NORTHERN MARIANA ISLANDS'
  ];
  
  const upperCountry = country.toUpperCase();
  
  // If it matches a US OCONUS region
  if (oconusRegions.includes(upperCountry)) {
    return true;
  }
  
  // If it's not a US state abbreviation or 'US', it's likely foreign
  const usStates = [
    'AL', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'ID', 'IL', 'IN', 'IA',
    'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV',
    'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD',
    'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
  ];
  
  // If it's a two-letter code that's a US state, it's CONUS
  if (upperCountry.length === 2 && usStates.includes(upperCountry)) {
    return false;
  }
  
  // Otherwise assume OCONUS (foreign country)
  return true;
}
