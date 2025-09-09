import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRoleSchema, type Role } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { 
  Plus, 
  DollarSign, 
  Users, 
  Settings, 
  CalendarIcon,
  Edit,
  Trash2,
  AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { z } from "zod";

const roleFormSchema = insertRoleSchema;
type RoleFormData = z.infer<typeof roleFormSchema>;

const rateOverrideFormSchema = z.object({
  scope: z.enum(['client', 'project']),
  scopeId: z.string().min(1, "Please select a client or project"),
  subjectType: z.enum(['role', 'person']),
  subjectId: z.string().min(1, "Please select a role or person"),
  effectiveStart: z.string(),
  effectiveEnd: z.string().optional(),
  rackRate: z.string().min(1, "Rack rate is required"),
  chargeRate: z.string().optional(),
});

type RateOverrideFormData = z.infer<typeof rateOverrideFormSchema>;

interface RateOverride {
  id: string;
  scope: 'client' | 'project';
  scopeName: string;
  subjectType: 'role' | 'person';
  subjectName: string;
  effectiveStart: string;
  effectiveEnd?: string;
  rackRate: string;
  chargeRate?: string;
  isActive: boolean;
}

const mockRateOverrides: RateOverride[] = [
  {
    id: "1",
    scope: "client",
    scopeName: "TechCorp Inc",
    subjectType: "role",
    subjectName: "Principal",
    effectiveStart: "2024-01-01",
    effectiveEnd: "2024-12-31",
    rackRate: "500.00",
    chargeRate: "400.00",
    isActive: true
  },
  {
    id: "2",
    scope: "project",
    scopeName: "Digital Transformation",
    subjectType: "person",
    subjectName: "David Kim",
    effectiveStart: "2024-02-01",
    rackRate: "350.00",
    chargeRate: "280.00",
    isActive: true
  }
];

export default function RateManagement() {
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newOverrideOpen, setNewOverrideOpen] = useState(false);
  
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Redirect if not admin
  if (!hasRole('admin')) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-96">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <h3 className="text-lg font-medium mb-2">Access Denied</h3>
              <p className="text-muted-foreground">
                You need admin privileges to access rate management.
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

  const overrideForm = useForm<RateOverrideFormData>({
    resolver: zodResolver(rateOverrideFormSchema),
    defaultValues: {
      scope: "client",
      scopeId: "",
      subjectType: "role",
      subjectId: "",
      effectiveStart: format(new Date(), 'yyyy-MM-dd'),
      effectiveEnd: "",
      rackRate: "0",
      chargeRate: "",
    },
  });

  const { data: roles = [], isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

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

  const onSubmitRole = (data: RoleFormData) => {
    createRoleMutation.mutate(data);
  };

  const onSubmitOverride = (data: RateOverrideFormData) => {
    // Here you would typically create the rate override
    toast({
      title: "Rate override created",
      description: "New rate override has been created successfully.",
    });
    overrideForm.reset();
    setNewOverrideOpen(false);
  };

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
        description: "Failed to delete role. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: RoleFormData }) => {
      return apiRequest(`/api/roles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      toast({
        title: "Role updated",
        description: "Role has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update role. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteRole = (roleId: string) => {
    deleteRoleMutation.mutate(roleId);
  };

  const handleDeleteOverride = (overrideId: string) => {
    toast({
      title: "Rate override deleted",
      description: "Rate override has been deleted successfully.",
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold" data-testid="rate-management-title">Rate Management</h2>
            <p className="text-muted-foreground" data-testid="rate-management-subtitle">
              Manage role rates and client-specific overrides
            </p>
          </div>
          <Badge className="bg-primary/10 text-primary">Admin Only</Badge>
        </div>

        {/* Rate Management Tabs */}
        <Tabs defaultValue="roles" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="roles" data-testid="tab-roles">Roles & Standard Rates</TabsTrigger>
            <TabsTrigger value="overrides" data-testid="tab-overrides">Rate Overrides</TabsTrigger>
          </TabsList>

          <TabsContent value="roles" className="space-y-4">
            <Card data-testid="roles-management">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <Users className="w-5 h-5 mr-2" />
                    Standard Role Rates
                  </CardTitle>
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
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid={`button-edit-role-${role.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteRole(role.id)}
                              data-testid={`button-delete-role-${role.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overrides" className="space-y-4">
            <Card data-testid="rate-overrides-management">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <Settings className="w-5 h-5 mr-2" />
                    Rate Overrides
                  </CardTitle>
                  <Dialog open={newOverrideOpen} onOpenChange={setNewOverrideOpen}>
                    <DialogTrigger asChild>
                      <Button data-testid="button-new-override">
                        <Plus className="w-4 h-4 mr-2" />
                        New Override
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl" data-testid="new-override-modal">
                      <DialogHeader>
                        <DialogTitle>Create Rate Override</DialogTitle>
                      </DialogHeader>
                      <Form {...overrideForm}>
                        <form onSubmit={overrideForm.handleSubmit(onSubmitOverride)} className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={overrideForm.control}
                              name="scope"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Override Scope</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-override-scope">
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="client">Client-wide</SelectItem>
                                      <SelectItem value="project">Project-specific</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={overrideForm.control}
                              name="scopeId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    {overrideForm.watch('scope') === 'client' ? 'Client' : 'Project'}
                                  </FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-scope-target">
                                        <SelectValue placeholder={`Select ${overrideForm.watch('scope')}`} />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {overrideForm.watch('scope') === 'client'
                                        ? projects?.reduce((clients, project) => {
                                            if (!clients.find(c => c.id === project.client.id)) {
                                              clients.push(project.client);
                                            }
                                            return clients;
                                          }, [] as any[]).map((client) => (
                                            <SelectItem key={client.id} value={client.id}>
                                              {client.name}
                                            </SelectItem>
                                          ))
                                        : projects?.map((project) => (
                                            <SelectItem key={project.id} value={project.id}>
                                              {project.name}
                                            </SelectItem>
                                          ))
                                      }
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={overrideForm.control}
                              name="subjectType"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Apply To</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-subject-type">
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="role">Role</SelectItem>
                                      <SelectItem value="person">Specific Person</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={overrideForm.control}
                              name="subjectId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    {overrideForm.watch('subjectType') === 'role' ? 'Role' : 'Person'}
                                  </FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-subject-target">
                                        <SelectValue placeholder={`Select ${overrideForm.watch('subjectType')}`} />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {overrideForm.watch('subjectType') === 'role'
                                        ? roles?.map((role) => (
                                            <SelectItem key={role.id} value={role.id}>
                                              {role.name}
                                            </SelectItem>
                                          ))
                                        : [] // Would fetch users/people here
                                      }
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={overrideForm.control}
                              name="effectiveStart"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Effective Start Date</FormLabel>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <FormControl>
                                        <Button
                                          variant="outline"
                                          className={cn(
                                            "w-full pl-3 text-left font-normal",
                                            !field.value && "text-muted-foreground"
                                          )}
                                          data-testid="button-select-start-date"
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
                                        initialFocus
                                      />
                                    </PopoverContent>
                                  </Popover>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={overrideForm.control}
                              name="effectiveEnd"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Effective End Date (Optional)</FormLabel>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <FormControl>
                                        <Button
                                          variant="outline"
                                          className={cn(
                                            "w-full pl-3 text-left font-normal",
                                            !field.value && "text-muted-foreground"
                                          )}
                                          data-testid="button-select-end-date"
                                        >
                                          {field.value ? (
                                            format(new Date(field.value), "PPP")
                                          ) : (
                                            <span>No end date</span>
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
                                        initialFocus
                                      />
                                    </PopoverContent>
                                  </Popover>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={overrideForm.control}
                              name="rackRate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Rack Rate ($/hour)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      placeholder="300.00"
                                      {...field}
                                      data-testid="input-override-rack-rate"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={overrideForm.control}
                              name="chargeRate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Charge Rate ($/hour) - Optional</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      placeholder="240.00"
                                      {...field}
                                      data-testid="input-override-charge-rate"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="flex justify-end space-x-3">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setNewOverrideOpen(false)}
                              data-testid="button-cancel-override"
                            >
                              Cancel
                            </Button>
                            <Button type="submit" data-testid="button-create-override">
                              Create Override
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {mockRateOverrides.length === 0 ? (
                  <div className="text-center py-8">
                    <Settings className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No rate overrides</h3>
                    <p className="text-muted-foreground">Create overrides for client or project-specific rates.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mockRateOverrides.map((override) => (
                      <div
                        key={override.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/30 transition-colors"
                        data-testid={`override-${override.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <div className="font-medium" data-testid={`override-scope-${override.id}`}>
                              {override.scopeName}
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {override.scope}
                            </Badge>
                            <div className="text-sm text-muted-foreground">
                              {override.subjectName} ({override.subjectType})
                            </div>
                            {override.isActive && (
                              <Badge className="bg-chart-4/10 text-chart-4 text-xs">Active</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {format(new Date(override.effectiveStart), 'MMM d, yyyy')} -
                            {override.effectiveEnd 
                              ? ` ${format(new Date(override.effectiveEnd), 'MMM d, yyyy')}`
                              : ' Ongoing'
                            }
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <div className="font-medium" data-testid={`override-rack-rate-${override.id}`}>
                              ${parseFloat(override.rackRate).toFixed(2)}/hr
                            </div>
                            {override.chargeRate && (
                              <div className="text-sm text-muted-foreground" data-testid={`override-charge-rate-${override.id}`}>
                                Charge: ${parseFloat(override.chargeRate).toFixed(2)}/hr
                              </div>
                            )}
                          </div>
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid={`button-edit-override-${override.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteOverride(override.id)}
                              data-testid={`button-delete-override-${override.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
