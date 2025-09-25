import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRoleSchema, insertUserRateScheduleSchema, type Role, type User, type UserRateSchedule } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { getTodayBusinessDate } from "@/lib/date-utils";
import { 
  Plus, 
  DollarSign, 
  Users, 
  Settings, 
  CalendarIcon,
  Edit,
  Trash2,
  AlertTriangle,
  Clock,
  RefreshCcw,
  PlayCircle,
  CheckCircle2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

const roleFormSchema = insertRoleSchema;
type RoleFormData = z.infer<typeof roleFormSchema>;

const rateScheduleFormSchema = z.object({
  userId: z.string().min(1, "Please select a user"),
  effectiveStart: z.string().min(1, "Start date is required"),
  effectiveEnd: z.string().optional(),
  billingRate: z.string().min(1, "Billing rate is required"),
  costRate: z.string().min(1, "Cost rate is required"),
  notes: z.string().optional(),
});

type RateScheduleFormData = z.infer<typeof rateScheduleFormSchema>;

const bulkUpdateFormSchema = z.object({
  userId: z.string().optional(),
  projectId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  mode: z.enum(['override', 'recalculate']),
  billingRate: z.string().optional(),
  costRate: z.string().optional(),
  skipLocked: z.boolean().default(true),
});

type BulkUpdateFormData = z.infer<typeof bulkUpdateFormSchema>;

export default function RateManagement() {
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newScheduleOpen, setNewScheduleOpen] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [previewData, setPreviewData] = useState<any>(null);
  
  const { hasRole } = useAuth();
  const { toast } = useToast();

  // Redirect if not authorized
  if (!hasRole('admin') && !hasRole('billing-admin') && !hasRole('pm')) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-96">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <h3 className="text-lg font-medium mb-2">Access Denied</h3>
              <p className="text-muted-foreground">
                You need admin, billing admin, or PM privileges to access rate management.
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const roleForm = useForm<RoleFormData>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: "",
      defaultRackRate: "0",
    },
  });

  const scheduleForm = useForm<RateScheduleFormData>({
    resolver: zodResolver(rateScheduleFormSchema),
    defaultValues: {
      userId: "",
      effectiveStart: getTodayBusinessDate(),
      effectiveEnd: "",
      billingRate: "0",
      costRate: "0",
      notes: "",
    },
  });

  const bulkUpdateForm = useForm<BulkUpdateFormData>({
    resolver: zodResolver(bulkUpdateFormSchema),
    defaultValues: {
      mode: "override",
      skipLocked: true,
    },
  });

  // Queries
  const { data: roles = [], isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: hasRole('admin'),
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const { data: rateSchedules = [], isLoading: schedulesLoading } = useQuery<UserRateSchedule[]>({
    queryKey: ["/api/rates/schedules", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      return apiRequest(`/api/rates/schedules?userId=${selectedUserId}`);
    },
    enabled: !!selectedUserId,
  });

  // Mutations
  const createRoleMutation = useMutation({
    mutationFn: async (data: RoleFormData) => {
      return apiRequest("/api/roles", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      roleForm.reset();
      setNewRoleOpen(false);
      toast({
        title: "Role created",
        description: "New role has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create role. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createScheduleMutation = useMutation({
    mutationFn: async (data: RateScheduleFormData) => {
      return apiRequest("/api/rates/schedules", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rates/schedules"] });
      scheduleForm.reset();
      setNewScheduleOpen(false);
      toast({
        title: "Rate schedule created",
        description: "New rate schedule has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create rate schedule. Please try again.",
        variant: "destructive",
      });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (data: BulkUpdateFormData & { dryRun?: boolean }) => {
      return apiRequest("/api/rates/bulk-update", {
        method: "POST",
        body: JSON.stringify({
          filters: {
            userId: (data.userId && data.userId !== "all-users") ? data.userId : undefined,
            projectId: (data.projectId && data.projectId !== "all-projects") ? data.projectId : undefined,
            startDate: data.startDate || undefined,
            endDate: data.endDate || undefined,
          },
          rates: {
            mode: data.mode,
            billingRate: data.billingRate ? parseFloat(data.billingRate) : undefined,
            costRate: data.costRate ? parseFloat(data.costRate) : undefined,
          },
          skipLocked: data.skipLocked,
          dryRun: data.dryRun,
        }),
      });
    },
    onSuccess: (data, variables) => {
      if (variables.dryRun) {
        setPreviewData(data);
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
        setBulkUpdateOpen(false);
        bulkUpdateForm.reset();
        toast({
          title: "Rates updated",
          description: `Successfully updated ${data.updated} time entries.`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update rates. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      return apiRequest(`/api/roles/${roleId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      toast({
        title: "Role deleted",
        description: "Role has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete role. It may be in use.",
        variant: "destructive",
      });
    },
  });

  const onSubmitRole = (data: RoleFormData) => {
    createRoleMutation.mutate(data);
  };

  const onSubmitSchedule = (data: RateScheduleFormData) => {
    createScheduleMutation.mutate(data);
  };

  const onSubmitBulkUpdate = (data: BulkUpdateFormData) => {
    // First do a dry run
    bulkUpdateMutation.mutate({ ...data, dryRun: true });
  };

  const handleApplyBulkUpdate = () => {
    const data = bulkUpdateForm.getValues();
    bulkUpdateMutation.mutate({ ...data, dryRun: false });
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold" data-testid="rate-management-title">Rate Management</h2>
            <p className="text-muted-foreground" data-testid="rate-management-subtitle">
              Manage role rates, user rate schedules, and bulk updates
            </p>
          </div>
          <Badge className="bg-primary/10 text-primary">
            {hasRole('admin') ? 'Admin' : hasRole('billing-admin') ? 'Billing Admin' : 'PM'}
          </Badge>
        </div>

        {/* Rate Management Tabs */}
        <Tabs defaultValue="roles" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="roles" data-testid="tab-roles">Roles & Standard Rates</TabsTrigger>
            <TabsTrigger value="schedules" data-testid="tab-schedules">Rate Schedules</TabsTrigger>
            <TabsTrigger value="bulk" data-testid="tab-bulk">Bulk Updates</TabsTrigger>
          </TabsList>

          {/* Roles Tab */}
          <TabsContent value="roles" className="space-y-4">
            <Card data-testid="roles-management">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <Users className="w-5 h-5 mr-2" />
                    Standard Role Rates
                  </CardTitle>
                  {hasRole('admin') && (
                    <Dialog open={newRoleOpen} onOpenChange={setNewRoleOpen}>
                      <DialogTrigger asChild>
                        <Button data-testid="button-new-role">
                          <Plus className="w-4 h-4 mr-2" />
                          New Role
                        </Button>
                      </DialogTrigger>
                      <DialogContent data-testid="new-role-modal">
                        <DialogHeader>
                          <DialogTitle>Create New Role</DialogTitle>
                        </DialogHeader>
                        <Form {...roleForm}>
                          <form onSubmit={roleForm.handleSubmit(onSubmitRole)} className="space-y-4">
                            <FormField
                              control={roleForm.control}
                              name="name"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Role Name</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="e.g., Senior Consultant"
                                      {...field}
                                      data-testid="input-role-name"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={roleForm.control}
                              name="defaultRackRate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Default Rack Rate ($/hour)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      placeholder="250.00"
                                      {...field}
                                      data-testid="input-default-rate"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="flex justify-end space-x-3">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setNewRoleOpen(false)}
                                data-testid="button-cancel-role"
                              >
                                Cancel
                              </Button>
                              <Button
                                type="submit"
                                disabled={createRoleMutation.isPending}
                                data-testid="button-create-role"
                              >
                                {createRoleMutation.isPending ? "Creating..." : "Create Role"}
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {rolesLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-16 bg-muted rounded"></div>
                      </div>
                    ))}
                  </div>
                ) : roles?.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No roles defined</h3>
                    <p className="text-muted-foreground">Create roles to set standard billing rates.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {roles?.map((role) => (
                      <div
                        key={role.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/30 transition-colors"
                        data-testid={`role-${role.id}`}
                      >
                        <div>
                          <div className="font-medium" data-testid={`role-name-${role.id}`}>
                            {role.name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Created {format(new Date(role.createdAt), 'MMM d, yyyy')}
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <div className="font-medium text-lg" data-testid={`role-rate-${role.id}`}>
                              ${parseFloat(role.defaultRackRate).toFixed(2)}/hr
                            </div>
                            <div className="text-sm text-muted-foreground">Standard Rate</div>
                          </div>
                          {hasRole('admin') && (
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => deleteRoleMutation.mutate(role.id)}
                                data-testid={`button-delete-role-${role.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rate Schedules Tab */}
          <TabsContent value="schedules" className="space-y-4">
            <Card data-testid="rate-schedules-management">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <Clock className="w-5 h-5 mr-2" />
                    User Rate Schedules
                  </CardTitle>
                  <div className="flex items-center space-x-3">
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger className="w-[200px]" data-testid="select-user-schedules">
                        <SelectValue placeholder="Select a user" />
                      </SelectTrigger>
                      <SelectContent>
                        {users?.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(hasRole('admin') || hasRole('billing-admin')) && (
                      <Dialog open={newScheduleOpen} onOpenChange={setNewScheduleOpen}>
                        <DialogTrigger asChild>
                          <Button data-testid="button-new-schedule" disabled={!selectedUserId}>
                            <Plus className="w-4 h-4 mr-2" />
                            New Schedule
                          </Button>
                        </DialogTrigger>
                        <DialogContent data-testid="new-schedule-modal">
                          <DialogHeader>
                            <DialogTitle>Create Rate Schedule</DialogTitle>
                            <DialogDescription>
                              Creating a new rate schedule will automatically close any existing open-ended schedule.
                            </DialogDescription>
                          </DialogHeader>
                          <Form {...scheduleForm}>
                            <form onSubmit={scheduleForm.handleSubmit(onSubmitSchedule)} className="space-y-4">
                              <FormField
                                control={scheduleForm.control}
                                name="userId"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>User</FormLabel>
                                    <Select 
                                      onValueChange={field.onChange} 
                                      defaultValue={selectedUserId}
                                      value={selectedUserId}
                                    >
                                      <FormControl>
                                        <SelectTrigger data-testid="select-schedule-user">
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {users?.map((user) => (
                                          <SelectItem key={user.id} value={user.id}>
                                            {user.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <div className="grid grid-cols-2 gap-4">
                                <FormField
                                  control={scheduleForm.control}
                                  name="effectiveStart"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Effective Start</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="date"
                                          {...field}
                                          data-testid="input-effective-start"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                <FormField
                                  control={scheduleForm.control}
                                  name="effectiveEnd"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Effective End (Optional)</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="date"
                                          {...field}
                                          data-testid="input-effective-end"
                                        />
                                      </FormControl>
                                      <FormDescription>
                                        Leave empty for ongoing schedule
                                      </FormDescription>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <FormField
                                  control={scheduleForm.control}
                                  name="billingRate"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Billing Rate ($/hour)</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          placeholder="250.00"
                                          {...field}
                                          data-testid="input-billing-rate"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                <FormField
                                  control={scheduleForm.control}
                                  name="costRate"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Cost Rate ($/hour)</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          placeholder="150.00"
                                          {...field}
                                          data-testid="input-cost-rate"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>

                              <FormField
                                control={scheduleForm.control}
                                name="notes"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Notes (Optional)</FormLabel>
                                    <FormControl>
                                      <Textarea
                                        placeholder="Any notes about this rate change..."
                                        {...field}
                                        data-testid="textarea-notes"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <div className="flex justify-end space-x-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => setNewScheduleOpen(false)}
                                  data-testid="button-cancel-schedule"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="submit"
                                  disabled={createScheduleMutation.isPending}
                                  data-testid="button-create-schedule"
                                >
                                  {createScheduleMutation.isPending ? "Creating..." : "Create Schedule"}
                                </Button>
                              </div>
                            </form>
                          </Form>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!selectedUserId ? (
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Select a user</h3>
                    <p className="text-muted-foreground">Choose a user to view their rate schedules.</p>
                  </div>
                ) : schedulesLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-20 bg-muted rounded"></div>
                      </div>
                    ))}
                  </div>
                ) : rateSchedules?.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No rate schedules</h3>
                    <p className="text-muted-foreground">Create rate schedules to manage rates over time.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rateSchedules?.map((schedule) => (
                      <div
                        key={schedule.id}
                        className="p-4 border border-border rounded-lg hover:bg-accent/30 transition-colors"
                        data-testid={`schedule-${schedule.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <Badge variant={!schedule.effectiveEnd ? "default" : "secondary"}>
                                {!schedule.effectiveEnd ? "Ongoing" : "Fixed Period"}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {format(new Date(schedule.effectiveStart), 'MMM d, yyyy')}
                                {schedule.effectiveEnd && ` - ${format(new Date(schedule.effectiveEnd), 'MMM d, yyyy')}`}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-sm text-muted-foreground">Billing Rate</div>
                                <div className="font-medium">${parseFloat(schedule.billingRate || '0').toFixed(2)}/hr</div>
                              </div>
                              <div>
                                <div className="text-sm text-muted-foreground">Cost Rate</div>
                                <div className="font-medium">${parseFloat(schedule.costRate || '0').toFixed(2)}/hr</div>
                              </div>
                            </div>
                            {schedule.notes && (
                              <div className="text-sm text-muted-foreground italic">
                                {schedule.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bulk Updates Tab */}
          <TabsContent value="bulk" className="space-y-4">
            <Card data-testid="bulk-updates-management">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <RefreshCcw className="w-5 h-5 mr-2" />
                  Bulk Rate Updates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Bulk updates allow you to modify rates on multiple time entries at once. 
                    Locked or invoiced entries will be skipped by default.
                  </AlertDescription>
                </Alert>

                <Form {...bulkUpdateForm}>
                  <form onSubmit={bulkUpdateForm.handleSubmit(onSubmitBulkUpdate)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={bulkUpdateForm.control}
                        name="userId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Filter by User (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-bulk-user">
                                  <SelectValue placeholder="All users" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="all-users">All users</SelectItem>
                                {users?.map((user) => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={bulkUpdateForm.control}
                        name="projectId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Filter by Project (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-bulk-project">
                                  <SelectValue placeholder="All projects" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="all-projects">All projects</SelectItem>
                                {projects?.map((project) => (
                                  <SelectItem key={project.id} value={project.id}>
                                    {project.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={bulkUpdateForm.control}
                        name="startDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Date (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                {...field}
                                data-testid="input-bulk-start-date"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={bulkUpdateForm.control}
                        name="endDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Date (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                {...field}
                                data-testid="input-bulk-end-date"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={bulkUpdateForm.control}
                      name="mode"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel>Update Mode</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="radio"
                                  value="override"
                                  checked={field.value === 'override'}
                                  onChange={() => field.onChange('override')}
                                  className="text-primary"
                                />
                                <span>Override with new rates</span>
                              </label>
                              <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="radio"
                                  value="recalculate"
                                  checked={field.value === 'recalculate'}
                                  onChange={() => field.onChange('recalculate')}
                                  className="text-primary"
                                />
                                <span>Recalculate from schedules</span>
                              </label>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {bulkUpdateForm.watch('mode') === 'override' && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={bulkUpdateForm.control}
                          name="billingRate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>New Billing Rate ($/hour)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="250.00"
                                  {...field}
                                  data-testid="input-new-billing-rate"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={bulkUpdateForm.control}
                          name="costRate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>New Cost Rate ($/hour)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="150.00"
                                  {...field}
                                  data-testid="input-new-cost-rate"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    <FormField
                      control={bulkUpdateForm.control}
                      name="skipLocked"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Skip Locked Entries</FormLabel>
                            <FormDescription>
                              Ignore time entries that have been invoiced or locked
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-skip-locked"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end space-x-3">
                      <Button
                        type="submit"
                        disabled={bulkUpdateMutation.isPending}
                        data-testid="button-preview-update"
                      >
                        <PlayCircle className="w-4 h-4 mr-2" />
                        {bulkUpdateMutation.isPending ? "Processing..." : "Preview Update"}
                      </Button>
                    </div>
                  </form>
                </Form>

                {previewData && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-lg">Preview Results</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <p className="text-sm">
                          This update will affect approximately <strong>{previewData.preview?.estimatedUpdates || 0}</strong> time entries.
                        </p>
                        <div className="flex justify-end space-x-3 mt-4">
                          <Button
                            variant="outline"
                            onClick={() => setPreviewData(null)}
                            data-testid="button-cancel-update"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleApplyBulkUpdate}
                            disabled={bulkUpdateMutation.isPending}
                            data-testid="button-apply-update"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Apply Update
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}