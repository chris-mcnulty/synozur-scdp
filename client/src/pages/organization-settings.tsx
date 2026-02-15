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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Save, Image, Mail, Phone, Globe, FileText, Settings, Palette, Link2, LifeBuoy, Upload, DollarSign } from "lucide-react";
import { AdminSupportTab } from "@/components/admin/AdminSupportTab";

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
  isActive: boolean;
}

interface TenantsResponse {
  activeTenantId: string;
  tenants: TenantInfo[];
}

interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  paymentTerms: string | null;
  color: string | null;
  faviconUrl: string | null;
  showConstellationFooter: boolean;
  showChangelogOnLogin: boolean;
  emailHeaderUrl: string | null;
  defaultBillingRate: string | null;
  defaultCostRate: string | null;
  mileageRate: string | null;
  defaultTaxRate: string | null;
  invoiceDefaultDiscountType: string | null;
  invoiceDefaultDiscountValue: string | null;
}

const brandingSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companyLogoUrl: z.string().optional().default(""),
  companyAddress: z.string().optional().default(""),
  companyPhone: z.string().optional().default(""),
  companyEmail: z.string().optional().default(""),
  companyWebsite: z.string().optional().default(""),
  paymentTerms: z.string().optional().default("Payment due within 30 days"),
  showConstellationFooter: z.boolean().default(true),
  showChangelogOnLogin: z.boolean().default(true),
  emailHeaderUrl: z.string().optional().default(""),
});

type BrandingFormData = z.infer<typeof brandingSchema>;

const financialSchema = z.object({
  defaultBillingRate: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0;
  }, "Must be a valid number 0 or greater"),
  defaultCostRate: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0;
  }, "Must be a valid number 0 or greater"),
  mileageRate: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0;
  }, "Must be a valid number 0 or greater"),
  defaultTaxRate: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0 && num <= 100;
  }, "Must be between 0 and 100"),
  invoiceDefaultDiscountType: z.string(),
  invoiceDefaultDiscountValue: z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0;
  }, "Must be a valid number 0 or greater"),
});

type FinancialFormData = z.infer<typeof financialSchema>;

function EmailHeaderUpload({ onUploadSuccess }: { onUploadSuccess: (url: string) => void }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid file", description: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 5MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/tenant/email-header/upload', {
        method: 'POST',
        headers: { 'x-session-id': localStorage.getItem('sessionId') || '' },
        body: formData,
      });
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      onUploadSuccess(data.url);
      toast({ title: "Uploaded", description: "Email header image uploaded" });
    } catch {
      toast({ title: "Upload failed", description: "Could not upload image", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
      <label className="cursor-pointer">
        <Upload className="h-4 w-4 mr-2" />
        {uploading ? "Uploading..." : "Upload"}
        <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </label>
    </Button>
  );
}

export default function OrganizationSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("branding");

  const { data: tenantsData } = useQuery<TenantsResponse>({
    queryKey: ["/api/auth/tenants"],
  });

  const activeTenant = tenantsData?.tenants?.find(t => t.isActive);

  const { data: tenantSettings, isLoading: isLoadingSettings } = useQuery<TenantSettings>({
    queryKey: ["/api/tenant/settings"],
  });

  const brandingForm = useForm<BrandingFormData>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      companyName: "",
      companyLogoUrl: "",
      companyAddress: "",
      companyPhone: "",
      companyEmail: "",
      companyWebsite: "",
      paymentTerms: "Payment due within 30 days",
      showConstellationFooter: true,
      showChangelogOnLogin: true,
      emailHeaderUrl: "",
    },
    values: {
      companyName: tenantSettings?.name || "",
      companyLogoUrl: tenantSettings?.logoUrl || "",
      companyAddress: tenantSettings?.companyAddress || "",
      companyPhone: tenantSettings?.companyPhone || "",
      companyEmail: tenantSettings?.companyEmail || "",
      companyWebsite: tenantSettings?.companyWebsite || "",
      paymentTerms: tenantSettings?.paymentTerms || "Payment due within 30 days",
      showConstellationFooter: tenantSettings?.showConstellationFooter ?? true,
      showChangelogOnLogin: tenantSettings?.showChangelogOnLogin ?? true,
      emailHeaderUrl: tenantSettings?.emailHeaderUrl || "",
    },
  });

  const updateBrandingMutation = useMutation({
    mutationFn: async (data: BrandingFormData) => {
      await apiRequest("/api/tenant/settings", {
        method: "PATCH",
        body: JSON.stringify({
          name: data.companyName,
          logoUrl: data.companyLogoUrl || null,
          companyAddress: data.companyAddress || null,
          companyPhone: data.companyPhone || null,
          companyEmail: data.companyEmail || null,
          companyWebsite: data.companyWebsite || null,
          paymentTerms: data.paymentTerms || null,
          showConstellationFooter: data.showConstellationFooter,
          showChangelogOnLogin: data.showChangelogOnLogin,
          emailHeaderUrl: data.emailHeaderUrl || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/tenants"] });
      toast({ title: "Settings saved", description: "Organization branding has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save branding settings.", variant: "destructive" });
    },
  });

  const handleBrandingSubmit = (data: BrandingFormData) => {
    updateBrandingMutation.mutate(data);
  };

  const financialForm = useForm<FinancialFormData>({
    resolver: zodResolver(financialSchema),
    defaultValues: {
      defaultBillingRate: "0",
      defaultCostRate: "0",
      mileageRate: "0.70",
      defaultTaxRate: "0",
      invoiceDefaultDiscountType: "percent",
      invoiceDefaultDiscountValue: "0",
    },
    values: {
      defaultBillingRate: tenantSettings?.defaultBillingRate || "0",
      defaultCostRate: tenantSettings?.defaultCostRate || "0",
      mileageRate: tenantSettings?.mileageRate || "0.70",
      defaultTaxRate: tenantSettings?.defaultTaxRate || "0",
      invoiceDefaultDiscountType: tenantSettings?.invoiceDefaultDiscountType || "percent",
      invoiceDefaultDiscountValue: tenantSettings?.invoiceDefaultDiscountValue || "0",
    },
  });

  const updateFinancialMutation = useMutation({
    mutationFn: async (data: FinancialFormData) => {
      await apiRequest("/api/tenant/settings", {
        method: "PATCH",
        body: JSON.stringify({
          defaultBillingRate: data.defaultBillingRate,
          defaultCostRate: data.defaultCostRate,
          mileageRate: data.mileageRate,
          defaultTaxRate: data.defaultTaxRate,
          invoiceDefaultDiscountType: data.invoiceDefaultDiscountType,
          invoiceDefaultDiscountValue: data.invoiceDefaultDiscountValue,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/settings"] });
      toast({ title: "Settings saved", description: "Financial defaults have been updated for this organization." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save financial settings.", variant: "destructive" });
    },
  });

  const handleFinancialSubmit = (data: FinancialFormData) => {
    updateFinancialMutation.mutate(data);
  };

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Organization Settings</h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-muted-foreground">
                  Configure settings for
                </p>
                {activeTenant ? (
                  <Badge variant="secondary" className="font-medium">
                    {activeTenant.name}
                  </Badge>
                ) : (
                  <Badge variant="outline">Loading...</Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {isLoadingSettings ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList>
              <TabsTrigger value="branding" className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                <span>Branding</span>
              </TabsTrigger>
              <TabsTrigger value="financial" className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                <span>Financial</span>
              </TabsTrigger>
              <TabsTrigger value="integrations" className="flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                <span>Integrations</span>
              </TabsTrigger>
              <TabsTrigger value="support" className="flex items-center gap-2">
                <LifeBuoy className="w-4 h-4" />
                <span>Support</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="branding" className="space-y-6">
              <Form {...brandingForm}>
                <form onSubmit={brandingForm.handleSubmit(handleBrandingSubmit)} className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Company Identity
                      </CardTitle>
                      <CardDescription>
                        Your organization's name and logo that appear throughout the platform and on invoices
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={brandingForm.control}
                        name="companyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organization Name*</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Your Organization Name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={brandingForm.control}
                        name="companyLogoUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <Image className="h-4 w-4" />
                              Logo URL
                            </FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="https://example.com/logo.png" />
                            </FormControl>
                            <FormDescription>
                              Enter a URL to your logo image. For best results, use a PNG with transparent background.
                            </FormDescription>
                            {field.value && (
                              <div className="mt-2 p-3 border rounded-lg bg-muted/30">
                                <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                                <img
                                  src={field.value}
                                  alt="Logo preview"
                                  className="max-h-16 max-w-[200px] object-contain"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={brandingForm.control}
                        name="emailHeaderUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <Mail className="h-4 w-4" />
                              Email Header Image
                            </FormLabel>
                            <div className="flex gap-2">
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="https://example.com/email-header.png"
                                  className="flex-1"
                                />
                              </FormControl>
                              <EmailHeaderUpload onUploadSuccess={(url) => field.onChange(url)} />
                            </div>
                            <FormDescription>
                              Upload an image or enter a URL. Recommended size: 600px wide, PNG or JPG format.
                            </FormDescription>
                            {field.value && (
                              <div className="mt-2 p-3 border rounded-lg bg-muted/30">
                                <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                                <img
                                  src={field.value}
                                  alt="Email header preview"
                                  className="max-h-20 max-w-full object-contain"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Contact Information</CardTitle>
                      <CardDescription>
                        Contact details that appear on invoices and communications
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={brandingForm.control}
                        name="companyAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                placeholder={"123 Main Street\nSuite 100\nCity, ST 12345"}
                                className="min-h-[80px]"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={brandingForm.control}
                          name="companyPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2">
                                <Phone className="h-4 w-4" />
                                Phone
                              </FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="(555) 123-4567" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={brandingForm.control}
                          name="companyEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2">
                                <Mail className="h-4 w-4" />
                                Email
                              </FormLabel>
                              <FormControl>
                                <Input {...field} type="email" placeholder="contact@yourcompany.com" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={brandingForm.control}
                        name="companyWebsite"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <Globe className="h-4 w-4" />
                              Website
                            </FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="https://www.yourcompany.com" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Invoice & Platform Settings
                      </CardTitle>
                      <CardDescription>
                        Configure invoice formatting and platform behavior for this organization
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={brandingForm.control}
                        name="paymentTerms"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Payment Terms</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Payment due within 30 days" />
                            </FormControl>
                            <FormDescription>
                              Terms displayed at the bottom of invoices (e.g., "Net 30", "Payment due within 15 days")
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={brandingForm.control}
                        name="showConstellationFooter"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">Constellation Footer</FormLabel>
                              <FormDescription>
                                Show "Generated by Constellation (SCDP)" with links at the bottom of invoices
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={brandingForm.control}
                        name="showChangelogOnLogin"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">What's New Modal</FormLabel>
                              <FormDescription>
                                Show a "What's New" popup to users when they log in after a platform update
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={updateBrandingMutation.isPending}>
                      <Save className="w-4 h-4 mr-2" />
                      {updateBrandingMutation.isPending ? "Saving..." : "Save Branding Settings"}
                    </Button>
                  </div>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="financial" className="space-y-6">
              <Form {...financialForm}>
                <form onSubmit={financialForm.handleSubmit(handleFinancialSubmit)} className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5" />
                        Default Rates
                      </CardTitle>
                      <CardDescription>
                        Default billing and cost rates for this organization. These are used when a user or project doesn't have specific rates set.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={financialForm.control}
                          name="defaultBillingRate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Default Billing Rate ($/hr)</FormLabel>
                              <FormControl>
                                <Input {...field} type="number" step="0.01" min="0" placeholder="0.00" />
                              </FormControl>
                              <FormDescription>
                                Fallback billing rate when no user or project rate is defined
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={financialForm.control}
                          name="defaultCostRate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Default Cost Rate ($/hr)</FormLabel>
                              <FormControl>
                                <Input {...field} type="number" step="0.01" min="0" placeholder="0.00" />
                              </FormControl>
                              <FormDescription>
                                Fallback internal cost rate for margin calculations
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={financialForm.control}
                        name="mileageRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mileage Reimbursement Rate ($/mile)</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" step="0.01" min="0" placeholder="0.70" />
                            </FormControl>
                            <FormDescription>
                              Rate per mile for mileage expense reimbursement (e.g., IRS standard rate)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Invoice Defaults
                      </CardTitle>
                      <CardDescription>
                        Default values applied when creating new invoice batches for this organization
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={financialForm.control}
                        name="defaultTaxRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Default Tax Rate (%)</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" step="0.01" min="0" max="100" placeholder="0.00" />
                            </FormControl>
                            <FormDescription>
                              Default tax percentage applied to new invoice batches
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={financialForm.control}
                          name="invoiceDefaultDiscountType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Default Discount Type</FormLabel>
                              <FormControl>
                                <select
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                  value={field.value}
                                  onChange={field.onChange}
                                >
                                  <option value="percent">Percentage (%)</option>
                                  <option value="amount">Fixed Amount ($)</option>
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={financialForm.control}
                          name="invoiceDefaultDiscountValue"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Default Discount Value</FormLabel>
                              <FormControl>
                                <Input {...field} type="number" step="0.01" min="0" placeholder="0.00" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={updateFinancialMutation.isPending}>
                      <Save className="w-4 h-4 mr-2" />
                      {updateFinancialMutation.isPending ? "Saving..." : "Save Financial Settings"}
                    </Button>
                  </div>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="integrations" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link2 className="h-5 w-5" />
                    Organization Integrations
                  </CardTitle>
                  <CardDescription>
                    Manage third-party service connections for this organization. Integration settings are specific to each organization and will change when you switch organizations.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="rounded-lg border p-4 bg-muted/30">
                      <div className="flex items-start gap-3">
                        <Settings className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="font-medium">Coming Soon</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Additional integration settings (SharePoint, Email, Microsoft Planner for projects, etc.) will be consolidated here. 
                            For now, use the Support tab for support ticket Planner integration, and System Settings for other configurations.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="support" className="space-y-6">
              <AdminSupportTab />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Layout>
  );
}
