import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Layout } from "@/components/layout/layout";
import { Building, Image, Mail, Phone, Globe, FileText } from "lucide-react";

const companySettingsSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companyLogoUrl: z.string().url().optional().or(z.literal("")),
  companyAddress: z.string().optional(),
  companyPhone: z.string().optional(),
  companyEmail: z.string().email("Invalid email format").optional().or(z.literal("")),
  companyWebsite: z.string().url("Invalid website URL").optional().or(z.literal("")),
  paymentTerms: z.string().optional(),
});

type CompanySettingsFormData = z.infer<typeof companySettingsSchema>;

interface SystemSetting {
  id: string;
  settingKey: string;
  settingValue: string;
  description: string | null;
  settingType: string;
}

export default function CompanySettings() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Fetch current company settings
  const { data: settings = [], isLoading: settingsLoading } = useQuery<SystemSetting[]>({
    queryKey: ['/api/system-settings']
  });

  const form = useForm<CompanySettingsFormData>({
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
  });

  // Set form values when settings are loaded
  if (settings.length > 0 && form.getValues().companyName === "") {
    const settingsMap = Object.fromEntries(
      settings.map(s => [s.settingKey, s.settingValue])
    );

    form.reset({
      companyName: settingsMap.COMPANY_NAME || "Your Company Name",
      companyLogoUrl: settingsMap.COMPANY_LOGO_URL || "",
      companyAddress: settingsMap.COMPANY_ADDRESS || "",
      companyPhone: settingsMap.COMPANY_PHONE || "",
      companyEmail: settingsMap.COMPANY_EMAIL || "",
      companyWebsite: settingsMap.COMPANY_WEBSITE || "",
      paymentTerms: settingsMap.PAYMENT_TERMS || "Payment due within 30 days",
    });
  }

  const saveSettingMutation = useMutation({
    mutationFn: async ({ key, value, description }: { key: string; value: string; description: string }) => {
      return apiRequest('/api/system-settings', {
        method: 'POST',
        body: JSON.stringify({
          settingKey: key,
          settingValue: value,
          description,
          settingType: 'string'
        })
      });
    },
  });

  const handleSubmit = async (data: CompanySettingsFormData) => {
    setIsLoading(true);
    
    try {
      // Save each setting
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
        settingsToSave.map(setting => saveSettingMutation.mutateAsync(setting))
      );

      queryClient.invalidateQueries({ queryKey: ['/api/system-settings'] });
      
      toast({
        title: "Settings saved",
        description: "Company settings have been updated successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to save settings",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (settingsLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold" data-testid="company-settings-title">Company Settings</h2>
            <p className="text-muted-foreground">Configure your company branding for invoices and reports</p>
          </div>
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-muted rounded-lg"></div>
            <div className="h-32 bg-muted rounded-lg"></div>
            <div className="h-32 bg-muted rounded-lg"></div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold" data-testid="company-settings-title">Company Settings</h2>
          <p className="text-muted-foreground">Configure your company branding for invoices and reports</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
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
                  control={form.control}
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
                  control={form.control}
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
                      <p className="text-sm text-muted-foreground">
                        Enter a URL to your logo image. For best results, use a PNG with transparent background.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
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
                  control={form.control}
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
                  control={form.control}
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
                  control={form.control}
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
                  control={form.control}
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
                      <p className="text-sm text-muted-foreground">
                        Terms displayed at the bottom of invoices (e.g., "Net 30", "Payment due within 15 days")
                      </p>
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
                disabled={isLoading}
                data-testid="button-save-settings"
              >
                {isLoading ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Layout>
  );
}