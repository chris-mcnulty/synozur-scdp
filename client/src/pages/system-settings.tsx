import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { VocabularyTerms } from "@shared/schema";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Save, Settings, DollarSign, Info, Building, Image, Mail, Phone, Globe, FileText, Languages, Sparkles, BookOpen, Plus, Edit2, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

interface VocabularyCatalogTerm {
  id: string;
  termType: 'epic' | 'stage' | 'workstream' | 'milestone' | 'activity';
  termValue: string;
  description: string | null;
  displayOrder: number;
  createdAt: string;
}

interface OrganizationVocabularySelection {
  id: string;
  epicTermId: string | null;
  stageTermId: string | null;
  workstreamTermId: string | null;
  milestoneTermId: string | null;
  activityTermId: string | null;
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
  mileageRate: z.string().min(1, "Mileage rate is required").refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0;
  }, "Mileage rate must be a valid number 0 or greater"),
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

const vocabularySelectionsSchema = z.object({
  epicTermId: z.string().uuid().nullable(),
  stageTermId: z.string().uuid().nullable(),
  workstreamTermId: z.string().uuid().nullable(),
  milestoneTermId: z.string().uuid().nullable(),
  activityTermId: z.string().uuid().nullable(),
});

type RateSettingsData = z.infer<typeof rateSettingsSchema>;
type CompanySettingsData = z.infer<typeof companySettingsSchema>;
type VocabularySelectionsData = z.infer<typeof vocabularySelectionsSchema>;

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
  const mileageRate = settings.find(s => s.settingKey === 'MILEAGE_RATE')?.settingValue || '0.70';

  // Get current company settings
  const settingsMap = Object.fromEntries(settings.map(s => [s.settingKey, s.settingValue]));

  // Form setup
  const rateForm = useForm<RateSettingsData>({
    resolver: zodResolver(rateSettingsSchema),
    defaultValues: {
      defaultBillingRate: defaultBillingRate,
      defaultCostRate: defaultCostRate,
      mileageRate: mileageRate,
    },
    values: {
      defaultBillingRate: defaultBillingRate,
      defaultCostRate: defaultCostRate,
      mileageRate: mileageRate,
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

  // Fetch vocabulary catalog (all available terms)
  const { data: catalogTerms = [], isLoading: isLoadingCatalog } = useQuery<VocabularyCatalogTerm[]>({
    queryKey: ["/api/vocabulary/catalog"],
  });

  // Fetch organization vocabulary selections
  const { data: orgSelections, isLoading: isLoadingSelections } = useQuery<OrganizationVocabularySelection>({
    queryKey: ["/api/vocabulary/organization/selections"],
  });

  // Organize catalog terms by type
  const epicTerms = catalogTerms.filter(t => t.termType === 'epic').sort((a, b) => a.displayOrder - b.displayOrder);
  const stageTerms = catalogTerms.filter(t => t.termType === 'stage').sort((a, b) => a.displayOrder - b.displayOrder);
  const workstreamTerms = catalogTerms.filter(t => t.termType === 'workstream').sort((a, b) => a.displayOrder - b.displayOrder);
  const milestoneTerms = catalogTerms.filter(t => t.termType === 'milestone').sort((a, b) => a.displayOrder - b.displayOrder);
  const activityTerms = catalogTerms.filter(t => t.termType === 'activity').sort((a, b) => a.displayOrder - b.displayOrder);

  const vocabularyForm = useForm<VocabularySelectionsData>({
    resolver: zodResolver(vocabularySelectionsSchema),
    defaultValues: {
      epicTermId: null,
      stageTermId: null,
      workstreamTermId: null,
      milestoneTermId: null,
      activityTermId: null,
    },
  });

  // Reset vocabulary form when selections are loaded
  useEffect(() => {
    if (orgSelections && !vocabularyForm.formState.isDirty) {
      vocabularyForm.reset({
        epicTermId: orgSelections.epicTermId,
        stageTermId: orgSelections.stageTermId,
        workstreamTermId: orgSelections.workstreamTermId,
        milestoneTermId: orgSelections.milestoneTermId,
        activityTermId: orgSelections.activityTermId,
      });
    }
  }, [orgSelections, vocabularyForm]);

  // Mutations
  const updateRatesMutation = useMutation({
    mutationFn: async (data: RateSettingsData) => {
      // Update all rate settings
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
        }),
        apiRequest("/api/settings", {
          method: "POST",
          body: JSON.stringify({
            settingKey: "MILEAGE_RATE",
            settingValue: data.mileageRate,
            settingType: "number",
            description: "Default reimbursement rate per mile for mileage expenses"
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

  const updateVocabularyMutation = useMutation({
    mutationFn: async (data: VocabularySelectionsData) => {
      await apiRequest("/api/vocabulary/organization/selections", {
        method: "PUT",
        body: JSON.stringify(data),
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/organization/selections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/organization"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/context"] });
      vocabularyForm.reset(data);
      toast({
        title: "Terminology updated",
        description: "Organization terminology defaults have been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update terminology",
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

  const handleVocabularySubmit = (data: VocabularySelectionsData) => {
    updateVocabularyMutation.mutate(data);
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
            <TabsTrigger value="catalog" className="flex items-center space-x-2">
              <BookOpen className="w-4 h-4" />
              <span>Vocabulary Catalog</span>
            </TabsTrigger>
            <TabsTrigger value="vocabulary" className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4" />
              <span>Customize</span>
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
                    <div className="grid grid-cols-3 gap-6">
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

                      <FormField
                        control={rateForm.control}
                        name="mileageRate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mileage Rate</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.70"
                                  className="pl-8"
                                  {...field}
                                  data-testid="input-mileage-rate"
                                />
                              </div>
                            </FormControl>
                            <FormDescription>
                              Reimbursement rate per mile for mileage expenses
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

          <TabsContent value="catalog" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BookOpen className="w-5 h-5" />
                  <span>Vocabulary Catalog Management</span>
                </CardTitle>
                <CardDescription>
                  Manage the master list of terminology options available throughout the system. These terms can be selected at the organization, client, or project level.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Terms marked as <Badge variant="outline" className="ml-1 mr-1">System Default</Badge> cannot be deleted and are used as fallback values.
                  </AlertDescription>
                </Alert>

                {/* Seed Default Terms Button */}
                {catalogTerms.length === 0 && (
                  <Card className="border-2 border-dashed">
                    <CardContent className="pt-6">
                      <div className="text-center space-y-3">
                        <div className="text-muted-foreground">No vocabulary terms found in the catalog</div>
                        <Button
                          onClick={async () => {
                            try {
                              await apiRequest('/api/vocabulary/catalog/seed', {
                                method: 'POST',
                              });
                              queryClient.invalidateQueries({ queryKey: ['/api/vocabulary/catalog'] });
                              toast({
                                title: "Success",
                                description: "Default vocabulary terms have been seeded",
                              });
                            } catch (error) {
                              toast({
                                title: "Error",
                                description: "Failed to seed vocabulary terms",
                                variant: "destructive"
                              });
                            }
                          }}
                          data-testid="button-seed-vocabulary"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Seed Default Vocabulary Terms
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Terms by Category */}
                {catalogTerms.length > 0 && (
                  <div className="space-y-6">
                    {['epic', 'stage', 'activity', 'workstream', 'milestone'].map(termType => {
                      const terms = catalogTerms.filter(t => t.termType === termType);
                      return (
                        <Card key={termType}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-lg capitalize">{termType} Terms</CardTitle>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  // Open add term dialog
                                  const newTerm = prompt(`Enter new ${termType} term:`);
                                  if (newTerm && newTerm.trim()) {
                                    apiRequest('/api/vocabulary/catalog', {
                                      method: 'POST',
                                      body: JSON.stringify({
                                        termType,
                                        termValue: newTerm.trim(),
                                        description: `Custom ${termType} term`,
                                        sortOrder: terms.length * 10
                                      }),
                                    }).then(() => {
                                      queryClient.invalidateQueries({ queryKey: ['/api/vocabulary/catalog'] });
                                      toast({
                                        title: "Success",
                                        description: `Added new ${termType} term: ${newTerm}`,
                                      });
                                    }).catch(() => {
                                      toast({
                                        title: "Error",
                                        description: `Failed to add ${termType} term`,
                                        variant: "destructive"
                                      });
                                    });
                                  }
                                }}
                                data-testid={`button-add-${termType}`}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Add
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {terms.length === 0 ? (
                                <div className="text-sm text-muted-foreground py-3 text-center">
                                  No {termType} terms defined
                                </div>
                              ) : (
                                terms.sort((a, b) => a.displayOrder - b.displayOrder).map((term, index) => (
                                  <div key={term.id} className="flex items-center justify-between p-3 rounded-lg border bg-background">
                                    <div className="flex items-center space-x-3">
                                      <div className="flex flex-col space-y-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 w-6 p-0"
                                          disabled={index === 0}
                                          onClick={() => {
                                            // Move up logic
                                            const prevTerm = terms[index - 1];
                                            if (prevTerm) {
                                              Promise.all([
                                                apiRequest(`/api/vocabulary/catalog/${term.id}`, {
                                                  method: 'PATCH',
                                                  body: JSON.stringify({ sortOrder: prevTerm.displayOrder }),
                                                }),
                                                apiRequest(`/api/vocabulary/catalog/${prevTerm.id}`, {
                                                  method: 'PATCH',
                                                  body: JSON.stringify({ sortOrder: term.displayOrder }),
                                                })
                                              ]).then(() => {
                                                queryClient.invalidateQueries({ queryKey: ['/api/vocabulary/catalog'] });
                                              });
                                            }
                                          }}
                                          data-testid={`button-move-up-${term.id}`}
                                        >
                                          <ArrowUp className="w-3 h-3" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 w-6 p-0"
                                          disabled={index === terms.length - 1}
                                          onClick={() => {
                                            // Move down logic
                                            const nextTerm = terms[index + 1];
                                            if (nextTerm) {
                                              Promise.all([
                                                apiRequest(`/api/vocabulary/catalog/${term.id}`, {
                                                  method: 'PATCH',
                                                  body: JSON.stringify({ sortOrder: nextTerm.displayOrder }),
                                                }),
                                                apiRequest(`/api/vocabulary/catalog/${nextTerm.id}`, {
                                                  method: 'PATCH',
                                                  body: JSON.stringify({ sortOrder: term.displayOrder }),
                                                })
                                              ]).then(() => {
                                                queryClient.invalidateQueries({ queryKey: ['/api/vocabulary/catalog'] });
                                              });
                                            }
                                          }}
                                          data-testid={`button-move-down-${term.id}`}
                                        >
                                          <ArrowDown className="w-3 h-3" />
                                        </Button>
                                      </div>
                                      <div>
                                        <div className="flex items-center space-x-2">
                                          <span className="font-medium">{term.termValue}</span>
                                          {term.isSystemDefault && (
                                            <Badge variant="outline" className="text-xs">System Default</Badge>
                                          )}
                                        </div>
                                        {term.description && (
                                          <div className="text-sm text-muted-foreground">{term.description}</div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          const newValue = prompt(`Edit term value:`, term.termValue);
                                          if (newValue && newValue.trim() && newValue !== term.termValue) {
                                            apiRequest(`/api/vocabulary/catalog/${term.id}`, {
                                              method: 'PATCH',
                                              body: JSON.stringify({ termValue: newValue.trim() }),
                                            }).then(() => {
                                              queryClient.invalidateQueries({ queryKey: ['/api/vocabulary/catalog'] });
                                              toast({
                                                title: "Success",
                                                description: `Updated term to: ${newValue}`,
                                              });
                                            }).catch(() => {
                                              toast({
                                                title: "Error",
                                                description: "Failed to update term",
                                                variant: "destructive"
                                              });
                                            });
                                          }
                                        }}
                                        data-testid={`button-edit-${term.id}`}
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={term.isSystemDefault}
                                        onClick={() => {
                                          if (confirm(`Are you sure you want to delete "${term.termValue}"?`)) {
                                            apiRequest(`/api/vocabulary/catalog/${term.id}`, {
                                              method: 'DELETE',
                                            }).then(() => {
                                              queryClient.invalidateQueries({ queryKey: ['/api/vocabulary/catalog'] });
                                              toast({
                                                title: "Success",
                                                description: `Deleted term: ${term.termValue}`,
                                              });
                                            }).catch((error: any) => {
                                              toast({
                                                title: "Error",
                                                description: error?.message || "Failed to delete term",
                                                variant: "destructive"
                                              });
                                            });
                                          }
                                        }}
                                        data-testid={`button-delete-${term.id}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vocabulary" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Sparkles className="w-5 h-5" />
                  <span>Organization Terminology</span>
                </CardTitle>
                <CardDescription>
                  Select preferred terminology from predefined options. These defaults apply organization-wide and can be overridden at the client or project level. New projects will automatically inherit these terms unless you specify otherwise.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isLoadingCatalog || isLoadingSelections ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-lg">Loading terminology options...</div>
                  </div>
                ) : (
                  <>
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-2">
                          <div><strong>Cascading Priority:</strong> Project Overrides → Client Overrides → Organization Defaults (these settings)</div>
                          <div className="text-sm">
                            These organization-level defaults are automatically applied when you create new projects. You can override them for specific clients or individual projects as needed.
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>

                    <Card className="border-2 border-dashed">
                      <CardHeader>
                        <CardTitle className="text-base">Industry Presets</CardTitle>
                        <CardDescription>
                          Quickly apply common terminology sets for your industry
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const epic = epicTerms.find(t => t.termValue === 'Epic');
                            const stage = stageTerms.find(t => t.termValue === 'Sprint');
                            const workstream = workstreamTerms.find(t => t.termValue === 'Feature');
                            const milestone = milestoneTerms.find(t => t.termValue === 'Milestone');
                            const activity = activityTerms.find(t => t.termValue === 'Task');
                            vocabularyForm.setValue('epicTermId', epic?.id || null);
                            vocabularyForm.setValue('stageTermId', stage?.id || null);
                            vocabularyForm.setValue('workstreamTermId', workstream?.id || null);
                            vocabularyForm.setValue('milestoneTermId', milestone?.id || null);
                            vocabularyForm.setValue('activityTermId', activity?.id || null);
                          }}
                          data-testid="button-preset-software"
                        >
                          Software Development
                          <Badge variant="secondary" className="ml-2 text-xs">Epic / Sprint / Feature / Milestone / Task</Badge>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const epic = epicTerms.find(t => t.termValue === 'Program');
                            const stage = stageTerms.find(t => t.termValue === 'Phase');
                            const workstream = workstreamTerms.find(t => t.termValue === 'Category');
                            const milestone = milestoneTerms.find(t => t.termValue === 'Target');
                            const activity = activityTerms.find(t => t.termValue === 'Deliverable');
                            vocabularyForm.setValue('epicTermId', epic?.id || null);
                            vocabularyForm.setValue('stageTermId', stage?.id || null);
                            vocabularyForm.setValue('workstreamTermId', workstream?.id || null);
                            vocabularyForm.setValue('milestoneTermId', milestone?.id || null);
                            vocabularyForm.setValue('activityTermId', activity?.id || null);
                          }}
                          data-testid="button-preset-consulting"
                        >
                          Consulting
                          <Badge variant="secondary" className="ml-2 text-xs">Program / Phase / Category / Target / Deliverable</Badge>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const epic = epicTerms.find(t => t.termValue === 'Phase');
                            const stage = stageTerms.find(t => t.termValue === 'Phase');
                            const workstream = workstreamTerms.find(t => t.termValue === 'Trade');
                            const milestone = milestoneTerms.find(t => t.termValue === 'Checkpoint');
                            const activity = activityTerms.find(t => t.termValue === 'Gate');
                            vocabularyForm.setValue('epicTermId', epic?.id || null);
                            vocabularyForm.setValue('stageTermId', stage?.id || null);
                            vocabularyForm.setValue('workstreamTermId', workstream?.id || null);
                            vocabularyForm.setValue('milestoneTermId', milestone?.id || null);
                            vocabularyForm.setValue('activityTermId', activity?.id || null);
                          }}
                          data-testid="button-preset-construction"
                        >
                          Construction
                          <Badge variant="secondary" className="ml-2 text-xs">Phase / Phase / Trade / Checkpoint / Gate</Badge>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const epic = epicTerms.find(t => t.termValue === 'Epic');
                            const stage = stageTerms.find(t => t.termValue === 'Stage');
                            const workstream = workstreamTerms.find(t => t.termValue === 'Workstream');
                            const milestone = milestoneTerms.find(t => t.termValue === 'Milestone');
                            const activity = activityTerms.find(t => t.termValue === 'Activity');
                            vocabularyForm.setValue('epicTermId', epic?.id || null);
                            vocabularyForm.setValue('stageTermId', stage?.id || null);
                            vocabularyForm.setValue('workstreamTermId', workstream?.id || null);
                            vocabularyForm.setValue('milestoneTermId', milestone?.id || null);
                            vocabularyForm.setValue('activityTermId', activity?.id || null);
                          }}
                          data-testid="button-preset-default"
                        >
                          Default
                          <Badge variant="secondary" className="ml-2 text-xs">Epic / Stage / Workstream / Milestone / Activity</Badge>
                        </Button>
                      </CardContent>
                    </Card>

                    <Form {...vocabularyForm}>
                      <form onSubmit={vocabularyForm.handleSubmit(handleVocabularySubmit)} className="space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                          <FormField
                            control={vocabularyForm.control}
                            name="epicTermId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Epic Term</FormLabel>
                                <Select 
                                  onValueChange={(value) => field.onChange(value || null)} 
                                  value={field.value || undefined}
                                  data-testid="select-vocab-epic"
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select epic term" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {epicTerms.map(term => (
                                      <SelectItem key={term.id} value={term.id}>
                                        {term.termValue}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  Top-level project grouping
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={vocabularyForm.control}
                            name="stageTermId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Stage Term</FormLabel>
                                <Select 
                                  onValueChange={(value) => field.onChange(value || null)} 
                                  value={field.value || undefined}
                                  data-testid="select-vocab-stage"
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select stage term" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {stageTerms.map(term => (
                                      <SelectItem key={term.id} value={term.id}>
                                        {term.termValue}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  Mid-level project phase
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={vocabularyForm.control}
                            name="activityTermId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Activity Term</FormLabel>
                                <Select 
                                  onValueChange={(value) => field.onChange(value || null)} 
                                  value={field.value || undefined}
                                  data-testid="select-vocab-activity"
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select activity term" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {activityTerms.map(term => (
                                      <SelectItem key={term.id} value={term.id}>
                                        {term.termValue}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  Individual task or milestone level
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={vocabularyForm.control}
                            name="workstreamTermId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Workstream Term</FormLabel>
                                <Select 
                                  onValueChange={(value) => field.onChange(value || null)} 
                                  value={field.value || undefined}
                                  data-testid="select-vocab-workstream"
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select workstream term" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {workstreamTerms.map(term => (
                                      <SelectItem key={term.id} value={term.id}>
                                        {term.termValue}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  Parallel work track (optional)
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={vocabularyForm.control}
                            name="milestoneTermId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Milestone Term</FormLabel>
                                <Select 
                                  onValueChange={(value) => field.onChange(value || null)} 
                                  value={field.value || undefined}
                                  data-testid="select-vocab-milestone"
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select milestone term" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {milestoneTerms.map(term => (
                                      <SelectItem key={term.id} value={term.id}>
                                        {term.termValue}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  Checkpoint or target (optional)
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="flex justify-end">
                          <Button 
                            type="submit" 
                            disabled={updateVocabularyMutation.isPending}
                            data-testid="button-save-vocabulary"
                          >
                            <Save className="w-4 h-4 mr-2" />
                            {updateVocabularyMutation.isPending ? "Saving..." : "Save Terminology Settings"}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </>
                )}
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