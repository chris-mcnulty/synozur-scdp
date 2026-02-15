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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit2, Crown, Users, Calendar, Building2, Globe } from "lucide-react";
import type { Tenant, ServicePlan } from "@shared/schema";

const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "America/Toronto", label: "Eastern Canada" },
  { value: "America/Vancouver", label: "Pacific Canada" },
  { value: "Europe/London", label: "UK (GMT/BST)" },
  { value: "Europe/Berlin", label: "Central Europe (CET)" },
  { value: "UTC", label: "UTC" },
];

const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

const tenantFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  allowedDomains: z.string().optional(),
  azureTenantId: z.string().optional(),
  servicePlanId: z.string().optional(),
  enforceSso: z.boolean().default(false),
  allowLocalAuth: z.boolean().default(true),
  defaultTimezone: z.string().default(browserTimezone),
});

type TenantFormData = z.infer<typeof tenantFormSchema>;

export default function PlatformTenants() {
  const { isPlatformAdmin } = useAuth();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  const { data: tenants, isLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/platform/tenants"],
  });

  const { data: servicePlans } = useQuery<ServicePlan[]>({
    queryKey: ["/api/platform/service-plans"],
  });

  const form = useForm<TenantFormData>({
    resolver: zodResolver(tenantFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      allowedDomains: "",
      azureTenantId: "",
      servicePlanId: "",
      enforceSso: false,
      allowLocalAuth: true,
      defaultTimezone: browserTimezone,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TenantFormData) => {
      const payload = {
        ...data,
        allowedDomains: data.allowedDomains ? data.allowedDomains.split(",").map(d => d.trim()).filter(Boolean) : [],
        servicePlanId: data.servicePlanId || null,
        azureTenantId: data.azureTenantId || null,
      };
      return apiRequest("/api/platform/tenants", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      setIsCreateOpen(false);
      form.reset();
      toast({ title: "Tenant created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create tenant", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: TenantFormData & { id: string }) => {
      const { id, ...rest } = data;
      const payload = {
        ...rest,
        allowedDomains: rest.allowedDomains ? rest.allowedDomains.split(",").map(d => d.trim()).filter(Boolean) : [],
        servicePlanId: rest.servicePlanId || null,
        azureTenantId: rest.azureTenantId || null,
      };
      return apiRequest(`/api/platform/tenants/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      setEditingTenant(null);
      form.reset();
      toast({ title: "Tenant updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update tenant", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: TenantFormData) => {
    if (editingTenant) {
      updateMutation.mutate({ ...data, id: editingTenant.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditDialog = (tenant: Tenant) => {
    setEditingTenant(tenant);
    form.reset({
      name: tenant.name,
      slug: tenant.slug || "",
      allowedDomains: tenant.allowedDomains?.join(", ") || "",
      azureTenantId: tenant.azureTenantId || "",
      servicePlanId: tenant.servicePlanId || "",
      enforceSso: tenant.enforceSso || false,
      allowLocalAuth: tenant.allowLocalAuth ?? true,
      defaultTimezone: tenant.defaultTimezone || browserTimezone,
    });
  };

  const getServicePlanName = (planId: string | null) => {
    if (!planId || !servicePlans) return "None";
    const plan = servicePlans.find(p => p.id === planId);
    return plan?.displayName || plan?.internalName || "Unknown";
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
              <Crown className="h-8 w-8" />
              Tenant Management
            </h1>
            <p className="text-muted-foreground mt-1">Manage organizations using the Constellation platform</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { form.reset(); setEditingTenant(null); }}>
                <Plus className="h-4 w-4 mr-2" />
                New Tenant
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Tenant</DialogTitle>
                <DialogDescription>Add a new organization to the platform</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Corporation" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slug</FormLabel>
                        <FormControl>
                          <Input placeholder="acme" {...field} />
                        </FormControl>
                        <FormDescription>URL-friendly identifier (lowercase, no spaces)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="allowedDomains"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Allowed Email Domains</FormLabel>
                        <FormControl>
                          <Input placeholder="acme.com, acme.org" {...field} />
                        </FormControl>
                        <FormDescription>Comma-separated list of domains</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="azureTenantId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Azure Tenant ID</FormLabel>
                        <FormControl>
                          <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" {...field} />
                        </FormControl>
                        <FormDescription>For SSO mapping</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="servicePlanId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Plan</FormLabel>
                        <Select 
                          onValueChange={(val) => field.onChange(val === "_none" ? "" : val)} 
                          value={field.value || "_none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a plan" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="_none">None</SelectItem>
                            {servicePlans?.map(plan => (
                              <SelectItem key={plan.id} value={plan.id}>
                                {plan.displayName || plan.internalName}
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
                    name="defaultTimezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Timezone</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || browserTimezone}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select timezone" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {US_TIMEZONES.map(tz => (
                              <SelectItem key={tz.value} value={tz.value}>
                                {tz.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Used for invoice dates and reports</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="enforceSso"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Enforce SSO</FormLabel>
                          <FormDescription>Require Azure AD login</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="allowLocalAuth"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Allow Local Auth</FormLabel>
                          <FormDescription>Allow email/password login</FormDescription>
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
                      {createMutation.isPending ? "Creating..." : "Create Tenant"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              All Tenants
            </CardTitle>
            <CardDescription>
              {tenants?.length || 0} organization{(tenants?.length || 0) !== 1 ? "s" : ""} registered
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading tenants...</div>
            ) : !tenants?.length ? (
              <div className="text-center py-8 text-muted-foreground">No tenants found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Domains</TableHead>
                    <TableHead>Service Plan</TableHead>
                    <TableHead>SSO</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map(tenant => (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">{tenant.name}</TableCell>
                      <TableCell>
                        <code className="text-sm bg-muted px-1 py-0.5 rounded">{tenant.slug}</code>
                      </TableCell>
                      <TableCell>
                        {tenant.allowedDomains?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {tenant.allowedDomains.slice(0, 2).map(domain => (
                              <Badge key={domain} variant="secondary" className="text-xs">
                                {domain}
                              </Badge>
                            ))}
                            {tenant.allowedDomains.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{tenant.allowedDomains.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tenant.servicePlanId ? "default" : "outline"}>
                          {getServicePlanName(tenant.servicePlanId)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {tenant.enforceSso ? (
                          <Badge variant="default">Required</Badge>
                        ) : tenant.azureTenantId ? (
                          <Badge variant="secondary">Available</Badge>
                        ) : (
                          <Badge variant="outline">None</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "N/A"}
                      </TableCell>
                      <TableCell>
                        <Dialog open={editingTenant?.id === tenant.id} onOpenChange={(open) => !open && setEditingTenant(null)}>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(tenant)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Edit Tenant</DialogTitle>
                              <DialogDescription>Update organization settings</DialogDescription>
                            </DialogHeader>
                            <Form {...form}>
                              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField
                                  control={form.control}
                                  name="name"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Organization Name</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="slug"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Slug</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="allowedDomains"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Allowed Email Domains</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="azureTenantId"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Azure Tenant ID</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="servicePlanId"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Service Plan</FormLabel>
                                      <Select 
                                        onValueChange={(val) => field.onChange(val === "_none" ? "" : val)} 
                                        value={field.value || "_none"}
                                      >
                                        <FormControl>
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select a plan" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          <SelectItem value="_none">None</SelectItem>
                                          {servicePlans?.map(plan => (
                                            <SelectItem key={plan.id} value={plan.id}>
                                              {plan.displayName || plan.internalName}
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
                                  name="defaultTimezone"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Timezone</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value || browserTimezone}>
                                        <FormControl>
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select timezone" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          {US_TIMEZONES.map(tz => (
                                            <SelectItem key={tz.value} value={tz.value}>
                                              {tz.label}
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
                                  name="enforceSso"
                                  render={({ field }) => (
                                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                                      <div className="space-y-0.5">
                                        <FormLabel>Enforce SSO</FormLabel>
                                      </div>
                                      <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="allowLocalAuth"
                                  render={({ field }) => (
                                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                                      <div className="space-y-0.5">
                                        <FormLabel>Allow Local Auth</FormLabel>
                                      </div>
                                      <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <div className="flex justify-end gap-2">
                                  <Button type="button" variant="outline" onClick={() => setEditingTenant(null)}>
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
