import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getTodayBusinessDate } from "@/lib/date-utils";

// Helper functions for date handling
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Form validation schema
const timeEntryFormSchema = z.object({
  personId: z.string().min(1, "Person is required"),
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
  billable: z.boolean(),
  description: z.string().optional(),
  milestoneId: z.string().optional(),
  workstreamId: z.string().optional(),
  phase: z.string().optional(),
});

type TimeEntryFormData = z.infer<typeof timeEntryFormSchema>;

interface TimeEntryManagementDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  timeEntry: any | null;
  projectId: string;
}

export function TimeEntryManagementDialog({
  isOpen,
  onOpenChange,
  timeEntry,
  projectId,
}: TimeEntryManagementDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch users for reassignment dropdown
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: isOpen,
  });

  // Fetch project-specific data
  const { data: milestones = [] } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/milestones`],
    enabled: isOpen && !!projectId,
  });

  const { data: workstreams = [] } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/workstreams`],
    enabled: isOpen && !!projectId,
  });

  const form = useForm<TimeEntryFormData>({
    resolver: zodResolver(timeEntryFormSchema),
    defaultValues: {
      personId: "",
      date: getTodayBusinessDate(),
      hours: "",
      billable: true,
      description: "",
      milestoneId: "none",
      workstreamId: "none",
      phase: "none",
    },
  });

  // Reset form when timeEntry changes
  useEffect(() => {
    if (timeEntry && isOpen) {
      form.reset({
        personId: timeEntry.personId || "",
        date: timeEntry.date || getTodayBusinessDate(),
        hours: timeEntry.hours?.toString() || "",
        billable: timeEntry.billable ?? true,
        description: timeEntry.description || "",
        milestoneId: timeEntry.milestoneId || "none",
        workstreamId: timeEntry.workstreamId || "none",
        phase: timeEntry.phase || "none",
      });
    }
  }, [timeEntry, isOpen, form]);

  const updateTimeEntry = useMutation({
    mutationFn: async (data: TimeEntryFormData) => {
      const response = await apiRequest(`/api/time-entries/${timeEntry?.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...data,
          milestoneId: data.milestoneId === "" || data.milestoneId === "none" ? undefined : data.milestoneId,
          workstreamId: data.workstreamId === "" || data.workstreamId === "none" ? undefined : data.workstreamId,
          phase: data.phase === "" || data.phase === "none" ? undefined : data.phase,
        }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/time-entries?projectId=${projectId}`] });
      toast({
        title: "Time entry updated",
        description: "The time entry has been updated successfully.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update time entry. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TimeEntryFormData) => {
    updateTimeEntry.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Time Entry</DialogTitle>
          <DialogDescription>
            Update the time entry details and reassign team members if needed.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form name="time-entry-edit-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="personId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign to Person</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-person">
                        <SelectValue placeholder="Select a person" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.fullName || user.email}
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
                        disabled={(date) => {
                          const today = new Date();
                          const minDate = new Date(1900, 0, 1);
                          return date > today || date < minDate;
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
              name="hours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hours</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      min="0.01"
                      max="24"
                      placeholder="Enter hours (e.g., 8 or 8.5)"
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow empty string for clearing the field
                        if (value === '') {
                          field.onChange('');
                          return;
                        }
                        // Allow typing decimal point
                        if (value.endsWith('.')) {
                          field.onChange(value);
                          return;
                        }
                        // Parse and validate the number
                        const num = parseFloat(value);
                        if (!isNaN(num)) {
                          field.onChange(value);
                        }
                      }}
                      data-testid="input-hours"
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
                    <FormLabel>Billable</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            {milestones.length > 0 && (
              <FormField
                control={form.control}
                name="milestoneId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Milestone (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-milestone">
                          <SelectValue placeholder="Select a milestone" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {milestones.map((milestone) => (
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
            )}

            {workstreams.length > 0 && (
              <FormField
                control={form.control}
                name="workstreamId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workstream (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-workstream">
                          <SelectValue placeholder="Select a workstream" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {workstreams.map((workstream) => (
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
            )}

            <FormField
              control={form.control}
              name="phase"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phase (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-phase">
                        <SelectValue placeholder="Select a phase" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="Discovery">Discovery</SelectItem>
                      <SelectItem value="Design">Design</SelectItem>
                      <SelectItem value="Development">Development</SelectItem>
                      <SelectItem value="Testing">Testing</SelectItem>
                      <SelectItem value="Deployment">Deployment</SelectItem>
                      <SelectItem value="Maintenance">Maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateTimeEntry.isPending} data-testid="button-save">
                {updateTimeEntry.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}