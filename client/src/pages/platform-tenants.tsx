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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Edit2, Crown, Users, Calendar, Building2, Globe, Cloud, CloudOff, Zap, Info, RefreshCw, Unlink } from "lucide-react";
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
  const [connectingTenant, setConnectingTenant] = useState<Tenant | null>(null);
  const [m365Domain, setM365Domain] = useState("");
  const [m365OwnershipType, setM365OwnershipType] = useState("msp");

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

  const connectM365Mutation = useMutation({
    mutationFn: async ({ tenantId, domain, ownershipType }: { tenantId: string; domain: string; ownershipType: string }) => {
      const result = await apiRequest("/api/m365/connect/start", {
        method: "POST",
        body: JSON.stringify({ domain, ownershipType, constellationTenantId: tenantId }),
      });
      return result;
    },
    onSuccess: (data: any) => {
      if (data?.adminConsentUrl) {
        window.open(data.adminConsentUrl, "_blank", "noopener,noreferrer");
        toast({
          title: "Admin consent window opened",
          description: "Complete the Microsoft admin consent in the new window. The page will refresh when done.",
        });
        setConnectingTenant(null);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start M365 connection", description: error.message, variant: "destructive" });
    },
  });

  const testM365Mutation = useMutation({
    mutationFn: async (tenantId: string) => {
      return apiRequest("/api/m365/connect/test", {
        method: "POST",
        body: JSON.stringify({ constellationTenantId: tenantId }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      if (data?.success) {
        toast({ title: "Connection verified", description: data.message });
      } else {
        toast({ title: "Connection test failed", description: data?.message || "Could not connect", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Connection test failed", description: error.message, variant: "destructive" });
    },
  });

  const disconnectM365Mutation = useMutation({
    mutationFn: async (tenantId: string) => {
      return apiRequest("/api/m365/connect/disconnect", {
        method: "POST",
        body: JSON.stringify({ constellationTenantId: tenantId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      toast({ title: "M365 disconnected" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
    },
  });

  const openConnectDialog = (tenant: Tenant) => {
    setConnectingTenant(tenant);
    setM365Domain(tenant.m365TenantDomain || tenant.allowedDomains?.[0] || "");
    setM365OwnershipType(tenant.m365OwnershipType || "msp");
  };

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
                    <TableHead>M365</TableHead>
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
                      <TableCell>
                        {tenant.m365ConnectionStatus === "connected" ? (
                          <div className="flex items-center gap-1.5">
                            <Cloud className="h-4 w-4 text-green-600" />
                            <div>
                              <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600 border-green-600">Connected</Badge>
                              {tenant.m365TenantDomain && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">{tenant.m365TenantDomain}</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => openConnectDialog(tenant)}>
                            <CloudOff className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                            Connect
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "N/A"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {tenant.m365ConnectionStatus === "connected" && (
                            <Button variant="ghost" size="sm" onClick={() => openConnectDialog(tenant)} title="M365 Connection Details">
                              <Cloud className="h-4 w-4" />
                            </Button>
                          )}
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!connectingTenant} onOpenChange={(open) => !open && setConnectingTenant(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              {connectingTenant?.m365ConnectionStatus === "connected" ? "M365 Connection" : "Connect Microsoft 365 Tenant"}
            </DialogTitle>
            <DialogDescription>
              {connectingTenant?.m365ConnectionStatus === "connected"
                ? `${connectingTenant.name} is connected to Microsoft 365`
                : `Connect ${connectingTenant?.name || "tenant"} to Microsoft 365 via admin consent`}
            </DialogDescription>
          </DialogHeader>

          {connectingTenant?.m365ConnectionStatus === "connected" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Azure Tenant ID</p>
                  <p className="font-mono text-xs">{connectingTenant.azureTenantId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Domain</p>
                  <p>{connectingTenant.m365TenantDomain || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Display Name</p>
                  <p>{connectingTenant.m365DisplayName || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Ownership</p>
                  <p>{connectingTenant.m365OwnershipType === "msp" ? "MSP (Synozur Operates)" : "Customer Operates"}</p>
                </div>
                {connectingTenant.m365ConnectionTestedAt && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Last Verified</p>
                    <p className="text-xs">{new Date(connectingTenant.m365ConnectionTestedAt).toLocaleString()}</p>
                  </div>
                )}
              </div>
              <div className="flex justify-between">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    disconnectM365Mutation.mutate(connectingTenant.id);
                    setConnectingTenant(null);
                  }}
                  disabled={disconnectM365Mutation.isPending}
                >
                  <Unlink className="h-4 w-4 mr-1" />
                  Disconnect
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testM365Mutation.mutate(connectingTenant.id)}
                  disabled={testM365Mutation.isPending}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${testM365Mutation.isPending ? "animate-spin" : ""}`} />
                  {testM365Mutation.isPending ? "Testing..." : "Test Connection"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs space-y-1">
                  <p>A domain admin from the target tenant will authenticate against your Entra ID app and grant admin consent. The required permissions are baked into the app registration.</p>
                  <p className="font-medium">Tip: Use an InPrivate / Incognito browser window to sign in as the remote domain admin, so it does not conflict with your current session.</p>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tenant Domain</label>
                <Input
                  value={m365Domain}
                  onChange={(e) => setM365Domain(e.target.value)}
                  placeholder="e.g. contoso.onmicrosoft.com"
                />
                <p className="text-xs text-muted-foreground">
                  The Microsoft 365 domain for the target tenant
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Ownership Type</label>
                <Select value={m365OwnershipType} onValueChange={setM365OwnershipType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="msp">MSP (Synozur Operates)</SelectItem>
                    <SelectItem value="customer">Customer Operates</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConnectingTenant(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!connectingTenant || !m365Domain.trim()) return;
                    connectM365Mutation.mutate({
                      tenantId: connectingTenant.id,
                      domain: m365Domain.trim(),
                      ownershipType: m365OwnershipType,
                    });
                  }}
                  disabled={connectM365Mutation.isPending || !m365Domain.trim()}
                >
                  <Zap className="h-4 w-4 mr-1" />
                  {connectM365Mutation.isPending ? "Starting..." : "Connect via Admin Consent"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
