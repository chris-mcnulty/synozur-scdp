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

export interface PerDiemCalculation {
  fullDays: number;
  partialDays: number;
  mealsTotal: number;
  lodgingTotal: number;
  totalAmount: number;
  breakdown: string;
  gsaRate: GSARate;
}

/**
 * Get GSA per diem rates by city and state
 */
export async function getPerDiemRatesByCity(city: string, state: string, year?: number): Promise<GSARate | null> {
  try {
    const targetYear = year || new Date().getFullYear();
    const url = `${GSA_API_BASE}/rates/city/${encodeURIComponent(city)}/state/${state}/year/${targetYear}`;
    
    console.log(`[GSA_API] Fetching rates from URL: ${url}`);
    
    // GSA API key from environment variable (optional - API works without key but has rate limits)
    const headers: HeadersInit = {};
    if (process.env.GSA_API_KEY) {
      headers['X-Api-Key'] = process.env.GSA_API_KEY;
    }

    const response = await fetch(url, { headers });
    
    console.log(`[GSA_API] Response status: ${response.status}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[GSA_API] Rate not found for ${city}, ${state} in ${targetYear}`);
        return null;
      }
      const errorText = await response.text();
      console.error(`[GSA_API] Error response: ${errorText}`);
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
    
    const headers: HeadersInit = {};
    if (process.env.GSA_API_KEY) {
      headers['X-Api-Key'] = process.env.GSA_API_KEY;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`GSA rate not found for ZIP ${zip} in ${targetYear}`);
        return null;
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

  return {
    fullDays,
    partialDays,
    mealsTotal,
    lodgingTotal,
    totalAmount,
    breakdown,
    gsaRate,
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
