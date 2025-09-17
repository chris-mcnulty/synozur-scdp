import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Save, Settings, DollarSign, Info, Building, Image, Mail, Phone, Globe, FileText } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

// Types
interface SystemSetting {
  id: string;
  settingKey: string;
  settingValue: string;
  description: string | null;
  settingType: string;
  createdAt: string;
  updatedAt: string;
}

// Form schemas
const rateSettingsSchema = z.object({
  defaultBillingRate: z.string().min(1, "Billing rate is required").refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0;
  }, "Billing rate must be a valid number 0 or greater"),
  defaultCostRate: z.string().min(1, "Cost rate is required").refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0;
  }, "Cost rate must be a valid number 0 or greater"),
});

const companySettingsSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companyLogoUrl: z.string().url().optional().or(z.literal("")),
  companyAddress: z.string().optional(),
  companyPhone: z.string().optional(),
  companyEmail: z.string().email("Invalid email format").optional().or(z.literal("")),
  companyWebsite: z.string().url("Invalid website URL").optional().or(z.literal("")),
  paymentTerms: z.string().optional(),
});

type RateSettingsData = z.infer<typeof rateSettingsSchema>;
type CompanySettingsData = z.infer<typeof companySettingsSchema>;

export default function SystemSettings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("company");

  // Fetch system settings
  const { data: settings = [], isLoading } = useQuery<SystemSetting[]>({
    queryKey: ["/api/settings"],
  });

  // Get current rate settings
  const defaultBillingRate = settings.find(s => s.settingKey === 'DEFAULT_BILLING_RATE')?.settingValue || '0';
  const defaultCostRate = settings.find(s => s.settingKey === 'DEFAULT_COST_RATE')?.settingValue || '0';

  // Get current company settings
  const settingsMap = Object.fromEntries(settings.map(s => [s.settingKey, s.settingValue]));

  // Form setup
  const rateForm = useForm<RateSettingsData>({
    resolver: zodResolver(rateSettingsSchema),
    defaultValues: {
      defaultBillingRate: defaultBillingRate,
      defaultCostRate: defaultCostRate,
    },
    values: {
      defaultBillingRate: defaultBillingRate,
      defaultCostRate: defaultCostRate,
    },
  });

  const companyForm = useForm<CompanySettingsData>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: {
      companyName: "",
      companyLogoUrl: "",
      companyAddress: "",
      companyPhone: "",
      companyEmail: "",
      companyWebsite: "",
      paymentTerms: "",
    },
    values: {
      companyName: settingsMap.COMPANY_NAME || "",
      companyLogoUrl: settingsMap.COMPANY_LOGO_URL || "",
      companyAddress: settingsMap.COMPANY_ADDRESS || "",
      companyPhone: settingsMap.COMPANY_PHONE || "",
      companyEmail: settingsMap.COMPANY_EMAIL || "",
      companyWebsite: settingsMap.COMPANY_WEBSITE || "",
      paymentTerms: settingsMap.PAYMENT_TERMS || "Payment due within 30 days",
    },
  });

  // Mutations
  const updateRatesMutation = useMutation({
    mutationFn: async (data: RateSettingsData) => {
      // Update both rate settings
      await Promise.all([
        apiRequest("/api/settings", {
          method: "POST",
          body: JSON.stringify({
            settingKey: "DEFAULT_BILLING_RATE",
            settingValue: data.defaultBillingRate,
            settingType: "number",
            description: "System-wide default billing rate used as final fallback when no other rates are available"
          }),
        }),
        apiRequest("/api/settings", {
          method: "POST",
          body: JSON.stringify({
            settingKey: "DEFAULT_COST_RATE",
            settingValue: data.defaultCostRate,
            settingType: "number",
            description: "System-wide default cost rate used as final fallback when no other rates are available"
          }),
        })
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings updated",
        description: "System rate settings have been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update system settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: CompanySettingsData) => {
      // Save each company setting
      const settingsToSave = [
        { key: 'COMPANY_NAME', value: data.companyName, description: 'Company name for invoices and branding' },
        { key: 'COMPANY_LOGO_URL', value: data.companyLogoUrl || '', description: 'URL to company logo image for invoices' },
        { key: 'COMPANY_ADDRESS', value: data.companyAddress || '', description: 'Company address for invoices' },
        { key: 'COMPANY_PHONE', value: data.companyPhone || '', description: 'Company phone number for invoices' },
        { key: 'COMPANY_EMAIL', value: data.companyEmail || '', description: 'Company email address for invoices' },
        { key: 'COMPANY_WEBSITE', value: data.companyWebsite || '', description: 'Company website URL for invoices' },
        { key: 'PAYMENT_TERMS', value: data.paymentTerms || 'Payment due within 30 days', description: 'Payment terms displayed on invoices' },
      ];

      await Promise.all(
        settingsToSave.map(setting => 
          apiRequest("/api/settings", {
            method: "POST",
            body: JSON.stringify({
              settingKey: setting.key,
              settingValue: setting.value,
              settingType: "string",
              description: setting.description
            }),
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Company settings saved",
        description: "Company information has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to save company settings",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleRateSubmit = (data: RateSettingsData) => {
    updateRatesMutation.mutate(data);
  };

  const handleCompanySubmit = (data: CompanySettingsData) => {
    updateCompanyMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading system settings...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
            <p className="text-muted-foreground">
              Configure system-wide defaults and settings for your organization
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            <Settings className="w-3 h-3 mr-1" />
            Admin Only
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="company" className="flex items-center space-x-2">
              <Building className="w-4 h-4" />
              <span>Company Information</span>
            </TabsTrigger>
            <TabsTrigger value="rates" className="flex items-center space-x-2">
              <DollarSign className="w-4 h-4" />
              <span>Default Rates</span>
            </TabsTrigger>
            <TabsTrigger value="general" className="flex items-center space-x-2">
              <Settings className="w-4 h-4" />
              <span>All Settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="company" className="space-y-6">
            <Form {...companyForm}>
              <form onSubmit={companyForm.handleSubmit(handleCompanySubmit)} className="space-y-6">
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building className="h-5 w-5" />
                      Basic Information
                    </CardTitle>
                    <CardDescription>
                      Your company's basic information that appears on invoices
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={companyForm.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name*</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Your Company Name" 
                              data-testid="input-company-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={companyForm.control}
                      name="companyLogoUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Image className="h-4 w-4" />
                            Logo URL (optional)
                          </FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="https://example.com/logo.png" 
                              data-testid="input-company-logo"
                            />
                          </FormControl>
                          <FormDescription>
                            Enter a URL to your logo image. For best results, use a PNG with transparent background.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={companyForm.control}
                      name="companyAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address (optional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              placeholder="123 Main Street&#10;Suite 100&#10;City, ST 12345" 
                              className="min-h-[80px]"
                              data-testid="textarea-company-address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Contact Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Contact Information</CardTitle>
                    <CardDescription>
                      Contact details that appear on your invoices
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={companyForm.control}
                      name="companyPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Phone Number (optional)
                          </FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="(555) 123-4567" 
                              data-testid="input-company-phone"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={companyForm.control}
                      name="companyEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Email Address (optional)
                          </FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="email"
                              placeholder="contact@yourcompany.com" 
                              data-testid="input-company-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={companyForm.control}
                      name="companyWebsite"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            Website (optional)
                          </FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="https://www.yourcompany.com" 
                              data-testid="input-company-website"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Invoice Settings */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Invoice Settings
                    </CardTitle>
                    <CardDescription>
                      Configure how your invoices are formatted
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={companyForm.control}
                      name="paymentTerms"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment Terms</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Payment due within 30 days" 
                              data-testid="input-payment-terms"
                            />
                          </FormControl>
                          <FormDescription>
                            Terms displayed at the bottom of invoices (e.g., "Net 30", "Payment due within 15 days")
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Submit Button */}
                <div className="flex justify-end">
                  <Button 
                    type="submit" 
                    disabled={updateCompanyMutation.isPending}
                    data-testid="button-save-company-settings"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {updateCompanyMutation.isPending ? "Saving..." : "Save Company Settings"}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="rates" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <DollarSign className="w-5 h-5" />
                  <span>System Default Rates</span>
                </CardTitle>
                <CardDescription>
                  Configure fallback rates used when no other rate settings are available. 
                  These are applied as the final step in the rate resolution hierarchy.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Rate Hierarchy:</strong> Project Overrides → User Rate Schedules → User Defaults → System Defaults (these settings)
                  </AlertDescription>
                </Alert>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Recommended:</strong> Keep these at $0 to prevent silent billing errors. 
                    This forces explicit rate configuration at the user or project level.
                  </AlertDescription>
                </Alert>

                <Form {...rateForm}>
                  <form onSubmit={rateForm.handleSubmit(handleRateSubmit)} className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <FormField
                        control={rateForm.control}
                        name="defaultBillingRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Default Billing Rate</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  className="pl-8"
                                  {...field}
                                  data-testid="input-default-billing-rate"
                                />
                              </div>
                            </FormControl>
                            <FormDescription>
                              Fallback billing rate when no user or project rates are configured
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={rateForm.control}
                        name="defaultCostRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Default Cost Rate</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  className="pl-8"
                                  {...field}
                                  data-testid="input-default-cost-rate"
                                />
                              </div>
                            </FormControl>
                            <FormDescription>
                              Fallback cost rate when no user or project rates are configured
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button 
                        type="submit" 
                        disabled={updateRatesMutation.isPending}
                        data-testid="button-save-rates"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {updateRatesMutation.isPending ? "Saving..." : "Save Rate Settings"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All System Settings</CardTitle>
                <CardDescription>
                  View all configured system settings and their current values
                </CardDescription>
              </CardHeader>
              <CardContent>
                {settings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No system settings configured yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {settings.map((setting) => (
                      <div key={setting.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-1">
                          <div className="font-medium">{setting.settingKey}</div>
                          {setting.description && (
                            <div className="text-sm text-muted-foreground">{setting.description}</div>
                          )}
                        </div>
                        <div className="text-right space-y-1">
                          <div className="font-mono text-sm">{setting.settingValue}</div>
                          <Badge variant="secondary" className="text-xs">
                            {setting.settingType}
                          </Badge>
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