import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

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
  initialDays?: PerDiemDay[];
  onDaysChange: (days: PerDiemDay[]) => void;
  onTotalChange: (total: number) => void;
}

function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
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
  initialDays,
  onDaysChange,
  onTotalChange,
}: PerDiemMatrixProps) {
  const [days, setDays] = useState<PerDiemDay[]>([]);
  const [breakdown, setBreakdown] = useState<MIEBreakdown | null>(null);
  const [gsaRate, setGsaRate] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);
  const [rateError, setRateError] = useState<string | null>(null);

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
    const fetchBreakdown = async () => {
      const hasLocation = (city && state) || zip;
      if (!hasLocation) {
        setBreakdown(null);
        setGsaRate(0);
        setRateError(null);
        return;
      }
      
      setIsLoading(true);
      setRateError(null);
      try {
        let url = '';
        if (zip) {
          url = `/api/perdiem/rates/zip/${zip}`;
        } else if (city && state) {
          url = `/api/perdiem/rates/city/${encodeURIComponent(city)}/state/${state}`;
        }
        
        if (url) {
          const rate = await apiRequest(url);
          if (rate && rate.meals) {
            setGsaRate(rate.meals);
            const mieBreakdown = await apiRequest(`/api/perdiem/mie-breakdown/${rate.meals}`);
            setBreakdown(mieBreakdown);
          } else {
            setRateError("Could not find GSA rates for this location. Using default rates.");
            setBreakdown({ mieTotal: 68, breakfast: 16, lunch: 19, dinner: 28, incidentals: 5 });
          }
        }
      } catch (error) {
        console.error('Error fetching GSA rates:', error);
        setRateError("Could not load GSA rates. Using default rates.");
        setBreakdown({ mieTotal: 68, breakfast: 16, lunch: 19, dinner: 28, incidentals: 5 });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBreakdown();
  }, [city, state, zip]);

  useEffect(() => {
    if (!breakdown || days.length === 0) return;
    
    let total = 0;
    for (const day of days) {
      if (!day.isClientEngagement) continue;
      
      let dayAmount = 0;
      if (day.breakfast) dayAmount += breakdown.breakfast;
      if (day.lunch) dayAmount += breakdown.lunch;
      if (day.dinner) dayAmount += breakdown.dinner;
      if (day.incidentals) dayAmount += breakdown.incidentals;
      
      if (day.isPartialDay && dayAmount > 0) {
        dayAmount = Math.round(dayAmount * 0.75 * 100) / 100;
      }
      
      total += dayAmount;
    }
    
    setTotalAmount(Math.round(total * 100) / 100);
    onTotalChange(Math.round(total * 100) / 100);
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
    if (day.breakfast) total += breakdown.breakfast;
    if (day.lunch) total += breakdown.lunch;
    if (day.dinner) total += breakdown.dinner;
    if (day.incidentals) total += breakdown.incidentals;
    
    if (day.isPartialDay && total > 0) {
      total = Math.round(total * 0.75 * 100) / 100;
    }
    
    return total;
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
        {breakdown && (
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline">Breakfast: ${breakdown.breakfast}</Badge>
            <Badge variant="outline">Lunch: ${breakdown.lunch}</Badge>
            <Badge variant="outline">Dinner: ${breakdown.dinner}</Badge>
            <Badge variant="outline">Incidentals: ${breakdown.incidentals}</Badge>
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
          <p className="text-sm text-muted-foreground">Loading GSA rates...</p>
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
                        <span className="text-xs text-muted-foreground">${breakdown?.breakfast || '-'}</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center w-[90px]">
                      <div className="flex flex-col items-center gap-1">
                        <span>Lunch</span>
                        <span className="text-xs text-muted-foreground">${breakdown?.lunch || '-'}</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center w-[90px]">
                      <div className="flex flex-col items-center gap-1">
                        <span>Dinner</span>
                        <span className="text-xs text-muted-foreground">${breakdown?.dinner || '-'}</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center w-[90px]">
                      <div className="flex flex-col items-center gap-1">
                        <span>Incidentals</span>
                        <span className="text-xs text-muted-foreground">${breakdown?.incidentals || '-'}</span>
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
