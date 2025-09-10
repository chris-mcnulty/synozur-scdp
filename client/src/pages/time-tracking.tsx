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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTimeEntrySchema, type TimeEntry } from "@shared/schema";
import { format } from "date-fns";
import { CalendarIcon, Plus, Clock, Download, Upload, FileText, Filter, ChevronDown, ChevronRight, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { z } from "zod";

const timeEntryFormSchema = insertTimeEntrySchema.extend({
  date: z.string(),
});

type TimeEntryFormData = z.infer<typeof timeEntryFormSchema>;

export default function TimeTracking() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    projectId: "",
    clientId: "",
    startDate: "",
    endDate: ""
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<TimeEntryFormData>({
    resolver: zodResolver(timeEntryFormSchema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      hours: "0",
      billable: true,
      description: "",
      phase: "",
      projectId: "",
    },
  });

  const { data: projects } = useQuery({
    queryKey: ["/api/projects"],
  });
  
  const { data: clients } = useQuery({
    queryKey: ["/api/clients"],
  });
  
  const { data: currentUser } = useQuery({
    queryKey: ["/api/auth/me"],
  });

  const { data: timeEntries, isLoading } = useQuery({
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
      const response = await apiRequest("POST", "/api/time-entries", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      form.reset();
      toast({
        title: "Time entry created",
        description: "Your time has been logged successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create time entry. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TimeEntryFormData) => {
    createTimeEntryMutation.mutate(data);
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold" data-testid="time-tracking-title">Time Tracking</h2>
            <p className="text-muted-foreground" data-testid="time-tracking-subtitle">
              Log your daily hours and track project progress
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
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
                    description: "Check your downloads folder for the template file.",
                  });
                } catch (error) {
                  toast({
                    title: "Download failed",
                    description: "Unable to download the template. Please try again.",
                    variant: "destructive",
                  });
                }
              }}
              data-testid="button-download-template"
            >
              <FileText className="w-4 h-4 mr-2" />
              Download Template
            </Button>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Time Entry Form */}
          <Card className="lg:col-span-1" data-testid="time-entry-form">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Plus className="w-5 h-5 mr-2" />
                Log Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
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
                                data-testid="button-select-date"
                              >
                                {field.value ? (
                                  format(new Date(field.value), "PPP")
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
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-project">
                              <SelectValue placeholder="Select project" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {projects?.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name} - {project.client.name}
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
                            min="0"
                            max="24"
                            placeholder="8.0"
                            {...field}
                            data-testid="input-hours"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phase"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phase (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Assessment, Strategy Design"
                            {...field}
                            data-testid="input-phase"
                          />
                        </FormControl>
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
                        </div>
                        <div className="text-sm text-muted-foreground mt-1" data-testid={`entry-description-${entry.id}`}>
                          {entry.description}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium" data-testid={`entry-hours-${entry.id}`}>
                          {entry.hours}h
                        </div>
                        <div className="text-sm text-muted-foreground" data-testid={`entry-date-${entry.id}`}>
                          {format(new Date(entry.date), 'MMM d')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
