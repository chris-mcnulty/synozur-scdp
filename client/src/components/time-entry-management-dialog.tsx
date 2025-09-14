import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TimeEntry, User, ProjectMilestone, ProjectWorkstream } from "@shared/schema";

const timeEntryEditSchema = z.object({
  date: z.string(),
  hours: z.string()
    .min(1, "Hours is required")
    .refine(
      (val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0 && num <= 24;
      },
      "Hours must be between 0.01 and 24"
    ),
  personId: z.string().min(1, "Person is required"),
  description: z.string(),
  billable: z.boolean(),
  milestoneId: z.string().optional(),
  workstreamId: z.string().optional(),
  phase: z.string().optional(),
});

type TimeEntryEditData = z.infer<typeof timeEntryEditSchema>;

interface TimeEntryManagementDialogProps {
  entry: TimeEntry | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// Helper function to parse date string without timezone issues
function parseLocalDate(dateStr: string): Date {
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

export function TimeEntryManagementDialog({
  entry,
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: TimeEntryManagementDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const { toast } = useToast();

  const form = useForm<TimeEntryEditData>({
    resolver: zodResolver(timeEntryEditSchema),
    defaultValues: {
      date: "",
      hours: "",
      personId: "",
      description: "",
      billable: true,
      milestoneId: "",
      workstreamId: "",
      phase: "",
    },
  });

  // Fetch all assignable users
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: open,
  });

  // Fetch milestones and workstreams for the project
  const { data: milestones = [] } = useQuery<ProjectMilestone[]>({
    queryKey: ["/api/projects", projectId, "milestones"],
    enabled: open && !!projectId,
  });

  const { data: workstreams = [] } = useQuery<ProjectWorkstream[]>({
    queryKey: ["/api/projects", projectId, "workstreams"],
    enabled: open && !!projectId,
  });

  // Filter to only show assignable users
  const assignableUsers = users.filter(u => u.isAssignable && u.isActive);

  // Update form when entry changes
  useEffect(() => {
    if (entry) {
      const entryDate = parseLocalDate(entry.date);
      setSelectedDate(entryDate);
      form.reset({
        date: entry.date,
        hours: entry.hours.toString(),
        personId: entry.personId,
        description: entry.description || "",
        billable: entry.billable,
        milestoneId: entry.milestoneId || "",
        workstreamId: entry.workstreamId || "",
        phase: entry.phase || "",
      });
    }
  }, [entry, form]);

  const updateTimeEntry = useMutation({
    mutationFn: async (data: TimeEntryEditData) => {
      if (!entry) throw new Error("No entry to update");
      
      return apiRequest(`/api/time-entries/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      // Invalidate both time entries and projects queries
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Success",
        description: "Time entry updated successfully",
      });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      console.error("Error updating time entry:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update time entry",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: TimeEntryEditData) => {
    updateTimeEntry.mutate(data);
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (date) {
      form.setValue("date", formatLocalDate(date));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Time Entry</DialogTitle>
          <DialogDescription>
            Update time entry details and reassign to different team members.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                            "w-full justify-start text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          data-testid="button-date-picker"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(parseLocalDate(field.value), "PPP") : "Pick a date"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleDateSelect}
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
              name="personId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign To</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-person">
                        <SelectValue placeholder="Select a person">
                          {field.value && (
                            <div className="flex items-center gap-2">
                              <UserIcon className="w-4 h-4" />
                              <span>
                                {assignableUsers.find(u => u.id === field.value)?.name || "Unknown"}
                              </span>
                            </div>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {assignableUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id} data-testid={`select-person-${user.id}`}>
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4" />
                            <div>
                              <div className="font-medium">{user.name}</div>
                              {user.title && (
                                <div className="text-xs text-muted-foreground">{user.title}</div>
                              )}
                            </div>
                          </div>
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
                      placeholder="Enter hours worked"
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the work performed"
                      className="resize-none"
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
                    <Select onValueChange={(value) => field.onChange(value === "none" ? "" : value)} value={field.value || "none">
                      <FormControl>
                        <SelectTrigger data-testid="select-milestone">
                          <SelectValue placeholder="Select a milestone" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none" data-testid="select-milestone-none">None</SelectItem>
                        {milestones.map((milestone) => (
                          <SelectItem key={milestone.id} value={milestone.id} data-testid={`select-milestone-${milestone.id}`}>
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
                    <Select onValueChange={(value) => field.onChange(value === "none" ? "" : value)} value={field.value || "none"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-workstream">
                          <SelectValue placeholder="Select a workstream" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none" data-testid="select-workstream-none">None</SelectItem>
                        {workstreams.map((workstream) => (
                          <SelectItem key={workstream.id} value={workstream.id} data-testid={`select-workstream-${workstream.id}`}>
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
                  <Select onValueChange={(value) => field.onChange(value === "none" ? "" : value)} value={field.value || "none"}>
                    <FormControl>
                      <SelectTrigger data-testid="select-phase">
                        <SelectValue placeholder="Select a phase" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none" data-testid="select-phase-none">None</SelectItem>
                      <SelectItem value="Discovery" data-testid="select-phase-discovery">Discovery</SelectItem>
                      <SelectItem value="Design" data-testid="select-phase-design">Design</SelectItem>
                      <SelectItem value="Development" data-testid="select-phase-development">Development</SelectItem>
                      <SelectItem value="Testing" data-testid="select-phase-testing">Testing</SelectItem>
                      <SelectItem value="Deployment" data-testid="select-phase-deployment">Deployment</SelectItem>
                      <SelectItem value="Maintenance" data-testid="select-phase-maintenance">Maintenance</SelectItem>
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