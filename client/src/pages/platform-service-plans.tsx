import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit2, Package, Users, Clock } from "lucide-react";
import type { ServicePlan } from "@shared/schema";

const servicePlanFormSchema = z.object({
  internalName: z.string().min(1, "Internal name is required").regex(/^[a-z0-9_]+$/, "Must be lowercase letters, numbers, and underscores"),
  displayName: z.string().min(1, "Display name is required"),
  description: z.string().optional(),
  planType: z.string().min(1, "Plan type is required"),
  maxUsers: z.string().optional(),
  maxProjects: z.string().optional(),
  trialDurationDays: z.string().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

type ServicePlanFormData = z.infer<typeof servicePlanFormSchema>;

export default function PlatformServicePlans() {
  const { isPlatformAdmin } = useAuth();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ServicePlan | null>(null);

  const { data: servicePlans, isLoading } = useQuery<ServicePlan[]>({
    queryKey: ["/api/platform/service-plans"],
  });

  const form = useForm<ServicePlanFormData>({
    resolver: zodResolver(servicePlanFormSchema),
    defaultValues: {
      internalName: "",
      displayName: "",
      description: "",
      planType: "team",
      maxUsers: "",
      maxProjects: "",
      trialDurationDays: "",
      isDefault: false,
      isActive: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ServicePlanFormData) => {
      const payload = {
        ...data,
        maxUsers: data.maxUsers ? parseInt(data.maxUsers) : null,
        maxProjects: data.maxProjects ? parseInt(data.maxProjects) : null,
        trialDurationDays: data.trialDurationDays ? parseInt(data.trialDurationDays) : null,
      };
      return apiRequest("/api/platform/service-plans", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/service-plans"] });
      setIsCreateOpen(false);
      form.reset();
      toast({ title: "Service plan created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create service plan", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ServicePlanFormData & { id: string }) => {
      const { id, ...rest } = data;
      const payload = {
        ...rest,
        maxUsers: rest.maxUsers ? parseInt(rest.maxUsers) : null,
        maxProjects: rest.maxProjects ? parseInt(rest.maxProjects) : null,
        trialDurationDays: rest.trialDurationDays ? parseInt(rest.trialDurationDays) : null,
      };
      return apiRequest(`/api/platform/service-plans/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/service-plans"] });
      setEditingPlan(null);
      form.reset();
      toast({ title: "Service plan updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update service plan", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: ServicePlanFormData) => {
    if (editingPlan) {
      updateMutation.mutate({ ...data, id: editingPlan.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditDialog = (plan: ServicePlan) => {
    setEditingPlan(plan);
    form.reset({
      internalName: plan.internalName,
      displayName: plan.displayName,
      description: plan.description || "",
      planType: plan.planType,
      maxUsers: plan.maxUsers?.toString() || "",
      maxProjects: plan.maxProjects?.toString() || "",
      trialDurationDays: plan.trialDurationDays?.toString() || "",
      isDefault: plan.isDefault || false,
      isActive: plan.isActive ?? true,
    });
  };

  if (!isPlatformAdmin) {
    return (
      <Layout>
        <div className="p-6">
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">You do not have permission to access this page.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Package className="h-8 w-8" />
              Service Plans
            </h1>
            <p className="text-muted-foreground mt-1">Manage subscription tiers and licensing</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { form.reset(); setEditingPlan(null); }}>
                <Plus className="h-4 w-4 mr-2" />
                New Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Service Plan</DialogTitle>
                <DialogDescription>Define a new subscription tier</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="internalName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Internal Name</FormLabel>
                        <FormControl>
                          <Input placeholder="enterprise_monthly" {...field} />
                        </FormControl>
                        <FormDescription>Lowercase, no spaces (for code)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enterprise Monthly" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="planType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plan Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="trial">Trial</SelectItem>
                            <SelectItem value="team">Team</SelectItem>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
                            <SelectItem value="unlimited">Unlimited</SelectItem>
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
                          <Textarea placeholder="Full-featured plan for large teams..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="maxUsers"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Users</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="Unlimited" {...field} />
                          </FormControl>
                          <FormDescription>Leave blank for unlimited</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maxProjects"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Projects</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="Unlimited" {...field} />
                          </FormControl>
                          <FormDescription>Leave blank for unlimited</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="trialDurationDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trial Duration (Days)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="e.g., 14" {...field} />
                        </FormControl>
                        <FormDescription>For trial plans only</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="isDefault"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Default Plan</FormLabel>
                          <FormDescription>Assign to new tenants automatically</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Active</FormLabel>
                          <FormDescription>Available for new subscriptions</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? "Creating..." : "Create Plan"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Service Plans</CardTitle>
            <CardDescription>
              {servicePlans?.length || 0} plan{(servicePlans?.length || 0) !== 1 ? "s" : ""} configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading service plans...</div>
            ) : !servicePlans?.length ? (
              <div className="text-center py-8 text-muted-foreground">No service plans found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Internal Name</TableHead>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Limits</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servicePlans.map(plan => (
                    <TableRow key={plan.id}>
                      <TableCell>
                        <code className="text-sm bg-muted px-1 py-0.5 rounded">{plan.internalName}</code>
                      </TableCell>
                      <TableCell className="font-medium">
                        {plan.displayName}
                        {plan.isDefault && (
                          <Badge variant="secondary" className="ml-2">Default</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{plan.planType}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {plan.maxUsers ?? "∞"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {plan.maxProjects ?? "∞"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={plan.isActive ? "default" : "secondary"}>
                          {plan.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Dialog open={editingPlan?.id === plan.id} onOpenChange={(open) => !open && setEditingPlan(null)}>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(plan)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Edit Service Plan</DialogTitle>
                              <DialogDescription>Update plan settings</DialogDescription>
                            </DialogHeader>
                            <Form {...form}>
                              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField
                                  control={form.control}
                                  name="internalName"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Internal Name</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="displayName"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Display Name</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="planType"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Plan Type</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          <SelectItem value="trial">Trial</SelectItem>
                                          <SelectItem value="team">Team</SelectItem>
                                          <SelectItem value="enterprise">Enterprise</SelectItem>
                                          <SelectItem value="unlimited">Unlimited</SelectItem>
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
                                        <Textarea {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <div className="grid grid-cols-2 gap-4">
                                  <FormField
                                    control={form.control}
                                    name="maxUsers"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Max Users</FormLabel>
                                        <FormControl>
                                          <Input type="number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="maxProjects"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Max Projects</FormLabel>
                                        <FormControl>
                                          <Input type="number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                                <FormField
                                  control={form.control}
                                  name="trialDurationDays"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Trial Duration (Days)</FormLabel>
                                      <FormControl>
                                        <Input type="number" {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="isDefault"
                                  render={({ field }) => (
                                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                                      <FormLabel>Default Plan</FormLabel>
                                      <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="isActive"
                                  render={({ field }) => (
                                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                                      <FormLabel>Active</FormLabel>
                                      <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <div className="flex justify-end gap-2">
                                  <Button type="button" variant="outline" onClick={() => setEditingPlan(null)}>
                                    Cancel
                                  </Button>
                                  <Button type="submit" disabled={updateMutation.isPending}>
                                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                                  </Button>
                                </div>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
