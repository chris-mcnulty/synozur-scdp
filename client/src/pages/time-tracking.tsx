import { useState, useRef, useMemo } from "react";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTimeEntrySchema, type TimeEntry, type Project, type Client, type User, type ProjectMilestone, type ProjectWorkstream } from "@shared/schema";
import { format } from "date-fns";
import { CalendarIcon, Plus, Clock, Download, Upload, FileText, Filter, ChevronDown, ChevronRight, User as UserIcon, Lock, Edit, Trash2, FileDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { formatProjectLabel } from "@/lib/project-utils";

const timeEntryFormSchema = insertTimeEntrySchema.omit({
  personId: true, // personId is added server-side from authenticated user
}).extend({
  date: z.string(),
  hours: z.string()
    .min(1, "Hours is required")
    .refine(
      (val) => {
        const num = parseFloat(val);
        return !isNaN(num);
      },
      "Please enter a valid number"
    )
    .refine(
      (val) => {
        const num = parseFloat(val);
        return num > 0 && num <= 24;
      },
      "Hours must be between 0.01 and 24"
    ),
});

type TimeEntryFormData = z.infer<typeof timeEntryFormSchema>;

// Helper function to parse date string without timezone issues
function parseLocalDate(dateStr: string): Date {
  // Split the date string and create a date in local timezone
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Helper function to format date for display without timezone issues
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// API response types that include nested relations
type ProjectWithClient = Project & {
  client: Client;
};

type TimeEntryWithRelations = TimeEntry & {
  project: ProjectWithClient;
  milestone?: ProjectMilestone;
  workstream?: ProjectWorkstream;
};

export default function TimeTracking() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [filters, setFilters] = useState({
    projectId: "",
    clientId: "",
    startDate: "",
    endDate: ""
  });
  const [editingEntry, setEditingEntry] = useState<TimeEntryWithRelations | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TimeEntryWithRelations | null>(null);
  const [editProjectId, setEditProjectId] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<TimeEntryFormData>({
    resolver: zodResolver(timeEntryFormSchema),
    defaultValues: {
      date: formatLocalDate(new Date()),
      hours: "",
      billable: true,
      description: "",

      projectId: "",
      milestoneId: "",
      workstreamId: "",
      projectStageId: "",
      allocationId: "",
    },
  });

  const editForm = useForm<TimeEntryFormData>({
    resolver: zodResolver(timeEntryFormSchema),
    defaultValues: {
      date: formatLocalDate(new Date()),
      hours: "",
      billable: true,
      description: "",

      projectId: "",
      milestoneId: "",
      workstreamId: "",
      projectStageId: "",
      allocationId: "",
    },
  });

  const { data: projects } = useQuery<ProjectWithClient[]>({
    queryKey: ["/api/projects"],
  });
  
  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });
  
  const { data: currentUser } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  // Filter and format projects: only active, with CLIENTSHORTNAME | Project name format
  const activeProjects = useMemo(() => {
    if (!projects) return [];
    return projects
      .filter(p => p.status === 'active')
      .map(p => ({
        ...p,
        displayLabel: formatProjectLabel(p)
      }))
      .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
  }, [projects]);

  // Fetch milestones and workstreams for selected project
  const { data: milestones, isLoading: milestonesLoading } = useQuery({
    queryKey: ["/api/projects", selectedProjectId, "milestones"],
    enabled: !!selectedProjectId,
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`/api/projects/${selectedProjectId}/milestones`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch milestones');
      return response.json();
    }
  });

  const { data: workstreams, isLoading: workstreamsLoading } = useQuery({
    queryKey: ["/api/projects", selectedProjectId, "workstreams"],
    enabled: !!selectedProjectId,
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`/api/projects/${selectedProjectId}/workstreams`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch workstreams');
      return response.json();
    }
  });

  const { data: projectStages, isLoading: projectStagesLoading } = useQuery({
    queryKey: ["/api/projects", selectedProjectId, "stages"],
    enabled: !!selectedProjectId,
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`/api/projects/${selectedProjectId}/stages`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch project stages');
      return response.json();
    }
  });

  // Fetch vocabulary context for selected project to get custom terms
  const { data: vocabularyContext } = useQuery({
    queryKey: ["/api/vocabulary/context", selectedProjectId],
    enabled: !!selectedProjectId,
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const params = new URLSearchParams();
      params.set('projectId', selectedProjectId);
      const response = await fetch(`/api/vocabulary/context?${params.toString()}`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch vocabulary context');
      return response.json();
    }
  });

  // Fetch allocations for the selected project filtered by current user
  const { data: allocations } = useQuery({
    queryKey: ["/api/projects", selectedProjectId, "allocations"],
    enabled: !!selectedProjectId && !!currentUser,
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`/api/projects/${selectedProjectId}/allocations`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch allocations');
      const data = await response.json();
      // Filter allocations for current user
      return data.filter((a: any) => a.personId === currentUser?.id);
    }
  });

  // Sort all dropdowns alphabetically
  const sortedMilestones = useMemo(() => {
    if (!milestones) return [];
    return [...milestones].sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [milestones]);

  const sortedWorkstreams = useMemo(() => {
    if (!workstreams) return [];
    return [...workstreams].sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [workstreams]);

  const sortedProjectStages = useMemo(() => {
    if (!projectStages) return [];
    return [...projectStages].sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [projectStages]);
  
  const sortedAllocations = useMemo(() => {
    if (!allocations) return [];
    return [...allocations].sort((a: any, b: any) => (a.taskDescription || '').localeCompare(b.taskDescription || ''));
  }, [allocations]);

  // Fetch milestones and workstreams for edit form
  const { data: editMilestones } = useQuery({
    queryKey: ["/api/projects", editProjectId, "milestones"],
    enabled: !!editProjectId,
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`/api/projects/${editProjectId}/milestones`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch milestones');
      return response.json();
    }
  });

  const { data: editWorkstreams } = useQuery({
    queryKey: ["/api/projects", editProjectId, "workstreams"],
    enabled: !!editProjectId,
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`/api/projects/${editProjectId}/workstreams`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch workstreams');
      return response.json();
    }
  });

  const { data: editProjectStages } = useQuery({
    queryKey: ["/api/projects", editProjectId, "stages"],
    enabled: !!editProjectId,
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`/api/projects/${editProjectId}/stages`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch project stages');
      return response.json();
    }
  });

  // Fetch vocabulary context for edit form project to get custom terms
  const { data: editVocabularyContext } = useQuery({
    queryKey: ["/api/vocabulary/context", editProjectId],
    enabled: !!editProjectId,
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const params = new URLSearchParams();
      params.set('projectId', editProjectId);
      const response = await fetch(`/api/vocabulary/context?${params.toString()}`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch vocabulary context');
      return response.json();
    }
  });

  // Fetch allocations for edit form
  const { data: editAllocations } = useQuery({
    queryKey: ["/api/projects", editProjectId, "allocations"],
    enabled: !!editProjectId && !!currentUser,
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const response = await fetch(`/api/projects/${editProjectId}/allocations`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch allocations');
      const data = await response.json();
      // Filter allocations for current user
      return data.filter((a: any) => a.personId === currentUser?.id);
    }
  });

  // Sort edit form dropdowns alphabetically
  const sortedEditMilestones = useMemo(() => {
    if (!editMilestones) return [];
    return [...editMilestones].sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [editMilestones]);

  const sortedEditWorkstreams = useMemo(() => {
    if (!editWorkstreams) return [];
    return [...editWorkstreams].sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [editWorkstreams]);

  const sortedEditProjectStages = useMemo(() => {
    if (!editProjectStages) return [];
    return [...editProjectStages].sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [editProjectStages]);

  const sortedEditAllocations = useMemo(() => {
    if (!editAllocations) return [];
    return [...editAllocations].sort((a: any, b: any) => (a.taskDescription || '').localeCompare(b.taskDescription || ''));
  }, [editAllocations]);

  const { data: timeEntries, isLoading } = useQuery<TimeEntryWithRelations[]>({
    queryKey: ["/api/time-entries", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.projectId) params.append('projectId', filters.projectId);
      if (filters.clientId) params.append('clientId', filters.clientId);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      const response = await fetch(`/api/time-entries?${params.toString()}`, {
        credentials: 'include',
        headers: localStorage.getItem('sessionId') ? { 'X-Session-Id': localStorage.getItem('sessionId')! } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch time entries');
      return response.json();
    }
  });

  const createTimeEntryMutation = useMutation({
    mutationFn: async (data: TimeEntryFormData) => {
      console.log('Sending to API:', data);
      try {
        const response = await apiRequest("/api/time-entries", {
          method: "POST",
          body: JSON.stringify(data),
        });
        console.log('API response:', response);
        return response;
      } catch (error) {
        console.error('API error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      // Preserve the project selection and only reset the variable fields
      const currentProjectId = form.getValues("projectId");
      const currentMilestoneId = form.getValues("milestoneId");
      const currentWorkstreamId = form.getValues("workstreamId");
      const currentStageId = form.getValues("projectStageId");
      const currentAllocationId = form.getValues("allocationId");
      
      form.reset({
        date: formatLocalDate(new Date()),
        hours: "",
        billable: true,
        description: "",
        // Preserve project context - all dropdowns keep their values
        projectId: currentProjectId,
        milestoneId: currentMilestoneId,
        workstreamId: currentWorkstreamId,
        projectStageId: currentStageId,
        allocationId: currentAllocationId,
      });
      
      // Also ensure the selectedProjectId state stays in sync
      // This is important so milestone/workstream/stage dropdowns remain populated
      if (currentProjectId && currentProjectId !== selectedProjectId) {
        setSelectedProjectId(currentProjectId);
      }
      
      toast({
        title: "Time entry created",
        description: "Your time has been logged successfully.",
      });
    },
    onError: (error: any) => {
      console.error('Mutation error:', error);
      const errorMessage = error?.message || "Failed to create time entry. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const updateTimeEntryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TimeEntryFormData }) => {
      const response = await apiRequest(`/api/time-entries/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      setEditingEntry(null);
      editForm.reset();
      toast({
        title: "Time entry updated",
        description: "Your time entry has been updated successfully.",
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to update time entry.";
      if (errorMessage.includes("locked") || errorMessage.includes("invoice")) {
        toast({
          title: "Entry is locked",
          description: "This time entry is locked in an invoice batch and cannot be edited.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  const deleteTimeEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest(`/api/time-entries/${id}`, {
        method: "DELETE",
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      setDeletingEntry(null);
      toast({
        title: "Time entry deleted",
        description: "The time entry has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to delete time entry.";
      if (errorMessage.includes("locked") || errorMessage.includes("invoice")) {
        toast({
          title: "Entry is locked",
          description: "This time entry is locked in an invoice batch and cannot be deleted.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  const onSubmit = (data: TimeEntryFormData) => {
    console.log('Form submitted with data:', data);
    // Transform empty strings to undefined for optional foreign key fields only
    const cleanedData = {
      ...data,
      milestoneId: data.milestoneId === "" ? undefined : data.milestoneId || undefined,
      workstreamId: data.workstreamId === "" ? undefined : data.workstreamId || undefined,
      projectStageId: data.projectStageId === "" ? undefined : data.projectStageId || undefined,
      allocationId: data.allocationId === "" ? undefined : data.allocationId || undefined,
      // description is a text field, doesn't need special handling
    };
    console.log('Sending cleaned data:', cleanedData);
    createTimeEntryMutation.mutate(cleanedData);
  };

  const onEditSubmit = (data: TimeEntryFormData) => {
    if (!editingEntry) return;
    // Transform empty strings to undefined for optional foreign key fields only
    const cleanedData = {
      ...data,
      milestoneId: data.milestoneId === "" ? undefined : data.milestoneId || undefined,
      workstreamId: data.workstreamId === "" ? undefined : data.workstreamId || undefined,
      projectStageId: data.projectStageId === "" ? undefined : data.projectStageId || undefined,
      allocationId: data.allocationId === "" ? undefined : data.allocationId || undefined,
      // description is a text field, doesn't need special handling
    };
    updateTimeEntryMutation.mutate({ id: editingEntry.id, data: cleanedData });
  };

  const handleEditEntry = (entry: TimeEntryWithRelations) => {
    setEditingEntry(entry);
    setEditProjectId(entry.projectId);
    editForm.reset({
      date: entry.date,
      hours: entry.hours,
      billable: entry.billable,
      description: entry.description || "",
      projectId: entry.projectId,
      milestoneId: entry.milestoneId || "",
      workstreamId: entry.workstreamId || "",
      projectStageId: entry.projectStageId || "",
      allocationId: (entry as any).allocationId || "",
    });
  };

  const handleDeleteEntry = (entry: TimeEntryWithRelations) => {
    setDeletingEntry(entry);
  };

  const confirmDelete = () => {
    if (deletingEntry) {
      deleteTimeEntryMutation.mutate(deletingEntry.id);
    }
  };

  // Check if user can edit/delete entry
  const canModifyEntry = (entry: TimeEntryWithRelations) => {
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'billing-admin';
    const isOwner = entry.personId === currentUser?.id;
    const isLocked = entry.locked;
    
    // Admins can always modify unless locked
    if (isAdmin) return !isLocked || true; // Admins can even modify locked entries
    
    // Regular users can only modify their own unlocked entries
    return isOwner && !isLocked;
  };

  // Import component
  const ImportTimeEntriesButton = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const importMutation = useMutation({
      mutationFn: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const sessionId = localStorage.getItem('sessionId');
        const response = await fetch('/api/time-entries/import', {
          method: 'POST',
          body: formData,
          credentials: 'include',
          headers: sessionId ? { 'X-Session-Id': sessionId } : {},
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Import failed');
        }
        return response.json();
      },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
        
        // Handle complete failure (all rows failed)
        if (data.errors && data.errors.length > 0 && data.imported === 0) {
          // Create detailed error report
          const errorDetails = [];
          
          // Add missing projects/resources summary
          if (data.summary?.missingProjects?.length > 0) {
            errorDetails.push(`❌ Missing Projects: ${data.summary.missingProjects.join(', ')}`);
          }
          if (data.summary?.missingResources?.length > 0) {
            errorDetails.push(`❌ Missing Users: ${data.summary.missingResources.join(', ')}`);
          }
          
          // Show first few specific row errors
          const firstErrors = data.errors.filter((e: string) => !e.startsWith('MISSING')).slice(0, 3);
          if (firstErrors.length > 0) {
            errorDetails.push('', 'Sample errors:');
            firstErrors.forEach((err: string) => errorDetails.push(`• ${err}`));
          }
          
          // Create downloadable error report
          const fullErrorReport = [
            `Import Error Report - ${new Date().toLocaleString()}`,
            `================================`,
            `Total Rows: ${data.summary?.totalRows || data.errors.length}`,
            `Successfully Imported: ${data.imported}`,
            `Failed: ${data.errors.length}`,
            '',
            'Missing Data:',
            ...data.summary?.missingProjects?.map((p: string) => `  - Project: ${p}`) || [],
            ...data.summary?.missingResources?.map((r: string) => `  - User: ${r}`) || [],
            '',
            'All Errors:',
            ...data.errors
          ].join('\n');
          
          // Create download link
          const blob = new Blob([fullErrorReport], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          
          toast({
            title: "Import Failed - All Rows Had Errors",
            description: (
              <div className="space-y-2 text-sm">
                <div>{errorDetails.join('\n')}</div>
                <a 
                  href={url}
                  download={`import-errors-${Date.now()}.txt`}
                  className="inline-flex items-center justify-center rounded-md bg-secondary px-3 py-1 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary/80 mt-2"
                >
                  📥 Download Full Error Report
                </a>
              </div>
            ),
            variant: "destructive",
            duration: 15000, // Show for 15 seconds
          });
        }
        // Handle partial success
        else if (data.errors && data.errors.length > 0) {
          toast({
            title: "Import Partially Successful",
            description: `✅ ${data.imported} entries imported, ❌ ${data.errors.length} failed. Missing: ${data.summary?.missingProjects?.join(', ') || 'none'}`,
            variant: "destructive",
            duration: 10000,
          });
        }
        // Handle warnings
        else if (data.warnings && data.warnings.length > 0) {
          toast({
            title: "Import completed with warnings",
            description: `${data.message}. ${data.warnings[0]}`,
          });
        }
        // Complete success
        else {
          toast({
            title: "Import completed successfully",
            description: data.message,
          });
        }
      },
      onError: (error: any) => {
        toast({
          title: "Import failed",
          description: error.message || "Failed to import time entries",
          variant: "destructive",
        });
      },
    });

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        importMutation.mutate(file);
      }
    };

    return (
      <>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
          ref={fileInputRef}
          style={{ display: 'none' }}
        />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={importMutation.isPending}
          data-testid="button-import-entries"
        >
          <Upload className="w-4 h-4 mr-2" />
          {importMutation.isPending ? "Importing..." : "Import Entries"}
        </Button>
      </>
    );
  };

  return (
    <Layout>
      <div className="space-y-4 lg:space-y-6">
        {/* Header - Responsive */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl lg:text-3xl font-bold" data-testid="time-tracking-title">Time Tracking</h2>
            <p className="text-sm lg:text-base text-muted-foreground" data-testid="time-tracking-subtitle">
              Log your daily hours and track project progress
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" data-testid="button-download-template">
                  <FileText className="w-4 h-4 mr-2" />
                  Download Template
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Download Template</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      const sessionId = localStorage.getItem('sessionId');
                      const response = await fetch('/api/time-entries/template', {
                        method: 'GET',
                        credentials: 'include',
                        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
                      });
                      
                      if (!response.ok) {
                        throw new Error('Failed to download template');
                      }
                      
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'time-entries-template.xlsx';
                      a.click();
                      window.URL.revokeObjectURL(url);
                      
                      toast({
                        title: "Template downloaded",
                        description: "Generic template with example data.",
                      });
                    } catch (error) {
                      toast({
                        title: "Download failed",
                        description: "Unable to download the template. Please try again.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Generic Template
                </DropdownMenuItem>
                {projects && projects.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Project-Specific Template
                    </DropdownMenuLabel>
                    {projects.slice(0, 10).map((project: ProjectWithClient) => (
                      <DropdownMenuItem
                        key={project.id}
                        onClick={async () => {
                          try {
                            const sessionId = localStorage.getItem('sessionId');
                            const response = await fetch(`/api/time-entries/template?projectId=${project.id}`, {
                              method: 'GET',
                              credentials: 'include',
                              headers: sessionId ? { 'X-Session-Id': sessionId } : {},
                            });
                            
                            if (!response.ok) {
                              throw new Error('Failed to download template');
                            }
                            
                            const blob = await response.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `time-entries-${project.code || project.name}.xlsx`;
                            a.click();
                            window.URL.revokeObjectURL(url);
                            
                            toast({
                              title: "Template downloaded",
                              description: `Template with ${project.name} stages and workstreams.`,
                            });
                          } catch (error) {
                            toast({
                              title: "Download failed",
                              description: "Unable to download the template. Please try again.",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
                        <span className="truncate">{formatProjectLabel(project)}</span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const sessionId = localStorage.getItem('sessionId');
                  const params = new URLSearchParams();
                  const response = await fetch(`/api/time-entries/export?${params.toString()}`, {
                    method: 'GET',
                    credentials: 'include',
                    headers: sessionId ? { 'X-Session-Id': sessionId } : {},
                  });
                  
                  if (!response.ok) {
                    throw new Error('Failed to export entries');
                  }
                  
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `time-entries-${new Date().toISOString().split('T')[0]}.xlsx`;
                  a.click();
                  window.URL.revokeObjectURL(url);
                  
                  toast({
                    title: "Export completed",
                    description: "Your time entries have been exported successfully.",
                  });
                } catch (error) {
                  toast({
                    title: "Export failed",
                    description: "Unable to export time entries. Please try again.",
                    variant: "destructive",
                  });
                }
              }}
              data-testid="button-export-entries"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Entries
            </Button>
            <ImportTimeEntriesButton />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* Time Entry Form - Mobile Optimized */}
          <Card className="lg:col-span-1" data-testid="time-entry-form">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center text-lg lg:text-xl">
                <Plus className="w-5 h-5 mr-2" />
                Log Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form 
                  name="log-time-entry-form"
                  onSubmit={form.handleSubmit(onSubmit, (errors) => {
                    console.log('Form validation errors:', errors);
                  })} 
                  className="space-y-4" 
                  noValidate
                >
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Date</FormLabel>
                          {field.value !== formatLocalDate(new Date()) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-auto py-0.5 px-2 text-xs"
                              onClick={() => field.onChange(formatLocalDate(new Date()))}
                              data-testid="button-today"
                            >
                              Today
                            </Button>
                          )}
                        </div>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-select-date"
                              >
                                {field.value ? (
                                  format(parseLocalDate(field.value), "PPP")
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
                              selected={field.value ? parseLocalDate(field.value) : undefined}
                              onSelect={(date) => field.onChange(date ? formatLocalDate(date) : '')}
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
                        <Select 
                          onValueChange={(value) => {
                            field.onChange(value);
                            setSelectedProjectId(value);
                            // Clear milestone and workstream when project changes
                            form.setValue('milestoneId', '');
                            form.setValue('workstreamId', '');
                          }} 
                          value={field.value || undefined}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-project">
                              <SelectValue placeholder="Select project" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {activeProjects?.map((project) => (
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

                  <FormField
                    control={form.control}
                    name="hours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hours</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.25"
                            min="0.01"
                            max="24"
                            placeholder="Enter hours (e.g., 8 or 8.5)"
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value)}
                            data-testid="input-hours"
                          />
                        </FormControl>
                        {/* Quick Hour Buttons - Mobile Optimized */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {[0.5, 1, 2, 4, 8].map((hours) => (
                            <Button
                              key={hours}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="px-3 py-1 text-xs"
                              onClick={() => field.onChange(hours.toString())}
                              data-testid={`button-quick-hours-${hours}`}
                            >
                              {hours}h
                            </Button>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="milestoneId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Milestone (Optional)</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value || undefined}
                          disabled={!selectedProjectId || milestonesLoading}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-milestone">
                              <SelectValue placeholder={!selectedProjectId ? "Select project first" : "Select milestone"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sortedMilestones?.map((milestone: any) => (
                              <SelectItem key={milestone.id} value={milestone.id}>
                                {milestone.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="workstreamId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{vocabularyContext?.workstream || 'Workstream'} (Optional)</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value || undefined}
                          disabled={!selectedProjectId || workstreamsLoading}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-workstream">
                              <SelectValue placeholder={!selectedProjectId ? "Select project first" : `Select ${vocabularyContext?.workstream?.toLowerCase() || 'workstream'}`} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sortedWorkstreams?.map((workstream: any) => (
                              <SelectItem key={workstream.id} value={workstream.id}>
                                {workstream.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="projectStageId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{vocabularyContext?.stage || 'Stage'} (Optional)</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value || undefined}
                          disabled={!selectedProjectId || projectStagesLoading}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-stage">
                              <SelectValue placeholder={!selectedProjectId ? "Select project first" : `Select ${vocabularyContext?.stage?.toLowerCase() || 'stage'}`} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sortedProjectStages?.map((stage: any) => (
                              <SelectItem key={stage.id} value={stage.id}>
                                {stage.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="allocationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assignment (Optional)</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value || undefined}
                          disabled={!selectedProjectId}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-allocation">
                              <SelectValue placeholder={!selectedProjectId ? "Select project first" : "Select assignment"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sortedAllocations?.map((allocation: any) => (
                              <SelectItem key={allocation.id} value={allocation.id}>
                                {allocation.taskDescription || `${allocation.hours}h allocation`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Brief description of work performed..."
                            {...field}
                            value={field.value ?? ""}
                            data-testid="textarea-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="billable"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-billable"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Billable to client</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={createTimeEntryMutation.isPending}
                    data-testid="button-submit-time"
                  >
                    {createTimeEntryMutation.isPending ? "Saving..." : "Log Time"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Time Entries List */}
          <Card className="lg:col-span-2" data-testid="time-entries-list">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="w-5 h-5 mr-2" />
                Recent Time Entries
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-16 bg-muted rounded"></div>
                    </div>
                  ))}
                </div>
              ) : timeEntries?.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No time entries yet</h3>
                  <p className="text-muted-foreground">Start logging your time to track project progress.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {timeEntries?.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/30 transition-colors"
                      data-testid={`time-entry-${entry.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <div className="font-medium" data-testid={`entry-project-${entry.id}`}>
                            {entry.project.name}
                          </div>
                          <div className="text-sm text-muted-foreground" data-testid={`entry-client-${entry.id}`}>
                            {entry.project.client.name}
                          </div>
                          {entry.billable && (
                            <div className="text-xs bg-chart-4/10 text-chart-4 px-2 py-0.5 rounded-full">
                              Billable
                            </div>
                          )}
                          {entry.locked && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Lock className="w-3 h-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Locked in invoice batch</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {entry.milestone && (
                            <span className="mr-2" data-testid={`entry-milestone-${entry.id}`}>
                              📍 {entry.milestone.name}
                            </span>
                          )}
                          {entry.workstream && (
                            <span className="mr-2" data-testid={`entry-workstream-${entry.id}`}>
                              🔄 {entry.workstream.name}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1" data-testid={`entry-description-${entry.id}`}>
                          {entry.description}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-medium" data-testid={`entry-hours-${entry.id}`}>
                            {entry.hours}h
                          </div>
                          <div className="text-sm text-muted-foreground" data-testid={`entry-date-${entry.id}`}>
                            {format(parseLocalDate(entry.date), 'MMM d')}
                          </div>
                        </div>
                        {canModifyEntry(entry) && (
                          <div className="flex gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditEntry(entry)}
                                    disabled={entry.locked && currentUser?.role !== 'admin' && currentUser?.role !== 'billing-admin'}
                                    data-testid={`button-edit-${entry.id}`}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Edit entry</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteEntry(entry)}
                                    disabled={entry.locked && currentUser?.role !== 'admin' && currentUser?.role !== 'billing-admin'}
                                    data-testid={`button-delete-${entry.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Delete entry</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
          <DialogContent className="max-w-2xl" data-testid="dialog-edit-time-entry">
            <DialogHeader>
              <DialogTitle>Edit Time Entry</DialogTitle>
              <DialogDescription>
                Update the details of your time entry.
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form name="edit-time-entry-overview-form" onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4" noValidate>
                <FormField
                  control={editForm.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-edit-select-date"
                            >
                              {field.value ? (
                                format(parseLocalDate(field.value), "PPP")
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
                            selected={field.value ? parseLocalDate(field.value) : undefined}
                            onSelect={(date) => field.onChange(date ? formatLocalDate(date) : '')}
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
                  control={editForm.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          setEditProjectId(value);
                          editForm.setValue('milestoneId', '');
                          editForm.setValue('workstreamId', '');
                        }} 
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-project">
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeProjects?.map((project) => (
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

                <FormField
                  control={editForm.control}
                  name="hours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hours</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.25"
                          min="0.01"
                          max="24"
                          placeholder="Enter hours (e.g., 8 or 8.5)"
                          {...field}
                          value={field.value || ''}
                          onChange={(e) => field.onChange(e.target.value)}
                          data-testid="input-edit-hours"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="milestoneId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Milestone (Optional)</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value || undefined}
                        disabled={!editProjectId}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-milestone">
                            <SelectValue placeholder={!editProjectId ? "Select project first" : "Select milestone"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sortedEditMilestones?.map((milestone: any) => (
                            <SelectItem key={milestone.id} value={milestone.id}>
                              {milestone.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="workstreamId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{editVocabularyContext?.workstream || 'Workstream'} (Optional)</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value || undefined}
                        disabled={!editProjectId}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-workstream">
                            <SelectValue placeholder={!editProjectId ? "Select project first" : `Select ${editVocabularyContext?.workstream?.toLowerCase() || 'workstream'}`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sortedEditWorkstreams?.map((workstream: any) => (
                            <SelectItem key={workstream.id} value={workstream.id}>
                              {workstream.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="projectStageId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{editVocabularyContext?.stage || 'Stage'} (Optional)</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value || undefined}
                        disabled={!editProjectId}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-stage">
                            <SelectValue placeholder={!editProjectId ? "Select project first" : `Select ${editVocabularyContext?.stage?.toLowerCase() || 'stage'}`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sortedEditProjectStages?.map((stage: any) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="allocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assignment (Optional)</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value || undefined}
                        disabled={!editProjectId}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-allocation">
                            <SelectValue placeholder={!editProjectId ? "Select project first" : "Select assignment"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sortedEditAllocations?.map((allocation: any) => (
                            <SelectItem key={allocation.id} value={allocation.id}>
                              {allocation.taskDescription || `${allocation.hours}h allocation`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                        <Textarea
                          placeholder="Brief description of work performed..."
                          {...field}
                          value={field.value ?? ""}
                          data-testid="textarea-edit-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="billable"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-edit-billable"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Billable to client</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingEntry(null)}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={updateTimeEntryMutation.isPending}
                    data-testid="button-save-edit"
                  >
                    {updateTimeEntryMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deletingEntry} onOpenChange={() => setDeletingEntry(null)}>
          <AlertDialogContent data-testid="dialog-delete-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the time entry for{" "}
                {deletingEntry && (
                  <>
                    <strong>{deletingEntry.hours} hours</strong> on{" "}
                    <strong>{format(parseLocalDate(deletingEntry.date), "PPP")}</strong>
                    {deletingEntry.project && (
                      <> for project <strong>{deletingEntry.project.name}</strong></>
                    )}.
                  </>
                )}
                {" "}This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                disabled={deleteTimeEntryMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteTimeEntryMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
