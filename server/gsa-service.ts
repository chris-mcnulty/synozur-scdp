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

// GSA CONUS M&IE breakdown table (FY2025/FY2026)
// Source: https://www.gsa.gov/travel/plan-a-trip/per-diem-rates/mie-breakdowns
// CONUS only has 5 tiers - incidentals are always $5
const CONUS_MIE_BREAKDOWN_TABLE: MIEBreakdown[] = [
  { mieTotal: 68, breakfast: 16, lunch: 19, dinner: 28, incidentals: 5 },
  { mieTotal: 74, breakfast: 18, lunch: 20, dinner: 31, incidentals: 5 },
  { mieTotal: 80, breakfast: 20, lunch: 22, dinner: 33, incidentals: 5 },
  { mieTotal: 86, breakfast: 22, lunch: 23, dinner: 36, incidentals: 5 },
  { mieTotal: 92, breakfast: 23, lunch: 26, dinner: 38, incidentals: 5 },
];

// GSA OCONUS M&IE breakdown table (FY2025/FY2026)
// Source: https://www.gsa.gov/travel/plan-a-trip/per-diem-rates/mie-breakdowns
// Complete dollar-by-dollar lookup for OCONUS locations ($1-$265)
// For rates > $265: 15% breakfast, 25% lunch, 40% dinner, remainder incidentals
const OCONUS_MIE_BREAKDOWN_MAP: Record<number, MIEBreakdown> = {};
function buildOconusMieTable() {
  const data: [number, number, number, number, number][] = [
    [1,0,0,0,1],[2,0,0,1,1],[3,0,1,1,1],[4,1,1,1,1],[5,1,1,2,1],
    [6,1,2,2,1],[7,1,2,3,1],[8,1,2,3,2],[9,1,2,4,2],[10,2,2,4,2],
    [11,2,3,4,2],[12,2,3,5,2],[13,2,3,5,3],[14,2,4,5,3],[15,2,4,6,3],
    [16,2,4,7,3],[17,3,4,7,3],[18,3,5,7,3],[19,3,5,8,3],[20,3,5,8,4],
    [21,3,5,9,4],[22,3,6,9,4],[23,3,6,9,5],[24,4,6,9,5],[25,4,6,10,5],
    [26,4,7,10,5],[27,4,7,11,5],[28,4,7,11,6],[29,4,7,12,6],[30,5,7,12,6],
    [31,5,8,12,6],[32,5,8,13,6],[33,5,8,13,7],[34,5,9,13,7],[35,5,9,14,7],
    [36,5,9,15,7],[37,6,9,15,7],[38,6,10,15,7],[39,6,10,16,7],[40,6,10,16,8],
    [41,6,10,17,8],[42,6,11,17,8],[43,6,11,17,9],[44,7,11,17,9],[45,7,11,18,9],
    [46,7,12,18,9],[47,7,12,19,9],[48,7,12,19,10],[49,7,12,20,10],[50,8,12,20,10],
    [51,8,13,20,10],[52,8,13,21,10],[53,8,13,21,11],[54,8,14,21,11],[55,8,14,22,11],
    [56,8,14,23,11],[57,9,14,23,11],[58,9,15,23,11],[59,9,15,24,11],[60,9,15,24,12],
    [61,9,15,25,12],[62,9,16,25,12],[63,9,16,25,13],[64,10,16,25,13],[65,10,16,26,13],
    [66,10,17,26,13],[67,10,17,27,13],[68,10,17,27,14],[69,10,17,28,14],[70,11,17,28,14],
    [71,11,18,28,14],[72,11,18,29,14],[73,11,18,29,15],[74,11,19,29,15],[75,11,19,30,15],
    [76,11,19,31,15],[77,12,19,31,15],[78,12,20,31,15],[79,12,20,32,15],[80,12,20,32,16],
    [81,12,20,33,16],[82,12,21,33,16],[83,12,21,33,17],[84,13,21,33,17],[85,13,21,34,17],
    [86,13,22,34,17],[87,13,22,35,17],[88,13,22,35,18],[89,13,22,36,18],[90,14,22,36,18],
    [91,14,23,36,18],[92,14,23,37,18],[93,14,23,37,19],[94,14,24,37,19],[95,14,24,38,19],
    [96,14,24,39,19],[97,15,24,39,19],[98,15,25,39,19],[99,15,25,40,19],[100,15,25,40,20],
    [101,15,25,41,20],[102,15,26,41,20],[103,15,26,41,21],[104,16,26,41,21],[105,16,26,42,21],
    [106,16,27,42,21],[107,16,27,43,21],[108,16,27,43,22],[109,16,27,44,22],[110,17,27,44,22],
    [111,17,28,44,22],[112,17,28,45,22],[113,17,28,45,23],[114,17,29,45,23],[115,17,29,46,23],
    [116,17,29,47,23],[117,18,29,47,23],[118,18,30,47,23],[119,18,30,48,23],[120,18,30,48,24],
    [121,18,30,49,24],[122,18,31,49,24],[123,18,31,49,25],[124,19,31,49,25],[125,19,31,50,25],
    [126,19,32,50,25],[127,19,32,51,25],[128,19,32,51,26],[129,19,32,52,26],[130,20,32,52,26],
    [131,20,33,52,26],[132,20,33,53,26],[133,20,33,53,27],[134,20,34,53,27],[135,20,34,54,27],
    [136,20,34,55,27],[137,21,34,55,27],[138,21,35,55,27],[139,21,35,56,27],[140,21,35,56,28],
    [141,21,35,57,28],[142,21,36,57,28],[143,21,36,57,29],[144,22,36,57,29],[145,22,36,58,29],
    [146,22,37,58,29],[147,22,37,59,29],[148,22,37,59,30],[149,22,37,60,30],[150,23,37,60,30],
    [151,23,38,60,30],[152,23,38,61,30],[153,23,38,61,31],[154,23,39,61,31],[155,23,39,62,31],
    [156,23,39,63,31],[157,24,39,63,31],[158,24,40,63,31],[159,24,40,64,31],[160,24,40,64,32],
    [161,24,40,65,32],[162,24,41,65,32],[163,24,41,65,33],[164,25,41,65,33],[165,25,41,66,33],
    [166,25,42,66,33],[167,25,42,67,33],[168,25,42,67,34],[169,25,42,68,34],[170,26,42,68,34],
    [171,26,43,68,34],[172,26,43,69,34],[173,26,43,69,35],[174,26,44,69,35],[175,26,44,70,35],
    [176,26,44,71,35],[177,27,44,71,35],[178,27,45,71,35],[179,27,45,72,35],[180,27,45,72,36],
    [181,27,45,73,36],[182,27,46,73,36],[183,27,46,73,37],[184,28,46,73,37],[185,28,46,74,37],
    [186,28,47,74,37],[187,28,47,75,37],[188,28,47,75,38],[189,28,47,76,38],[190,29,47,76,38],
    [191,29,48,76,38],[192,29,48,77,38],[193,29,48,77,39],[194,29,49,77,39],[195,29,49,78,39],
    [196,29,49,79,39],[197,30,49,79,39],[198,30,50,79,39],[199,30,50,80,39],[200,30,50,80,40],
    [201,30,50,81,40],[202,30,51,81,40],[203,30,51,81,41],[204,31,51,81,41],[205,31,51,82,41],
    [206,31,52,82,41],[207,31,52,83,41],[208,31,52,83,42],[209,31,52,84,42],[210,32,52,84,42],
    [211,32,53,84,42],[212,32,53,85,42],[213,32,53,85,43],[214,32,54,85,43],[215,32,54,86,43],
    [216,32,54,87,43],[217,33,54,87,43],[218,33,55,87,43],[219,33,55,88,43],[220,33,55,88,44],
    [221,33,55,89,44],[222,33,56,89,44],[223,33,56,89,45],[224,34,56,89,45],[225,34,56,90,45],
    [226,34,57,90,45],[227,34,57,91,45],[228,34,57,91,46],[229,34,57,92,46],[230,35,57,92,46],
    [231,35,58,92,46],[232,35,58,93,46],[233,35,58,93,47],[234,35,59,93,47],[235,35,59,94,47],
    [236,35,59,95,47],[237,36,59,95,47],[238,36,60,95,47],[239,36,60,96,47],[240,36,60,96,48],
    [241,36,60,97,48],[242,36,61,97,48],[243,36,61,97,49],[244,37,61,97,49],[245,37,61,98,49],
    [246,37,62,98,49],[247,37,62,99,49],[248,37,62,99,50],[249,37,62,100,50],[250,38,62,100,50],
    [251,38,63,100,50],[252,38,63,101,50],[253,38,63,101,51],[254,38,64,101,51],[255,38,64,102,51],
    [256,38,64,103,51],[257,39,64,103,51],[258,39,65,103,51],[259,39,65,104,51],[260,39,65,104,52],
    [261,39,65,105,52],[262,39,66,105,52],[263,39,66,105,53],[264,40,66,105,53],[265,40,66,106,53],
  ];
  for (const [total, b, l, d, i] of data) {
    OCONUS_MIE_BREAKDOWN_MAP[total] = { mieTotal: total, breakfast: b, lunch: l, dinner: d, incidentals: i };
  }
}
buildOconusMieTable();

/**
 * Get CONUS M&IE breakdown by total M&IE rate
 * CONUS locations only have 5 specific M&IE tiers ($68, $74, $80, $86, $92)
 * Uses exact match or closest tier for edge cases
 */
export function getMIEBreakdown(mieTotal: number): MIEBreakdown {
  if (isNaN(mieTotal) || mieTotal <= 0) {
    return { mieTotal: 0, breakfast: 0, lunch: 0, dinner: 0, incidentals: 0 };
  }

  const exactMatch = CONUS_MIE_BREAKDOWN_TABLE.find(b => b.mieTotal === mieTotal);
  if (exactMatch) return exactMatch;

  let closest = CONUS_MIE_BREAKDOWN_TABLE[0];
  let minDiff = Math.abs(mieTotal - closest.mieTotal);
  for (const breakdown of CONUS_MIE_BREAKDOWN_TABLE) {
    const diff = Math.abs(mieTotal - breakdown.mieTotal);
    if (diff < minDiff) {
      minDiff = diff;
      closest = breakdown;
    }
  }
  return { ...closest, mieTotal };
}

/**
 * Get OCONUS M&IE breakdown by total M&IE rate
 * Uses the official GSA dollar-by-dollar breakdown table ($1-$265)
 * For rates > $265: 15% breakfast, 25% lunch, 40% dinner, remainder incidentals
 */
export function getOconusMIEBreakdown(mieTotal: number): MIEBreakdown {
  if (isNaN(mieTotal) || mieTotal <= 0) {
    return { mieTotal: 0, breakfast: 0, lunch: 0, dinner: 0, incidentals: 0 };
  }

  const rounded = Math.round(mieTotal);
  const exactMatch = OCONUS_MIE_BREAKDOWN_MAP[rounded];
  if (exactMatch) return { ...exactMatch, mieTotal: rounded };

  if (rounded > 265) {
    const breakfast = Math.round(rounded * 0.15);
    const lunch = Math.round(rounded * 0.25);
    const dinner = Math.round(rounded * 0.40);
    const incidentals = rounded - breakfast - lunch - dinner;
    return { mieTotal: rounded, breakfast, lunch, dinner, incidentals };
  }

  let closest = OCONUS_MIE_BREAKDOWN_MAP[1];
  let minDiff = Math.abs(rounded - 1);
  for (const key in OCONUS_MIE_BREAKDOWN_MAP) {
    const diff = Math.abs(rounded - parseInt(key));
    if (diff < minDiff) {
      minDiff = diff;
      closest = OCONUS_MIE_BREAKDOWN_MAP[parseInt(key)];
    }
  }
  return { ...closest, mieTotal: rounded };
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
  const breakdown = getOconusMIEBreakdown(rate.meals);
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
