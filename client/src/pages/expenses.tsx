import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertExpenseSchema, type Expense, type Project, type Client, type User } from "@shared/schema";
import { format, addDays, differenceInDays } from "date-fns";
import { getTodayBusinessDate, formatBusinessDate, parseBusinessDate, parseBusinessDateOrToday } from "@/lib/date-utils";
import { CalendarIcon, Plus, Receipt, Upload, DollarSign, Edit, Save, X, Car, FileText, Trash2, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { formatProjectLabel } from "@/lib/project-utils";
import { PerDiemMatrix, type PerDiemDay, type PerDiemLocationType } from "@/components/PerDiemMatrix";
import { AirportSearchInput } from "@/components/airport-search-input";

const expenseFormSchema = insertExpenseSchema.omit({
  personId: true, // Server-side only
  amount: true, // Override amount to handle as string
}).extend({
  date: z.string(),
  amount: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, {
    message: "Must be a valid positive number",
  }),
  miles: z.string().optional(), // Separate field for miles input (not sent to backend)
  projectResourceId: z.string().optional(), // Optional person assignment
  perDiemCity: z.string().optional(), // Per diem location
  perDiemState: z.string().optional(),
  perDiemZip: z.string().optional(),
  perDiemLocationType: z.enum(["conus", "oconus"]).optional().default("conus"), // CONUS vs OCONUS
  perDiemOconusCountry: z.string().optional(), // OCONUS country
  perDiemOconusLocation: z.string().optional(), // OCONUS city/location
  perDiemStartDate: z.string().optional(), // Start date for per diem range
  perDiemEndDate: z.string().optional(), // End date for per diem range
  perDiemDays: z.string().optional(), // Number of days for per diem (auto-calculated from date range)
  perDiemIncludeLodging: z.boolean().optional(), // Include lodging in per diem calculation
  perDiemItemize: z.boolean().optional(), // Break per diem into individual daily charges
  departureAirport: z.string().optional(), // 3-letter airport code for departure
  arrivalAirport: z.string().optional(), // 3-letter airport code for arrival  
  isRoundTrip: z.boolean().optional(), // Round trip vs one-way
}).refine((data) => {
  // Validate that miles is positive when category is mileage
  if (data.category === "mileage") {
    const miles = parseFloat(data.miles || "0");
    return !isNaN(miles) && miles > 0;
  }
  return true;
}, {
  message: "Miles must be greater than 0 for mileage expenses",
  path: ["miles"],
}).refine((data) => {
  // Validate per diem fields
  if (data.category === "perdiem") {
    const days = parseFloat(data.perDiemDays || "0");
    if (isNaN(days) || days <= 0) {
      return false;
    }
    // Must have location for either CONUS or OCONUS
    if (data.perDiemLocationType === "oconus") {
      return !!(data.perDiemOconusCountry && data.perDiemOconusLocation);
    }
    // CONUS: Must have either city/state OR zip
    const hasLocation = (data.perDiemCity && data.perDiemState) || data.perDiemZip;
    return !!hasLocation;
  }
  return true;
}, {
  message: "Per diem requires days and location (city/state or ZIP)",
  path: ["perDiemDays"],
}).refine((data) => {
  // Validate airfare airport codes
  if (data.category === "airfare") {
    const airportCodeRegex = /^[A-Z]{3}$/;
    const depCode = data.departureAirport?.toUpperCase() || "";
    const arrCode = data.arrivalAirport?.toUpperCase() || "";
    return airportCodeRegex.test(depCode) && airportCodeRegex.test(arrCode);
  }
  return true;
}, {
  message: "Departure and arrival airport codes must be 3 letters (e.g., SEA, LAX)",
  path: ["departureAirport"],
}).refine((data) => {
  // Ensure required fields are not empty strings
  if (data.category && data.projectId && data.description !== undefined) {
    return data.category.trim() !== "" && data.projectId.trim() !== "";
  }
  return true;
}, {
  message: "Category and Project must be selected",
  path: ["category"],
});

type ExpenseFormData = z.infer<typeof expenseFormSchema>;

const EXPENSE_CATEGORIES = [
  { value: "travel", label: "Travel" },
  { value: "hotel", label: "Hotel" },
  { value: "meals", label: "Meals" },
  { value: "taxi", label: "Taxi/Transportation" },
  { value: "airfare", label: "Airfare" },
  { value: "carrental", label: "Car Rental" },
  { value: "parking", label: "Parking" },
  { value: "entertainment", label: "Entertainment" },
  { value: "other", label: "Other" },
  { value: "mileage", label: "Mileage" },
  { value: "perdiem", label: "Per Diem" },
];

export default function Expenses() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null);
  const [showAllExpenses, setShowAllExpenses] = useState<boolean>(false); // Default: show pending only
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const editReceiptInputRef = useRef<HTMLInputElement>(null);
  const [mileageRate, setMileageRate] = useState<number>(0.70); // Default mileage rate
  const [perDiemBreakdown, setPerDiemBreakdown] = useState<any>(null); // Per diem calculation breakdown
  const [isCalculatingPerDiem, setIsCalculatingPerDiem] = useState<boolean>(false);
  const [perDiemDaySelections, setPerDiemDaySelections] = useState<PerDiemDay[]>([]); // Per diem matrix day selections
  const [perDiemCalculatedTotal, setPerDiemCalculatedTotal] = useState<number>(0);
  const [perDiemMieBreakdown, setPerDiemMieBreakdown] = useState<{ mieTotal: number; breakfast: number; lunch: number; dinner: number; incidentals: number } | null>(null);
  const [prevCategory, setPrevCategory] = useState<string>("");
  const [editPrevCategory, setEditPrevCategory] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showImportDialog, setShowImportDialog] = useState<boolean>(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<boolean>(false);
  const [importResults, setImportResults] = useState<any>(null);
  const [datePickerOpen, setDatePickerOpen] = useState<boolean>(false);
  const [perDiemStartDateOpen, setPerDiemStartDateOpen] = useState<boolean>(false);
  const [perDiemEndDateOpen, setPerDiemEndDateOpen] = useState<boolean>(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasAnyRole } = useAuth();
  const [, navigate] = useLocation();

  // Check if current user can assign expenses to other people (create on behalf of others)
  const canAssignToPerson = hasAnyRole(['admin', 'pm', 'billing-admin', 'executive', 'global_admin', 'constellation_admin']);

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      date: getTodayBusinessDate(),
      amount: "0",
      currency: "USD",
      billable: true,
      reimbursable: true,
      description: "",
      vendor: "",
      category: "",
      projectId: "",
      projectResourceId: "",
      miles: "",
      quantity: "",
      unit: "",
      perDiemCity: "",
      perDiemState: "",
      perDiemZip: "",
      perDiemLocationType: "conus" as PerDiemLocationType,
      perDiemOconusCountry: "",
      perDiemOconusLocation: "",
      perDiemStartDate: "",
      perDiemEndDate: "",
      perDiemDays: "",
      perDiemIncludeLodging: false,
      perDiemItemize: false,
      departureAirport: "",
      arrivalAirport: "",
      isRoundTrip: false,
    },
  });

  const { data: projects = [] } = useQuery<(Project & { client: Client })[]>({
    queryKey: ["/api/projects"],
  });

  const { data: expenses = [], isLoading } = useQuery<(Expense & { 
    project: Project & { client: Client };
    expenseReport?: { id: string; reportNumber: string; title: string; status: string } | null;
  })[]>({
    queryKey: ["/api/expenses", { pendingOnly: !showAllExpenses }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('pendingOnly', (!showAllExpenses).toString());
      const response = await fetch(`/api/expenses?${params.toString()}`, {
        headers: {
          'X-Session-Id': localStorage.getItem('sessionId') || '',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch expenses');
      return response.json();
    },
  });

  // Filter and format projects: only active, with CLIENTSHORTNAME | Project name format
  const activeProjects = useMemo(() => {
    return projects
      .filter(p => p.status === 'active')
      .map(p => ({
        ...p,
        displayLabel: formatProjectLabel(p)
      }))
      .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
  }, [projects]);

  // Fetch users for person assignment (only for admin/PM roles)
  const { data: users = [], error: usersError } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: canAssignToPerson,
    retry: (failureCount, error: any) => {
      // Don't retry if it's a 403 (unauthorized)
      if (error?.message?.includes('403')) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Fetch MILEAGE_RATE from the dedicated endpoint
  const { data: mileageRateData } = useQuery<{ rate: number }>({
    queryKey: ["/api/expenses/mileage-rate"],
    retry: false,
  });

  // Update mileage rate when data is loaded
  useEffect(() => {
    if (mileageRateData && mileageRateData.rate > 0) {
      setMileageRate(mileageRateData.rate);
    }
  }, [mileageRateData]);

  // Watch for category changes to handle mileage
  const watchedCategory = form.watch("category");
  const watchedMiles = form.watch("miles");
  
  // Airport code validation
  const watchedDepartureAirport = form.watch("departureAirport");
  const watchedArrivalAirport = form.watch("arrivalAirport");
  
  type AirportInfo = {
    id: string;
    iataCode: string;
    name: string;
    municipality: string | null;
    isoCountry: string | null;
    isoRegion: string | null;
  };
  
  const { data: departureAirportInfo, isLoading: departureLoading } = useQuery<AirportInfo | null>({
    queryKey: ["/api/airports", watchedDepartureAirport?.toUpperCase()],
    enabled: watchedCategory === "airfare" && watchedDepartureAirport?.length === 3,
    staleTime: 60000,
    retry: false,
  });
  
  const { data: arrivalAirportInfo, isLoading: arrivalLoading } = useQuery<AirportInfo | null>({
    queryKey: ["/api/airports", watchedArrivalAirport?.toUpperCase()],
    enabled: watchedCategory === "airfare" && watchedArrivalAirport?.length === 3,
    staleTime: 60000,
    retry: false,
  });

  // Auto-calculate amount when miles change for mileage category
  // Clear quantity/unit when switching away from mileage
  useEffect(() => {
    // Skip effect during form submission to avoid race conditions
    if (isSubmitting) return;

    if (watchedCategory === "mileage" && watchedMiles) {
      const miles = parseFloat(watchedMiles);
      if (!isNaN(miles) && miles > 0) {
        const calculatedAmount = (miles * mileageRate).toFixed(2);
        console.log('CREATE FORM: Mileage calculation:', { miles, mileageRate, calculatedAmount });
        form.setValue("amount", calculatedAmount);
        // Store quantity as string in form (will be converted to number on submit)
        form.setValue("quantity", miles.toString());
        form.setValue("unit", "mile");
      }
    } else if (prevCategory === "mileage" && watchedCategory !== "mileage" && watchedCategory !== "") {
      // Clear quantity and unit when switching away from mileage to another category
      console.log('CREATE FORM: Clearing mileage fields, switching from mileage to:', watchedCategory);
      form.setValue("quantity", "");
      form.setValue("unit", "");
      form.setValue("miles", "");
    }

    // Only update prevCategory if we have a valid category change
    if (watchedCategory !== prevCategory) {
      setPrevCategory(watchedCategory);
    }
  }, [watchedCategory, watchedMiles, mileageRate, form, prevCategory, isSubmitting]);

  // Calculate per diem amount using GSA rates
  const calculatePerDiem = async () => {
    const city = form.getValues("perDiemCity");
    const state = form.getValues("perDiemState");
    const zip = form.getValues("perDiemZip");
    const days = form.getValues("perDiemDays");
    const includeLodging = form.getValues("perDiemIncludeLodging") || false;

    if (!days || parseFloat(days) <= 0) {
      toast({
        title: "Missing days",
        description: "Please enter the number of days",
        variant: "destructive",
      });
      return;
    }

    if (!zip && (!city || !state)) {
      toast({
        title: "Missing location",
        description: "Please enter city/state or ZIP code",
        variant: "destructive",
      });
      return;
    }

    setIsCalculatingPerDiem(true);
    try {
      console.log("[PERDIEM_UI] Calculating per diem...", { city, state, zip, days, includeLodging });
      const response = await apiRequest("/api/perdiem/calculate", {
        method: "POST",
        body: JSON.stringify({
          city,
          state,
          zip,
          days: parseFloat(days),
          includePartialDays: true,
          includeLodging,
        }),
      });

      console.log("[PERDIEM_UI] Calculation response:", response);
      setPerDiemBreakdown(response);
      form.setValue("amount", response.totalAmount.toFixed(2));
      form.setValue("quantity", days);
      form.setValue("unit", "day");
      
      // Auto-populate description with destination and breakdown
      let destination = "";
      if (zip) {
        destination = `ZIP ${zip}`;
      } else if (city && state) {
        destination = `${city}, ${state}`;
      }
      
      const descriptionText = `Travel to: ${destination}\n${response.breakdown}`;
      form.setValue("description", descriptionText);

      toast({
        title: "Per diem calculated",
        description: `$${response.totalAmount.toFixed(2)} (${response.breakdown})`,
      });
    } catch (error: any) {
      console.error("[PERDIEM_UI] Calculation error:", error);
      toast({
        title: "Calculation failed",
        description: error.message || "Could not fetch GSA rates. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCalculatingPerDiem(false);
    }
  };

  const createExpenseMutation = useMutation({
    mutationFn: async (data: any) => {
      // Data should already have numbers from onSubmit
      return apiRequest("/api/expenses", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      // Reset form state completely
      form.reset({
        date: getTodayBusinessDate(),
        amount: "0",
        currency: "USD",
        billable: true,
        reimbursable: true,
        description: "",
        vendor: "",
        category: "",
        projectId: "",
        projectResourceId: "",
        miles: "",
        quantity: "",
        unit: "",
        perDiemCity: "",
        perDiemState: "",
        perDiemZip: "",
        perDiemStartDate: "",
        perDiemEndDate: "",
        perDiemDays: "",
        perDiemIncludeLodging: false,
        perDiemItemize: false,
        perDiemLocationType: "conus" as PerDiemLocationType,
        perDiemOconusCountry: "",
        perDiemOconusLocation: "",
        departureAirport: "",
        arrivalAirport: "",
        isRoundTrip: false,
      });
      // Reset component state
      setPrevCategory("");
      setReceiptFile(null);
      if (receiptInputRef.current) {
        receiptInputRef.current.value = '';
      }
      setPerDiemBreakdown(null);
      toast({
        title: "Expense created",
        description: "Your expense has been logged successfully.",
      });
    },
    onError: (error: any) => {
      console.error('[EXPENSE_CREATE] Mutation error:', error);
      toast({
        title: "Error creating expense",
        description: error?.message || "Failed to create expense. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      // Data should already have numbers from handleUpdateExpense
      const result = await apiRequest(`/api/expenses/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      
      // If there's a receipt file to upload, do it now
      if (editReceiptFile) {
        const formData = new FormData();
        formData.append('file', editReceiptFile);
        
        try {
          const response = await fetch(`/api/expenses/${id}/attachments`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
            headers: {
              'X-Session-Id': localStorage.getItem('sessionId') || '',
            },
          });
          
          if (!response.ok) {
            console.error('Failed to upload receipt:', await response.text());
            throw new Error('Receipt upload failed');
          }
        } catch (uploadError) {
          console.error('Receipt upload error:', uploadError);
          throw new Error('Expense updated but receipt upload failed');
        }
      }
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      setEditingExpenseId(null);
      setEditReceiptFile(null);
      if (editReceiptInputRef.current) {
        editReceiptInputRef.current.value = '';
      }
      toast({
        title: "Expense updated",
        description: editReceiptFile ? "Your expense and receipt have been updated successfully." : "Your expense has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update expense. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/expenses/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expense-reports"] });
      toast({
        title: "Expense deleted",
        description: "The expense has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Cannot delete expense",
        description: error.message || "Failed to delete expense. It may be part of a submitted report or already billed.",
        variant: "destructive",
      });
    },
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const onSubmit = async (data: ExpenseFormData) => {
    // Prevent concurrent submissions
    if (isSubmitting) return;

    console.log('=== CREATE EXPENSE SUBMIT ===');
    console.log('Form data received:', data);

    setIsSubmitting(true);

    try {
      // Validate mileage
      if (data.category === "mileage") {
        const miles = parseFloat(data.miles || "0");
        console.log('Validating mileage:', { miles, isValid: !isNaN(miles) && miles > 0 });
        if (isNaN(miles) || miles <= 0) {
          toast({
            title: "Validation Error",
            description: "Miles must be greater than 0 for mileage expenses",
            variant: "destructive",
          });
          setIsSubmitting(false); // Reset flag on validation error
          return;
        }
      }

      // Check if per diem should be itemized - use the matrix day selections
      // Debug logging to understand why itemization might not trigger
      if (data.category === "perdiem") {
        console.log('Per diem submission debug:', {
          category: data.category,
          daySelectionsLength: perDiemDaySelections.length,
          hasMieBreakdown: !!perDiemMieBreakdown,
          mieBreakdown: perDiemMieBreakdown,
          startDate: data.perDiemStartDate,
          endDate: data.perDiemEndDate,
        });
      }
      
      // Use default MIE breakdown if not available from GSA lookup
      const effectiveMieBreakdown = perDiemMieBreakdown || { 
        mieTotal: 68, 
        breakfast: 16, 
        lunch: 19, 
        dinner: 28, 
        incidentals: 5 
      };
      
      if (data.category === "perdiem" && perDiemDaySelections.length > 0) {
        console.log('Creating itemized per diem expenses from matrix selections...', {
          dayCount: perDiemDaySelections.length,
          usingDefaultRates: !perDiemMieBreakdown,
          rates: effectiveMieBreakdown,
        });
        const baseData = transformExpenseFormData(data, mileageRate);
        const location = baseData.perDiemLocation;
        
        try {
          // Create separate expense for each day with meal details
          const createdExpenses = [];
          let receiptUploadFailures = 0;
          
          // Helper to generate description for a day
          const generateDayDescription = (day: PerDiemDay, rates: typeof effectiveMieBreakdown) => {
            const claimedMeals: string[] = [];
            const clientServedMeals: string[] = [];
            
            // Check each meal
            if (day.breakfast) {
              claimedMeals.push(`Breakfast ($${rates.breakfast})`);
            } else {
              clientServedMeals.push('Breakfast');
            }
            
            if (day.lunch) {
              claimedMeals.push(`Lunch ($${rates.lunch})`);
            } else {
              clientServedMeals.push('Lunch');
            }
            
            if (day.dinner) {
              claimedMeals.push(`Dinner ($${rates.dinner})`);
            } else {
              clientServedMeals.push('Dinner');
            }
            
            if (day.incidentals) {
              claimedMeals.push(`Incidentals ($${rates.incidentals})`);
            } else {
              clientServedMeals.push('Incidentals');
            }
            
            let description = '';
            if (claimedMeals.length > 0) {
              description += `Employee paid: ${claimedMeals.join(', ')}`;
            }
            if (clientServedMeals.length > 0) {
              if (description) description += '\n';
              description += `Client served: ${clientServedMeals.join(', ')}`;
            }
            if (day.isPartialDay) {
              if (description) description += '\n';
              description += '(Partial day - 75% rate)';
            }
            
            return description;
          };
          
          // Calculate amount for a day
          const calculateDayAmount = (day: PerDiemDay, rates: typeof effectiveMieBreakdown) => {
            if (!day.isClientEngagement) return 0;
            
            let total = 0;
            if (day.breakfast) total += rates.breakfast;
            if (day.lunch) total += rates.lunch;
            if (day.dinner) total += rates.dinner;
            if (day.incidentals) total += rates.incidentals;
            
            if (day.isPartialDay && total > 0) {
              total = Math.round(total * 0.75 * 100) / 100;
            }
            
            return total;
          };
          
          for (const day of perDiemDaySelections) {
            // Skip days with no client engagement (amount would be 0)
            if (!day.isClientEngagement) continue;
            
            const dayAmount = calculateDayAmount(day, effectiveMieBreakdown);
            if (dayAmount <= 0) continue;
            
            const dayDescription = generateDayDescription(day, effectiveMieBreakdown);
            const formattedDate = format(new Date(day.date + 'T00:00:00'), 'EEE, MMM d');
            
            const itemizedData = {
              ...baseData,
              date: day.date, // Use the actual date for this day
              amount: dayAmount.toFixed(2),
              quantity: "1", // Each day is quantity 1
              unit: 'day',
              description: `${location}\n${formattedDate}\n${dayDescription}`,
            };
            
            // Call API directly to avoid mutation's onSuccess firing for each expense
            const expense = await apiRequest("/api/expenses", {
              method: "POST",
              body: JSON.stringify(itemizedData),
            });
            createdExpenses.push(expense);
            
            // Upload receipt to each itemized expense if provided
            if (receiptFile && expense.id) {
              const formData = new FormData();
              formData.append('file', receiptFile);

              try {
                const response = await fetch(`/api/expenses/${expense.id}/attachments`, {
                  method: 'POST',
                  body: formData,
                  credentials: 'include',
                  headers: {
                    'X-Session-Id': localStorage.getItem('sessionId') || '',
                  },
                });

                if (!response.ok) {
                  receiptUploadFailures++;
                  console.warn(`Receipt upload failed for expense ${expense.id}`);
                }
              } catch (error) {
                receiptUploadFailures++;
                console.warn(`Receipt upload error for expense ${expense.id}:`, error);
              }
            }
          }
          
          console.log(`Created ${createdExpenses.length} itemized per diem expenses`);
          
          // Invalidate cache after all expenses created
          queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
          
          // Reset form after batch creation
          form.reset({
            date: getTodayBusinessDate(),
            amount: "0",
            currency: "USD",
            billable: true,
            reimbursable: true,
            description: "",
            vendor: "",
            category: "",
            projectId: "",
            projectResourceId: "",
            miles: "",
            quantity: "",
            unit: "",
            perDiemCity: "",
            perDiemState: "",
            perDiemZip: "",
            perDiemStartDate: "",
            perDiemEndDate: "",
            perDiemDays: "",
            perDiemIncludeLodging: false,
            perDiemItemize: false,
            perDiemLocationType: "conus" as PerDiemLocationType,
            perDiemOconusCountry: "",
            perDiemOconusLocation: "",
            departureAirport: "",
            arrivalAirport: "",
            isRoundTrip: false,
          });
          setPrevCategory("");
          setReceiptFile(null);
          if (receiptInputRef.current) {
            receiptInputRef.current.value = '';
          }
          setPerDiemBreakdown(null);
          setPerDiemDaySelections([]);
          setPerDiemMieBreakdown(null);
          
          // Show single toast after all expenses created
          if (receiptFile && receiptUploadFailures > 0) {
            toast({
              title: "Per diem itemized",
              description: `Created ${createdExpenses.length} expenses. Receipt upload failed for ${receiptUploadFailures} item(s).`,
              variant: "destructive",
            });
          } else if (receiptFile) {
            toast({
              title: "Per diem itemized",
              description: `Created ${createdExpenses.length} separate expenses with receipt attached to each.`,
            });
          } else {
            toast({
              title: "Per diem itemized",
              description: `Created ${createdExpenses.length} separate expense entries.`,
            });
          }
        } catch (error: any) {
          console.error('Itemized per diem creation failed:', error);
          toast({
            title: "Failed to create itemized expenses",
            description: error.message || "An error occurred while creating itemized per diem expenses. Please try again.",
            variant: "destructive",
          });
          // Don't reset form on error so user can retry
        }
      } else {
        // Standard single expense creation
        const submitData = transformExpenseFormData(data, mileageRate);
        console.log('Data after transformation:', submitData);

        // First create the expense
        const expense = await createExpenseMutation.mutateAsync(submitData);
        console.log('Expense created:', expense);

        // If there's a receipt file, upload it
        if (receiptFile && expense.id) {
          const formData = new FormData();
          formData.append('file', receiptFile);

          try {
            const response = await fetch(`/api/expenses/${expense.id}/attachments`, {
              method: 'POST',
              body: formData,
              credentials: 'include',
              headers: {
                'X-Session-Id': localStorage.getItem('sessionId') || '',
              },
            });

            if (!response.ok) {
              throw new Error('Receipt upload failed');
            }

            toast({
              title: "Receipt uploaded",
              description: "Receipt has been attached to the expense.",
            });
          } catch (error) {
            toast({
              title: "Receipt upload failed",
              description: "Expense was created but receipt upload failed.",
              variant: "destructive",
            });
          }
        }
      }
    } catch (error) {
      // Error is already handled by the mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  // Import functionality
  const downloadTemplate = async () => {
    try {
      const response = await fetch('/api/expenses/template', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'X-Session-Id': localStorage.getItem('sessionId') || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to download template');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expense-import-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Template downloaded",
        description: "Excel template has been downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download template. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleImportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv', // .csv
      ];

      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please select an Excel (.xlsx, .xls) or CSV (.csv) file.",
          variant: "destructive",
        });
        event.target.value = '';
        return;
      }

      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "File size must be less than 10MB.",
          variant: "destructive",
        });
        event.target.value = '';
        return;
      }

      setImportFile(file);
      setImportResults(null);
    }
  };

  const processImport = async () => {
    if (!importFile) return;

    setImportProgress(true);

    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const response = await fetch('/api/expenses/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          'X-Session-Id': localStorage.getItem('sessionId') || '',
        },
      });

      const result = await response.json();

      setImportResults(result);

      if (result.success) {
        toast({
          title: "Import successful",
          description: `Successfully imported ${result.imported} expense(s).`,
        });

        // Refresh expenses list
        queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });

        // Clear import state after successful import
        setTimeout(() => {
          setShowImportDialog(false);
          setImportFile(null);
          setImportResults(null);
        }, 3000);
      } else {
        toast({
          title: "Import completed with errors",
          description: result.message || "Some expenses could not be imported.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Import failed",
        description: "Failed to process import file. Please try again.",
        variant: "destructive",
      });
      setImportResults({
        success: false,
        message: "Failed to process import file.",
        errors: []
      });
    } finally {
      setImportProgress(false);
    }
  };

  const closeImportDialog = () => {
    setShowImportDialog(false);
    setImportFile(null);
    setImportResults(null);
    setImportProgress(false);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setReceiptFile(file);
    }
  };

  const handleEditFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setEditReceiptFile(file);
    }
  };

  // Helper function to transform form data for backend
  // Pass mileageRate as parameter to avoid closure issues - FIXED 2024-09-27
  const transformExpenseFormData = (data: ExpenseFormData, currentMileageRate: number) => {
    console.log('=== TRANSFORM DATA v2 FIXED ===');
    console.log('Input data:', data);
    console.log('Current mileage rate (fixed):', currentMileageRate);

    const submitData: any = {
      projectId: data.projectId || null,
      projectResourceId: data.projectResourceId || null,
      date: data.date,
      category: data.category,
      description: data.description || "",
      vendor: data.vendor || "",
      quantity: data.quantity || null,
      unit: data.unit || null,
      currency: data.currency,
      billable: data.billable ?? true,
      reimbursable: data.reimbursable ?? true,
      receiptUrl: data.receiptUrl || null,
      // Keep amount as string for decimal precision in PostgreSQL
      amount: data.amount,
    };
    
    // Note: UI-only fields (miles, perDiemCity, etc.) are NOT copied above

    // If it's mileage, ensure quantity and unit are set
    if (data.category === "mileage") {
      submitData.unit = "mile";
      const milesNum = parseFloat(data.miles || "0");
      // Backend expects quantity as a string for decimal type in DB
      submitData.quantity = milesNum > 0 ? String(milesNum) : null;
      // Recalculate amount to ensure accuracy using the passed mileage rate
      if (milesNum > 0) {
        // Keep as string for decimal precision
        submitData.amount = (milesNum * currentMileageRate).toFixed(2);
        console.log('Mileage calculation:', { 
          miles: milesNum, 
          rate: currentMileageRate, 
          calculatedAmount: submitData.amount,
          formula: `${milesNum} * ${currentMileageRate} = ${submitData.amount}`
        });
      }
      console.log('Mileage transformation:', { milesNum, quantity: submitData.quantity, amount: submitData.amount });
    } else if (data.category === "perdiem") {
      // For per diem, construct location and set rates from breakdown
      submitData.unit = "day";
      submitData.quantity = data.perDiemDays || null;
      
      // Construct location string based on CONUS vs OCONUS
      if (data.perDiemLocationType === "oconus" && data.perDiemOconusCountry && data.perDiemOconusLocation) {
        submitData.perDiemLocation = `${data.perDiemOconusLocation}, ${data.perDiemOconusCountry} (OCONUS)`;
      } else if (data.perDiemZip) {
        submitData.perDiemLocation = `ZIP ${data.perDiemZip}`;
      } else if (data.perDiemCity && data.perDiemState) {
        submitData.perDiemLocation = `${data.perDiemCity}, ${data.perDiemState}`;
      }
      
      console.log('Per diem transformation:', { 
        days: data.perDiemDays, 
        location: submitData.perDiemLocation,
        locationType: data.perDiemLocationType,
        amount: submitData.amount
      });
    } else if (data.category === "airfare") {
      // For airfare, include airport codes and round trip flag
      submitData.departureAirport = data.departureAirport?.toUpperCase() || null;
      submitData.arrivalAirport = data.arrivalAirport?.toUpperCase() || null;
      submitData.isRoundTrip = data.isRoundTrip ?? false;
      
      // Build route description for airfare
      if (submitData.departureAirport && submitData.arrivalAirport) {
        const tripType = submitData.isRoundTrip ? 'Round Trip' : 'One Way';
        const routeInfo = `${submitData.departureAirport} → ${submitData.arrivalAirport} (${tripType})`;
        
        // Prepend route info to existing description or use as description
        if (submitData.description && submitData.description.trim()) {
          submitData.description = `${routeInfo}\n${submitData.description}`;
        } else {
          submitData.description = routeInfo;
        }
      }
      
      console.log('Airfare transformation:', { 
        departure: submitData.departureAirport, 
        arrival: submitData.arrivalAirport,
        isRoundTrip: submitData.isRoundTrip,
        description: submitData.description
      });
    } else {
      // Clear quantity and unit for non-mileage/non-perdiem expenses
      submitData.quantity = null;
      submitData.unit = null;
      console.log('Regular expense: cleared quantity and unit');
    }

    // Ensure projectResourceId is handled correctly - convert "unassigned" to null
    if (submitData.projectResourceId === "unassigned" || submitData.projectResourceId === "") {
      submitData.projectResourceId = null;
    }

    // When privileged users assign an expense to a person, that person becomes the expense owner
    // The backend validates permissions before accepting this override
    if (submitData.projectResourceId) {
      submitData.personId = submitData.projectResourceId;
    }

    // Keep amount as string, ensure booleans are properly typed
    submitData.billable = Boolean(submitData.billable);
    submitData.reimbursable = Boolean(submitData.reimbursable);

    console.log('Final transformed data:', submitData);
    console.log('=== END TRANSFORM ===');

    return submitData;
  };

  // Edit form for expense editing
  const editForm = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      date: getTodayBusinessDate(),
      amount: "0",
      currency: "USD",
      billable: true,
      reimbursable: true,
      description: "",
      category: "",
      projectId: "",
      vendor: "",
      projectResourceId: "",
      miles: "",
      quantity: "",
      unit: "",
      perDiemCity: "",
      perDiemState: "",
      perDiemZip: "",
      perDiemLocationType: "conus" as PerDiemLocationType,
      perDiemOconusCountry: "",
      perDiemOconusLocation: "",
      perDiemDays: "",
      perDiemIncludeLodging: false,
      perDiemItemize: false,
    },
    mode: "onChange",
  });

  // Watch edit form category and miles for auto-calculation
  const editWatchedCategory = editForm.watch("category");
  const editWatchedMiles = editForm.watch("miles");
  
  // Edit form airport code validation
  const editWatchedDepartureAirport = editForm.watch("departureAirport");
  const editWatchedArrivalAirport = editForm.watch("arrivalAirport");
  
  const { data: editDepartureAirportInfo, isLoading: editDepartureLoading } = useQuery<AirportInfo | null>({
    queryKey: ["/api/airports", editWatchedDepartureAirport?.toUpperCase()],
    enabled: editWatchedCategory === "airfare" && editWatchedDepartureAirport?.length === 3,
    staleTime: 60000,
    retry: false,
  });
  
  const { data: editArrivalAirportInfo, isLoading: editArrivalLoading } = useQuery<AirportInfo | null>({
    queryKey: ["/api/airports", editWatchedArrivalAirport?.toUpperCase()],
    enabled: editWatchedCategory === "airfare" && editWatchedArrivalAirport?.length === 3,
    staleTime: 60000,
    retry: false,
  });

  // Auto-calculate amount for edit form
  // Clear quantity/unit when switching away from mileage
  useEffect(() => {
    // Skip effect during form submission to avoid race conditions
    if (updateExpenseMutation.isPending) return;

    if (editWatchedCategory === "mileage" && editWatchedMiles) {
      const miles = parseFloat(editWatchedMiles);
      if (!isNaN(miles) && miles > 0) {
        const calculatedAmount = (miles * mileageRate).toFixed(2);
        console.log('EDIT FORM: Mileage calculation:', { miles, mileageRate, calculatedAmount });
        editForm.setValue("amount", calculatedAmount);
        // Store quantity as string in form (will be converted to number on submit)
        editForm.setValue("quantity", miles.toString());
        editForm.setValue("unit", "mile");
      }
    } else if (editPrevCategory === "mileage" && editWatchedCategory !== "mileage" && editWatchedCategory !== "") {
      // Clear quantity and unit when switching away from mileage to another category
      console.log('EDIT FORM: Clearing mileage fields, switching from mileage to:', editWatchedCategory);
      editForm.setValue("quantity", "");
      editForm.setValue("unit", "");
      editForm.setValue("miles", "");
    }

    // Only update prevCategory if we have a valid category change
    if (editWatchedCategory !== editPrevCategory) {
      setEditPrevCategory(editWatchedCategory);
    }
  }, [editWatchedCategory, editWatchedMiles, mileageRate, editForm, editPrevCategory, updateExpenseMutation.isPending]);

  const handleEditExpense = (expense: Expense) => {
    console.log('=== START EDIT EXPENSE ===');
    console.log('Editing expense:', {
      id: expense.id,
      description: expense.description,
      category: expense.category,
      amount: expense.amount,
      date: expense.date,
      quantity: expense.quantity,
      unit: expense.unit,
      vendor: expense.vendor,
      billable: expense.billable,
      reimbursable: expense.reimbursable
    });

    setEditingExpenseId(expense.id);
    // Reset edit state first
    setEditPrevCategory("");

    // Ensure date is properly formatted for the date input
    let formattedDate = expense.date;
    if (typeof expense.date === 'string') {
      // If it's already in YYYY-MM-DD format, use it directly
      if (expense.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        formattedDate = expense.date;
      } else {
        // Otherwise parse and format it using local time to avoid timezone shift
        formattedDate = format(parseBusinessDateOrToday(expense.date), 'yyyy-MM-dd');
      }
    } else {
      // If it's any other type (Date object or ISO timestamp), format it
      formattedDate = format(parseBusinessDateOrToday(expense.date), 'yyyy-MM-dd');
    }

    console.log('Formatted date:', formattedDate);

    // Sync the selectedDate state for the date picker (use parseBusinessDateOrToday for safety)
    setSelectedDate(parseBusinessDateOrToday(expense.date));

    // Populate the edit form with current expense data - ensure all fields have defined values
    const formData: ExpenseFormData = {
      date: formattedDate,
      amount: typeof expense.amount === 'string' ? expense.amount : String(expense.amount),
      currency: expense.currency || "USD",
      billable: Boolean(expense.billable),
      reimbursable: Boolean(expense.reimbursable),
      description: expense.description || "",
      category: expense.category || "",
      projectId: expense.projectId || "",
      vendor: expense.vendor || "",
      projectResourceId: expense.projectResourceId || "",
      miles: "",
      quantity: "",
      unit: "",
      departureAirport: "",
      arrivalAirport: "",
      isRoundTrip: false,
      perDiemLocationType: "conus" as PerDiemLocationType,
    };

    // For mileage expenses, populate the miles field and trigger amount recalculation
    if (expense.category === "mileage" && expense.unit === "mile" && expense.quantity) {
      const miles = String(expense.quantity);
      formData.miles = miles;
      // Don't set amount here - let the useEffect handle the calculation
      // But ensure quantity and unit are set
      formData.quantity = miles;
      formData.unit = "mile";
      console.log('Mileage expense detected, miles:', miles);
    }

    // For airfare expenses, populate the airport codes and round trip flag
    if (expense.category === "airfare") {
      formData.departureAirport = (expense as any).departureAirport || "";
      formData.arrivalAirport = (expense as any).arrivalAirport || "";
      formData.isRoundTrip = (expense as any).isRoundTrip || false;
      console.log('Airfare expense detected:', { 
        departure: formData.departureAirport, 
        arrival: formData.arrivalAirport, 
        isRoundTrip: formData.isRoundTrip 
      });
    }

    console.log('Form data to be set:', formData);
    
    // Use setValue instead of reset to avoid controlled/uncontrolled issues
    Object.entries(formData).forEach(([key, value]) => {
      editForm.setValue(key as keyof ExpenseFormData, value);
    });

    // Set the previous category after reset to avoid useEffect conflicts
    setTimeout(() => {
      setEditPrevCategory(expense.category);
    }, 0);
    console.log('=== END EDIT EXPENSE ===');
  };

  const handleCancelEdit = () => {
    setEditingExpenseId(null);
    setEditPrevCategory("");
    setEditReceiptFile(null);
    if (editReceiptInputRef.current) {
      editReceiptInputRef.current.value = '';
    }
    // Reset edit form to clean state
    editForm.reset({
      date: getTodayBusinessDate(),
      amount: "0",
      currency: "USD",
      billable: true,
      reimbursable: true,
      description: "",
      category: "",
      projectId: "",
      vendor: "",
      projectResourceId: "",
      miles: "",
      quantity: "",
      unit: "",
      departureAirport: "",
      arrivalAirport: "",
      isRoundTrip: false,
      perDiemLocationType: "conus" as PerDiemLocationType,
    });
  };

  const handleUpdateExpense = (expenseId: string, data: ExpenseFormData) => {
    // Prevent concurrent updates
    if (updateExpenseMutation.isPending) return;

    console.log('=== UPDATE EXPENSE SUBMIT ===');
    console.log('Expense ID:', expenseId);
    console.log('Form data received:', data);

    // Validate required fields
    if (!data.projectId || !data.category || !data.description) {
      console.error('Missing required fields:', { 
        projectId: data.projectId, 
        category: data.category, 
        description: data.description 
      });
      toast({
        title: "Validation Error",
        description: "Project, category, and description are required",
        variant: "destructive",
      });
      return;
    }

    // Validate mileage
    if (data.category === "mileage") {
      const miles = parseFloat(data.miles || "0");
      console.log('Validating mileage:', { miles, isValid: !isNaN(miles) && miles > 0 });
      if (isNaN(miles) || miles <= 0) {
        toast({
          title: "Validation Error",
          description: "Miles must be greater than 0 for mileage expenses",
          variant: "destructive",
        });
        return;
      }
    }

    // Use the unified transform function with current mileage rate
    const submitData = transformExpenseFormData(data, mileageRate);
    console.log('Data after transformation:', submitData);
    
    // Additional validation of the transformed data
    if (!submitData.amount || submitData.amount <= 0) {
      console.error('Invalid amount after transformation:', submitData.amount);
      toast({
        title: "Validation Error",
        description: "Amount must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    // Filter out fields that shouldn't be sent to the backend for updates
    const allowedUpdateFields = [
      'projectId', 'projectResourceId', 'date', 'category', 'amount', 
      'quantity', 'unit', 'currency', 'billable', 'reimbursable', 
      'description', 'vendor', 'perDiemLocation', 'perDiemMealsRate', 
      'perDiemLodgingRate', 'perDiemBreakdown',
      'departureAirport', 'arrivalAirport', 'isRoundTrip'
    ];

    const filteredData: any = {};
    allowedUpdateFields.forEach(field => {
      if (submitData.hasOwnProperty(field)) {
        filteredData[field] = submitData[field];
      }
    });

    console.log('Filtered data for update:', filteredData);
    console.log('=== END UPDATE SUBMIT ===');

    updateExpenseMutation.mutate({ id: expenseId, data: filteredData });
  };

  const getTotalExpenses = () => {
    if (!expenses) return { total: 0, billable: 0, reimbursable: 0 };

    return expenses?.reduce(
      (acc, expense) => ({
        total: acc.total + parseFloat(expense.amount),
        billable: acc.billable + (expense.billable ? parseFloat(expense.amount) : 0),
        reimbursable: acc.reimbursable + (expense.reimbursable ? parseFloat(expense.amount) : 0),
      }),
      { total: 0, billable: 0, reimbursable: 0 }
    );
  };

  const totals = getTotalExpenses();

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold" data-testid="expenses-title">Expenses</h2>
            <p className="text-muted-foreground" data-testid="expenses-subtitle">
              Track and manage project-related expenses
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline"
              onClick={() => navigate('/expense-reports')}
              data-testid="button-create-expense-report"
            >
              <FileText className="w-4 h-4 mr-2" />
              My Expense Reports
            </Button>
            <Button 
              data-testid="button-import-expenses"
              onClick={() => setShowImportDialog(true)}
              disabled={!hasAnyRole(['admin', 'pm', 'billing-admin'])}
            >
              <Upload className="w-4 h-4 mr-2" />
              Import Expenses
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card data-testid="card-total-expenses">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
                  <p className="text-2xl font-bold" data-testid="value-total-expenses">
                    ${totals.total.toFixed(2)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-billable-expenses">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Billable to Client</p>
                  <p className="text-2xl font-bold" data-testid="value-billable-expenses">
                    ${totals.billable.toFixed(2)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-chart-4/10 rounded-lg flex items-center justify-center">
                  <Receipt className="text-chart-4" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-reimbursable-expenses">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Reimbursable</p>
                  <p className="text-2xl font-bold" data-testid="value-reimbursable-expenses">
                    ${totals.reimbursable.toFixed(2)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
                  <Receipt className="text-secondary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Expense Entry Form */}
          <Card className={cn("lg:col-span-1", form.watch("category") === "perdiem" && "lg:col-span-3")} data-testid="expense-entry-form">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Plus className="w-5 h-5 mr-2" />
                Add Expense
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form name="add-expense-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-select-expense-date"
                              >
                                {field.value ? (
                                  formatBusinessDate(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ? parseBusinessDate(field.value) ?? undefined : undefined}
                              onSelect={(date) => {
                                field.onChange(date ? format(date, 'yyyy-MM-dd') : '');
                                setDatePickerOpen(false);
                              }}
                              disabled={(date) =>
                                date > new Date() || date < new Date("1900-01-01")
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-expense-project">
                              <SelectValue placeholder="Select project" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {activeProjects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.displayLabel}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Person Assignment (Admin/PM only) */}
                  {canAssignToPerson && (
                    <FormField
                      control={form.control}
                      name="projectResourceId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assign to Person</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-expense-person">
                                <SelectValue placeholder="Select person (optional)" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {users.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.firstName} {user.lastName} ({user.email})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Assign this expense to a specific team member (admin/PM only)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-expense-category">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {EXPENSE_CATEGORIES.map((category) => (
                              <SelectItem key={category.value} value={category.value}>
                                {category.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Mileage-specific fields */}
                  {watchedCategory === "mileage" && (
                    <FormField
                      control={form.control}
                      name="miles"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Miles</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              placeholder="Enter miles driven"
                              {...field}
                              data-testid="input-expense-miles"
                            />
                          </FormControl>
                          <FormDescription>
                            Rate: ${mileageRate.toFixed(2)}/mile
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Airfare-specific fields */}
                  {watchedCategory === "airfare" && (
                    <div className="space-y-4 p-4 border rounded-md bg-muted/50">
                      <div className="text-sm font-medium">Flight Route</div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="departureAirport"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>From (Airport)</FormLabel>
                              <FormControl>
                                <AirportSearchInput
                                  value={field.value || ""}
                                  onChange={field.onChange}
                                  placeholder="SEA"
                                  data-testid="input-departure-airport"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="arrivalAirport"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>To (Airport)</FormLabel>
                              <FormControl>
                                <AirportSearchInput
                                  value={field.value || ""}
                                  onChange={field.onChange}
                                  placeholder="JFK"
                                  data-testid="input-arrival-airport"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="isRoundTrip"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-round-trip"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Round Trip</FormLabel>
                              <FormDescription>
                                Check if this is a round-trip ticket (shows as SEA ↔ JFK on invoice)
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* Per Diem-specific fields */}
                  {watchedCategory === "perdiem" && (
                    <div className="space-y-4 p-4 border rounded-md bg-muted/50">
                      <div className="text-sm font-medium">GSA Per Diem Calculator</div>
                      <p className="text-xs text-muted-foreground">Select your travel dates first, then choose your location type and enter location details below.</p>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="perDiemStartDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Start Date</FormLabel>
                              <Popover open={perDiemStartDateOpen} onOpenChange={setPerDiemStartDateOpen}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "w-full pl-3 text-left font-normal",
                                        !field.value && "text-muted-foreground"
                                      )}
                                      data-testid="button-perdiem-start-date"
                                    >
                                      {field.value ? format(new Date(field.value + 'T00:00:00'), "PPP") : "Pick start date"}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={field.value ? new Date(field.value + 'T00:00:00') : undefined}
                                    onSelect={(date) => {
                                      if (date) {
                                        const dateStr = format(date, "yyyy-MM-dd");
                                        field.onChange(dateStr);
                                        const endDate = form.getValues("perDiemEndDate");
                                        if (endDate) {
                                          const endDateObj = new Date(endDate + 'T00:00:00');
                                          if (date > endDateObj) {
                                            form.setValue("perDiemEndDate", dateStr);
                                            form.setValue("perDiemDays", "1");
                                          } else {
                                            const days = differenceInDays(endDateObj, date) + 1;
                                            form.setValue("perDiemDays", String(days));
                                          }
                                        }
                                      }
                                      setPerDiemStartDateOpen(false);
                                    }}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="perDiemEndDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>End Date</FormLabel>
                              <Popover open={perDiemEndDateOpen} onOpenChange={setPerDiemEndDateOpen}>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "w-full pl-3 text-left font-normal",
                                        !field.value && "text-muted-foreground"
                                      )}
                                      data-testid="button-perdiem-end-date"
                                    >
                                      {field.value ? format(new Date(field.value + 'T00:00:00'), "PPP") : "Pick end date"}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={field.value ? new Date(field.value + 'T00:00:00') : undefined}
                                    disabled={(date) => {
                                      const startDate = form.getValues("perDiemStartDate");
                                      if (startDate) {
                                        return date < new Date(startDate + 'T00:00:00');
                                      }
                                      return false;
                                    }}
                                    onSelect={(date) => {
                                      if (date) {
                                        const dateStr = format(date, "yyyy-MM-dd");
                                        field.onChange(dateStr);
                                        const startDate = form.getValues("perDiemStartDate");
                                        if (startDate) {
                                          const days = differenceInDays(date, new Date(startDate + 'T00:00:00')) + 1;
                                          form.setValue("perDiemDays", String(days));
                                        }
                                      }
                                      setPerDiemEndDateOpen(false);
                                    }}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {form.watch("perDiemStartDate") && form.watch("perDiemEndDate") && (
                        <PerDiemMatrix
                          startDate={form.watch("perDiemStartDate") || ""}
                          endDate={form.watch("perDiemEndDate") || ""}
                          city={form.watch("perDiemCity")}
                          state={form.watch("perDiemState")}
                          zip={form.watch("perDiemZip")}
                          locationType={form.watch("perDiemLocationType") || "conus"}
                          oconusCountry={form.watch("perDiemOconusCountry")}
                          oconusLocation={form.watch("perDiemOconusLocation")}
                          onDaysChange={(days) => {
                            setPerDiemDaySelections(days);
                            form.setValue("perDiemDays", String(days.length));
                          }}
                          onTotalChange={(total) => {
                            setPerDiemCalculatedTotal(total);
                            form.setValue("amount", total.toFixed(2));
                          }}
                          onBreakdownChange={(breakdown) => {
                            setPerDiemMieBreakdown(breakdown);
                          }}
                          onLocationTypeChange={(type) => {
                            form.setValue("perDiemLocationType", type);
                            if (type === "conus") {
                              form.setValue("perDiemOconusCountry", "");
                              form.setValue("perDiemOconusLocation", "");
                            } else {
                              form.setValue("perDiemCity", "");
                              form.setValue("perDiemState", "");
                              form.setValue("perDiemZip", "");
                            }
                          }}
                          onCityChange={(city) => {
                            form.setValue("perDiemCity", city);
                          }}
                          onStateChange={(state) => {
                            form.setValue("perDiemState", state);
                          }}
                          onZipChange={(zip) => {
                            form.setValue("perDiemZip", zip);
                          }}
                          onOconusCountryChange={(country) => {
                            form.setValue("perDiemOconusCountry", country);
                            form.setValue("perDiemOconusLocation", "");
                          }}
                          onOconusLocationChange={(location) => {
                            form.setValue("perDiemOconusLocation", location);
                          }}
                        />
                      )}

                      <FormField
                        control={form.control}
                        name="perDiemIncludeLodging"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-perdiem-include-lodging"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>
                                Include lodging in per diem?
                              </FormLabel>
                              <FormDescription>
                                Check this if lodging costs are included in per diem. Leave unchecked if hotel is a direct charge.
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="0.00"
                              {...field}
                              disabled={watchedCategory === "mileage" || watchedCategory === "perdiem"} // Disable for auto-calculated categories
                              data-testid="input-expense-amount"
                            />
                          </FormControl>
                          {watchedCategory === "mileage" && (
                            <FormDescription>
                              Auto-calculated from miles
                            </FormDescription>
                          )}
                          {watchedCategory === "perdiem" && (
                            <FormDescription>
                              Auto-calculated from GSA rates
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-expense-currency">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="CAD">CAD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="GBP">GBP</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the expense..."
                            {...field}
                            value={field.value || ""}
                            data-testid="textarea-expense-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vendor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendor</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Alaska Airlines, Starbucks, Hyatt..."
                            {...field}
                            value={field.value || ""}
                            data-testid="input-expense-vendor"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="billable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-expense-billable"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Billable to client</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="reimbursable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-expense-reimbursable"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Reimbursable to employee</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <FormLabel>Receipt (Optional)</FormLabel>
                    <div className="flex items-center space-x-2">
                      <Input
                        ref={receiptInputRef}
                        type="file"
                        accept=".jpg,.jpeg,.png,.pdf,.heic,.heif"
                        onChange={handleFileChange}
                        className="flex-1"
                        data-testid="input-receipt-file"
                      />
                      {receiptFile && (
                        <span className="text-sm text-muted-foreground">
                          {receiptFile.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={createExpenseMutation.isPending || isSubmitting}
                    data-testid="button-submit-expense"
                  >
                    {(createExpenseMutation.isPending || isSubmitting) ? "Saving..." : "Add Expense"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Expenses List - hidden when Per Diem is selected */}
          <Card className={cn("lg:col-span-2", form.watch("category") === "perdiem" && "hidden")} data-testid="expenses-list">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Receipt className="w-5 h-5 mr-2" />
                  {showAllExpenses ? 'All Expenses' : 'Pending Expenses'}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {showAllExpenses ? 'Showing all' : 'Showing pending only'}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAllExpenses(!showAllExpenses)}
                    data-testid="toggle-all-expenses"
                  >
                    {showAllExpenses ? 'Show Pending Only' : 'Show All'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-20 bg-muted rounded"></div>
                    </div>
                  ))}
                </div>
              ) : expenses.length === 0 ? (
                <div className="text-center py-8">
                  <Receipt className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No expenses yet</h3>
                  <p className="text-muted-foreground">Start tracking your project expenses.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {expenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/30 transition-colors"
                      data-testid={`expense-${expense.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <div className="font-medium" data-testid={`expense-project-${expense.id}`}>
                            {expense.project.name}
                          </div>
                          <div className="text-sm text-muted-foreground" data-testid={`expense-client-${expense.id}`}>
                            {expense.project.client.name}
                          </div>
                          <Badge variant="outline" data-testid={`expense-category-${expense.id}`}>
                            {EXPENSE_CATEGORIES.find(c => c.value === expense.category)?.label || expense.category}
                          </Badge>
                          {expense.billable && (
                            <Badge className="bg-chart-4/10 text-chart-4">
                              Billable
                            </Badge>
                          )}
                          {expense.reimbursable && (
                            <Badge className="bg-secondary/10 text-secondary">
                              Reimbursable
                            </Badge>
                          )}
                          {expense.expenseReport && (
                            <Badge 
                              variant="outline" 
                              className={cn(
                                expense.expenseReport.status === 'approved' && 'border-green-500 text-green-600',
                                expense.expenseReport.status === 'submitted' && 'border-yellow-500 text-yellow-600',
                                expense.expenseReport.status === 'draft' && 'border-gray-400 text-gray-500',
                                expense.expenseReport.status === 'rejected' && 'border-red-500 text-red-600'
                              )}
                              data-testid={`expense-report-badge-${expense.id}`}
                            >
                              <FileText className="w-3 h-3 mr-1" />
                              {expense.expenseReport.reportNumber} ({expense.expenseReport.status})
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1" data-testid={`expense-description-${expense.id}`}>
                          {expense.description}
                        </div>
                        {expense.vendor && (
                          <div className="text-sm text-muted-foreground mt-1" data-testid={`expense-vendor-${expense.id}`}>
                            <strong>Vendor:</strong> {expense.vendor}
                          </div>
                        )}
                        {expense.quantity && expense.unit === "mile" && (
                          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1" data-testid={`expense-mileage-${expense.id}`}>
                            <Car className="w-3 h-3" />
                            <span>{parseFloat(expense.quantity).toFixed(1)} miles @ ${(parseFloat(expense.amount) / parseFloat(expense.quantity)).toFixed(2)}/mile = ${parseFloat(expense.amount).toFixed(2)}</span>
                          </div>
                        )}
                        {expense.receiptUrl && (
                          <div className="text-sm mt-1 flex items-center gap-1">
                            <Receipt className="w-3 h-3 text-green-600" />
                            <button 
                              onClick={async () => {
                                try {
                                  const sessionId = localStorage.getItem('sessionId');
                                  const response = await fetch(expense.receiptUrl!, {
                                    headers: sessionId ? { 'X-Session-Id': sessionId } : {},
                                  });
                                  if (!response.ok) {
                                    throw new Error('Failed to download receipt');
                                  }
                                  const blob = await response.blob();
                                  const url = window.URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  const contentDisposition = response.headers.get('Content-Disposition');
                                  const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 'receipt';
                                  a.download = filename;
                                  document.body.appendChild(a);
                                  a.click();
                                  window.URL.revokeObjectURL(url);
                                  document.body.removeChild(a);
                                } catch (error) {
                                  console.error('Receipt download error:', error);
                                  toast({
                                    title: "Download failed",
                                    description: "Could not download receipt. Please try again.",
                                    variant: "destructive"
                                  });
                                }
                              }}
                              className="text-green-600 hover:underline cursor-pointer"
                              data-testid={`link-receipt-${expense.id}`}
                            >
                              View Receipt
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          <div className="font-medium text-lg" data-testid={`expense-amount-${expense.id}`}>
                            ${parseFloat(expense.amount).toFixed(2)}
                          </div>
                          <div className="text-sm text-muted-foreground" data-testid={`expense-date-${expense.id}`}>
                            {formatBusinessDate(expense.date, 'MMM d, yyyy')}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditExpense(expense)}
                          data-testid={`button-edit-expense-${expense.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmDeleteId(expense.id)}
                          disabled={deleteExpenseMutation.isPending}
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-expense-${expense.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Expense Dialog */}
      <Dialog open={!!editingExpenseId} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
            <DialogDescription>
              Update the details for this expense entry
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form name="edit-expense-form" onSubmit={editForm.handleSubmit((data) => handleUpdateExpense(editingExpenseId!, data))} className="space-y-4">
              <FormField
                control={editForm.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="edit-input-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="edit-select-project">
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.displayLabel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Person Assignment for Edit (Admin/PM only) */}
              {canAssignToPerson && (
                <FormField
                  control={editForm.control}
                  name="projectResourceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assign to Person</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="edit-select-expense-person">
                            <SelectValue placeholder="Select person (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.firstName} {user.lastName} ({user.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Assign this expense to a specific team member (admin/PM only)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Mileage field for editing */}
              {editWatchedCategory === "mileage" && (
                <FormField
                  control={editForm.control}
                  name="miles"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Miles</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="Enter miles driven"
                          data-testid="edit-input-miles"
                        />
                      </FormControl>
                      <FormDescription>
                        Rate: ${mileageRate.toFixed(2)}/mile
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Per Diem info panel for editing */}
              {editWatchedCategory === "perdiem" && editingExpenseId && (() => {
                const editingExp = expenses?.find(e => e.id === editingExpenseId);
                if (!editingExp) return null;
                return (
                  <div className="space-y-2 p-3 border rounded-md bg-blue-50 dark:bg-blue-950/30">
                    <div className="text-sm font-medium flex items-center gap-1">
                      <DollarSign className="w-4 h-4" />
                      Per Diem Details
                    </div>
                    {editingExp.perDiemLocation && (
                      <div className="text-sm text-muted-foreground">
                        <strong>Location:</strong> {editingExp.perDiemLocation}
                      </div>
                    )}
                    {editingExp.perDiemMealsRate && (
                      <div className="text-sm text-muted-foreground">
                        <strong>M&IE Rate:</strong> ${parseFloat(editingExp.perDiemMealsRate).toFixed(2)}/day
                      </div>
                    )}
                    {editingExp.perDiemLodgingRate && (
                      <div className="text-sm text-muted-foreground">
                        <strong>Lodging Rate:</strong> ${parseFloat(editingExp.perDiemLodgingRate).toFixed(2)}/night
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground italic">
                      You can adjust the amount, description, and other fields below. To fully recalculate per diem rates, delete this expense and create a new per diem entry.
                    </p>
                  </div>
                );
              })()}

              {/* Airfare fields for editing */}
              {editWatchedCategory === "airfare" && (
                <div className="space-y-4 p-4 border rounded-md bg-muted/50">
                  <div className="text-sm font-medium">Flight Route</div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="departureAirport"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>From (Airport)</FormLabel>
                          <FormControl>
                            <AirportSearchInput
                              value={field.value || ""}
                              onChange={field.onChange}
                              placeholder="SEA"
                              data-testid="edit-input-departure-airport"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="arrivalAirport"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>To (Airport)</FormLabel>
                          <FormControl>
                            <AirportSearchInput
                              value={field.value || ""}
                              onChange={field.onChange}
                              placeholder="JFK"
                              data-testid="edit-input-arrival-airport"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={editForm.control}
                    name="isRoundTrip"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="edit-checkbox-round-trip"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Round Trip</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <FormField
                control={editForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="text" 
                        placeholder="0.00"
                        disabled={editWatchedCategory === "mileage"}
                        data-testid="edit-input-amount" 
                      />
                    </FormControl>
                    {editWatchedCategory === "mileage" && (
                      <FormDescription>
                        Auto-calculated from miles
                      </FormDescription>
                    )}
                    {editWatchedCategory === "perdiem" && (
                      <FormDescription>
                        Originally calculated from GSA rates. You can manually adjust if needed.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ""} data-testid="edit-input-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="vendor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} placeholder="e.g., Alaska Airlines, Starbucks, Hyatt..." data-testid="edit-input-vendor" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={editWatchedCategory === "perdiem"}>
                      <FormControl>
                        <SelectTrigger data-testid="edit-select-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((category) => (
                          <SelectItem key={category.value} value={category.value}>
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editWatchedCategory === "perdiem" && (
                      <FormDescription>
                        Per diem category cannot be changed. Delete and recreate if needed.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex space-x-2">
                <FormField
                  control={editForm.control}
                  name="billable"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="edit-checkbox-billable"
                        />
                      </FormControl>
                      <FormLabel>Billable</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="reimbursable"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="edit-checkbox-reimbursable"
                        />
                      </FormControl>
                      <FormLabel>Reimbursable</FormLabel>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-2">
                <FormLabel>Upload Receipt</FormLabel>
                <div className="flex items-center space-x-2">
                  <Input
                    ref={editReceiptInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,.heic,.heif"
                    onChange={handleEditFileChange}
                    className="flex-1"
                    data-testid="edit-input-receipt-file"
                  />
                </div>
                {editReceiptFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {editReceiptFile.name}
                  </p>
                )}
                {editingExpenseId && expenses?.find(e => e.id === editingExpenseId)?.receiptUrl && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <Receipt className="w-3 h-3" />
                    Current receipt attached
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCancelEdit}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateExpenseMutation.isPending}>
                  {updateExpenseMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Import Expenses Dialog */}
      <Dialog open={showImportDialog} onOpenChange={closeImportDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-import-expenses">
          <DialogHeader>
            <DialogTitle>Import Expenses</DialogTitle>
            <DialogDescription>
              Upload an Excel or CSV file to bulk import expense entries
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!importResults && (
              <>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Upload an Excel (.xlsx, .xls) or CSV (.csv) file containing expense data.
                  </p>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={downloadTemplate}
                      data-testid="button-download-template"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Download Template
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Download template with sample data and instructions
                    </span>
                  </div>
                </div>

                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6">
                  <div className="text-center space-y-2">
                    <Upload className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <div>
                      <label htmlFor="import-file" className="cursor-pointer">
                        <span className="text-sm font-medium text-primary hover:text-primary/80">
                          Click to upload
                        </span>
                        <span className="text-sm text-muted-foreground"> or drag and drop</span>
                      </label>
                      <input
                        id="import-file"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleImportFileChange}
                        className="sr-only"
                        data-testid="input-import-file"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Excel (.xlsx, .xls) or CSV (.csv) up to 10MB
                    </p>
                  </div>
                </div>

                {importFile && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{importFile.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(importFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setImportFile(null);
                        const input = document.getElementById('import-file') as HTMLInputElement;
                        if (input) input.value = '';
                      }}
                      data-testid="button-remove-file"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Import Results */}
            {importResults && (
              <div className="space-y-4">
                <div className={`p-4 rounded-lg border ${
                  importResults.success 
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  <div className="flex items-start space-x-2">
                    <div className="flex-shrink-0">
                      {importResults.success ? (
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                          <span className="text-white text-xs">!</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{importResults.message}</h4>

                      <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Total Rows:</span> {importResults.totalRows || 0}
                        </div>
                        <div>
                          <span className="font-medium">Valid Rows:</span> {importResults.validRows || 0}
                        </div>
                        <div>
                          <span className="font-medium">Imported:</span> {importResults.imported || 0}
                        </div>
                        <div>
                          <span className="font-medium">Errors:</span> {importResults.errors?.length || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error Details */}
                {importResults.errors && importResults.errors.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="font-medium text-sm">Validation Errors:</h5>
                    <div className="max-h-60 overflow-y-auto">
                      <div className="space-y-1">
                        {importResults.errors.map((error: any, index: number) => (
                          <div 
                            key={index}
                            className="text-xs p-2 bg-red-50 border border-red-200 rounded text-red-700"
                          >
                            <span className="font-medium">Row {error.row}:</span>
                            {error.field && (
                              <span className="text-red-600"> [{error.field}]</span>
                            )}
                            <span className="ml-1">{error.message}</span>
                            {error.value && (
                              <span className="ml-1 font-mono bg-red-100 px-1 rounded">
                                "{error.value}"
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Success Results */}
                {importResults.results && importResults.results.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="font-medium text-sm text-green-700">Successfully Imported:</h5>
                    <div className="max-h-32 overflow-y-auto">
                      <div className="space-y-1">
                        {importResults.results.slice(0, 10).map((result: any, index: number) => (
                          <div 
                            key={index}
                            className="text-xs p-2 bg-green-50 border border-green-200 rounded text-green-700"
                          >
                            Row {result.row}: Expense created successfully
                          </div>
                        ))}
                        {importResults.results.length > 10 && (
                          <div className="text-xs text-muted-foreground text-center p-2">
                            ... and {importResults.results.length - 10} more
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeImportDialog}
              data-testid="button-close-import"
            >
              {importResults ? 'Close' : 'Cancel'}
            </Button>
            {!importResults && importFile && (
              <Button
                type="button"
                onClick={processImport}
                disabled={importProgress}
                data-testid="button-process-import"
              >
                {importProgress ? "Processing..." : "Import Expenses"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete Expense
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this expense? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteExpenseMutation.isPending}
              onClick={() => {
                if (confirmDeleteId) {
                  deleteExpenseMutation.mutate(confirmDeleteId, {
                    onSettled: () => setConfirmDeleteId(null),
                  });
                }
              }}
              data-testid="button-confirm-delete-expense"
            >
              {deleteExpenseMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}