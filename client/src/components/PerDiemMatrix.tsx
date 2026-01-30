import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

export type PerDiemLocationType = "conus" | "oconus";

export interface PerDiemDay {
  date: string;
  isClientEngagement: boolean;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  incidentals: boolean;
  isPartialDay: boolean;
}

export interface MIEBreakdown {
  mieTotal: number;
  breakfast: number;
  lunch: number;
  dinner: number;
  incidentals: number;
}

interface PerDiemMatrixProps {
  startDate: string;
  endDate: string;
  city?: string;
  state?: string;
  zip?: string;
  locationType?: PerDiemLocationType;
  oconusCountry?: string;
  oconusLocation?: string;
  initialDays?: PerDiemDay[];
  onDaysChange: (days: PerDiemDay[]) => void;
  onTotalChange: (total: number) => void;
  onBreakdownChange?: (breakdown: MIEBreakdown | null) => void;
  onLocationTypeChange?: (type: PerDiemLocationType) => void;
  onCityChange?: (city: string) => void;
  onStateChange?: (state: string) => void;
  onZipChange?: (zip: string) => void;
  onOconusCountryChange?: (country: string) => void;
  onOconusLocationChange?: (location: string) => void;
}

function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  
  const current = new Date(startDate);
  while (current <= endDate) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function PerDiemMatrix({
  startDate,
  endDate,
  city,
  state,
  zip,
  locationType = "conus",
  oconusCountry,
  oconusLocation,
  initialDays,
  onDaysChange,
  onTotalChange,
  onBreakdownChange,
  onLocationTypeChange,
  onCityChange,
  onStateChange,
  onZipChange,
  onOconusCountryChange,
  onOconusLocationChange,
}: PerDiemMatrixProps) {
  const [days, setDays] = useState<PerDiemDay[]>([]);
  const [breakdown, setBreakdown] = useState<MIEBreakdown | null>(null);
  const [gsaRate, setGsaRate] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);
  const [rateError, setRateError] = useState<string | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [locationsLoading, setLocationsLoading] = useState(false);

  useEffect(() => {
    if (!startDate || !endDate) return;
    
    const dateRange = generateDateRange(startDate, endDate);
    const numDays = dateRange.length;
    
    if (initialDays && initialDays.length === numDays) {
      setDays(initialDays);
    } else {
      const newDays: PerDiemDay[] = dateRange.map((date, index) => ({
        date,
        isClientEngagement: true,
        breakfast: true,
        lunch: true,
        dinner: true,
        incidentals: true,
        isPartialDay: index === 0 || index === numDays - 1,
      }));
      setDays(newDays);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    const fetchCountries = async () => {
      if (locationType !== "oconus") return;
      setCountriesLoading(true);
      try {
        const result = await apiRequest("/api/oconus/countries");
        setCountries(result || []);
      } catch (error) {
        console.error("Error fetching OCONUS countries:", error);
        setCountries([]);
      } finally {
        setCountriesLoading(false);
      }
    };
    fetchCountries();
  }, [locationType]);

  useEffect(() => {
    const fetchLocations = async () => {
      if (locationType !== "oconus" || !oconusCountry) {
        setLocations([]);
        return;
      }
      setLocationsLoading(true);
      try {
        const result = await apiRequest(`/api/oconus/locations/${encodeURIComponent(oconusCountry)}`);
        setLocations(result || []);
      } catch (error) {
        console.error("Error fetching OCONUS locations:", error);
        setLocations([]);
      } finally {
        setLocationsLoading(false);
      }
    };
    fetchLocations();
  }, [locationType, oconusCountry]);

  useEffect(() => {
    const fetchBreakdown = async () => {
      if (locationType === "oconus") {
        if (!oconusCountry || !oconusLocation) {
          setBreakdown(null);
          setGsaRate(0);
          setRateError(null);
          return;
        }
        
        setIsLoading(true);
        setRateError(null);
        try {
          const rate = await apiRequest(`/api/oconus/rate?country=${encodeURIComponent(oconusCountry)}&location=${encodeURIComponent(oconusLocation)}&date=${startDate}`);
          if (rate && rate.mie) {
            setGsaRate(rate.mie);
            const mieBreakdown = await apiRequest(`/api/perdiem/mie-breakdown/${rate.mie}`);
            setBreakdown(mieBreakdown);
          } else {
            setRateError("Could not find OCONUS rates for this location.");
            setBreakdown(null);
          }
        } catch (error) {
          console.error("Error fetching OCONUS rates:", error);
          setRateError("Could not load OCONUS rates for this location.");
          setBreakdown(null);
        } finally {
          setIsLoading(false);
        }
        return;
      }
      
      // For ZIP codes, only lookup if it's a valid 5-digit format
      const isValidZip = zip && /^\d{5}$/.test(zip);
      const hasLocation = (city && state) || isValidZip;
      
      if (!hasLocation) {
        // Don't show error while user is still typing ZIP
        if (zip && zip.length > 0 && zip.length < 5) {
          // User is typing - don't clear or show error
          return;
        }
        setBreakdown(null);
        setGsaRate(0);
        setRateError(null);
        return;
      }
      
      setIsLoading(true);
      setRateError(null);
      try {
        let url = '';
        if (isValidZip) {
          url = `/api/perdiem/rates/zip/${zip}`;
        } else if (city && state) {
          url = `/api/perdiem/rates/city/${encodeURIComponent(city)}/state/${state}`;
        }
        
        if (url) {
          console.log('[PerDiemMatrix] Fetching GSA rates from:', url);
          const rate = await apiRequest(url);
          console.log('[PerDiemMatrix] Response:', JSON.stringify(rate));
          if (rate && rate.meals) {
            setGsaRate(rate.meals);
            const mieBreakdown = await apiRequest(`/api/perdiem/mie-breakdown/${rate.meals}`);
            setBreakdown(mieBreakdown);
          } else {
            setRateError("Could not find GSA rates for this location. Using default rates.");
            setBreakdown({ mieTotal: 68, breakfast: 16, lunch: 19, dinner: 28, incidentals: 5 });
          }
        }
      } catch (error: any) {
        console.error('Error fetching GSA rates:', error);
        const errorMessage = error?.message || 'Unknown error';
        setRateError(`Could not load GSA rates: ${errorMessage}. Using default rates.`);
        setBreakdown({ mieTotal: 68, breakfast: 16, lunch: 19, dinner: 28, incidentals: 5 });
      } finally {
        setIsLoading(false);
      }
    };
    
    // Debounce the fetch to avoid calling API on every keystroke
    const timeoutId = setTimeout(fetchBreakdown, 300);
    return () => clearTimeout(timeoutId);
  }, [city, state, zip, locationType, oconusCountry, oconusLocation, startDate]);

  // Notify parent when breakdown changes
  useEffect(() => {
    if (onBreakdownChange) {
      onBreakdownChange(breakdown);
    }
  }, [breakdown, onBreakdownChange]);

  useEffect(() => {
    if (!breakdown || days.length === 0) return;
    
    let total = 0;
    for (const day of days) {
      if (!day.isClientEngagement) continue;
      
      let dayAmount = 0;
      if (day.breakfast && !isNaN(breakdown.breakfast)) dayAmount += breakdown.breakfast;
      if (day.lunch && !isNaN(breakdown.lunch)) dayAmount += breakdown.lunch;
      if (day.dinner && !isNaN(breakdown.dinner)) dayAmount += breakdown.dinner;
      if (day.incidentals && !isNaN(breakdown.incidentals)) dayAmount += breakdown.incidentals;
      
      if (day.isPartialDay && dayAmount > 0) {
        dayAmount = Math.round(dayAmount * 0.75 * 100) / 100;
      }
      
      total += dayAmount;
    }
    
    const finalTotal = isNaN(total) ? 0 : Math.round(total * 100) / 100;
    setTotalAmount(finalTotal);
    onTotalChange(finalTotal);
    onDaysChange(days);
  }, [days, breakdown]);

  const updateDay = (index: number, field: keyof PerDiemDay, value: boolean) => {
    const newDays = [...days];
    newDays[index] = { ...newDays[index], [field]: value };
    
    if (field === 'isClientEngagement' && !value) {
      newDays[index].breakfast = false;
      newDays[index].lunch = false;
      newDays[index].dinner = false;
      newDays[index].incidentals = false;
    } else if (field === 'isClientEngagement' && value) {
      newDays[index].breakfast = true;
      newDays[index].lunch = true;
      newDays[index].dinner = true;
      newDays[index].incidentals = true;
    }
    
    setDays(newDays);
  };

  const toggleAllMeals = (mealType: 'breakfast' | 'lunch' | 'dinner' | 'incidentals', checked: boolean) => {
    const newDays = days.map(day => ({
      ...day,
      [mealType]: day.isClientEngagement ? checked : false,
    }));
    setDays(newDays);
  };

  const calculateDayTotal = (day: PerDiemDay): number => {
    if (!breakdown || !day.isClientEngagement) return 0;
    
    let total = 0;
    if (day.breakfast && !isNaN(breakdown.breakfast)) total += breakdown.breakfast;
    if (day.lunch && !isNaN(breakdown.lunch)) total += breakdown.lunch;
    if (day.dinner && !isNaN(breakdown.dinner)) total += breakdown.dinner;
    if (day.incidentals && !isNaN(breakdown.incidentals)) total += breakdown.incidentals;
    
    if (day.isPartialDay && total > 0) {
      total = Math.round(total * 0.75 * 100) / 100;
    }
    
    return isNaN(total) ? 0 : total;
  };

  if (!startDate || !endDate) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Select start and end dates to configure per diem.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Per Diem Meal Components</CardTitle>
        <CardDescription>
          Uncheck any meals provided by the client. Uncheck entire days with no client engagement.
        </CardDescription>
        
        <div className="mt-4 space-y-4">
          <div className="flex items-center space-x-3">
            <Checkbox
              id="oconus-checkbox"
              checked={locationType === "oconus"}
              onCheckedChange={(checked) => onLocationTypeChange?.(checked ? "oconus" : "conus")}
            />
            <Label htmlFor="oconus-checkbox" className="text-sm font-medium cursor-pointer">
              Outside Continental US (OCONUS)
            </Label>
          </div>
          
          {locationType === "conus" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">City</Label>
                  <Input
                    value={city || ""}
                    onChange={(e) => onCityChange?.(e.target.value)}
                    placeholder="e.g. Seattle"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">State</Label>
                  <Input
                    value={state || ""}
                    onChange={(e) => onStateChange?.(e.target.value)}
                    placeholder="e.g. WA"
                    maxLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">OR ZIP Code</Label>
                  <Input
                    value={zip || ""}
                    onChange={(e) => onZipChange?.(e.target.value)}
                    placeholder="e.g. 90210"
                    maxLength={5}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Enter City/State or ZIP code to look up GSA per diem rates</p>
            </div>
          )}
          
          {locationType === "oconus" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Country</Label>
                <Select
                  value={oconusCountry || ""}
                  onValueChange={(value) => {
                    onOconusCountryChange?.(value);
                    onOconusLocationChange?.("");
                  }}
                  disabled={countriesLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={countriesLoading ? "Loading..." : "Select country"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {countries.map((country) => (
                      <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm">City / Location</Label>
                <Select
                  value={oconusLocation || ""}
                  onValueChange={(value) => onOconusLocationChange?.(value)}
                  disabled={!oconusCountry || locationsLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={locationsLoading ? "Loading..." : "Select location"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {locations.map((loc) => (
                      <SelectItem key={loc} value={loc}>
                        {loc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        
        {breakdown && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="outline">Breakfast: ${isNaN(breakdown.breakfast) ? '-' : breakdown.breakfast}</Badge>
            <Badge variant="outline">Lunch: ${isNaN(breakdown.lunch) ? '-' : breakdown.lunch}</Badge>
            <Badge variant="outline">Dinner: ${isNaN(breakdown.dinner) ? '-' : breakdown.dinner}</Badge>
            <Badge variant="outline">Incidentals: ${isNaN(breakdown.incidentals) ? '-' : breakdown.incidentals}</Badge>
          </div>
        )}
        {rateError && (
          <div className="text-sm text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
            <span>⚠️</span> {rateError}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading {locationType === "oconus" ? "OCONUS" : "GSA"} rates...</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Date</TableHead>
                    <TableHead className="text-center w-[100px]">
                      <div className="flex flex-col items-center gap-1">
                        <span>Engaged</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center w-[90px]">
                      <div className="flex flex-col items-center gap-1">
                        <span>Breakfast</span>
                        <span className="text-xs text-muted-foreground">${breakdown?.breakfast && !isNaN(breakdown.breakfast) ? breakdown.breakfast : '-'}</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center w-[90px]">
                      <div className="flex flex-col items-center gap-1">
                        <span>Lunch</span>
                        <span className="text-xs text-muted-foreground">${breakdown?.lunch && !isNaN(breakdown.lunch) ? breakdown.lunch : '-'}</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center w-[90px]">
                      <div className="flex flex-col items-center gap-1">
                        <span>Dinner</span>
                        <span className="text-xs text-muted-foreground">${breakdown?.dinner && !isNaN(breakdown.dinner) ? breakdown.dinner : '-'}</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center w-[90px]">
                      <div className="flex flex-col items-center gap-1">
                        <span>Incidentals</span>
                        <span className="text-xs text-muted-foreground">${breakdown?.incidentals && !isNaN(breakdown.incidentals) ? breakdown.incidentals : '-'}</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-right w-[80px]">Day Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {days.map((day, index) => (
                    <TableRow key={day.date} className={!day.isClientEngagement ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {formatDate(day.date)}
                          {day.isPartialDay && (
                            <Badge variant="secondary" className="text-xs">75%</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={day.isClientEngagement}
                          onCheckedChange={(checked) => updateDay(index, 'isClientEngagement', checked as boolean)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={day.breakfast}
                          onCheckedChange={(checked) => updateDay(index, 'breakfast', checked as boolean)}
                          disabled={!day.isClientEngagement}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={day.lunch}
                          onCheckedChange={(checked) => updateDay(index, 'lunch', checked as boolean)}
                          disabled={!day.isClientEngagement}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={day.dinner}
                          onCheckedChange={(checked) => updateDay(index, 'dinner', checked as boolean)}
                          disabled={!day.isClientEngagement}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={day.incidentals}
                          onCheckedChange={(checked) => updateDay(index, 'incidentals', checked as boolean)}
                          disabled={!day.isClientEngagement}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${calculateDayTotal(day).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {days.filter(d => d.isClientEngagement).length} of {days.length} days with client engagement
              </div>
              <div className="text-lg font-bold">
                Total: ${totalAmount.toFixed(2)}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
