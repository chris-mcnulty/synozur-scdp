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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Save, Settings, DollarSign, Info } from "lucide-react";
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
  defaultBillingRate: z.string().min(0, "Billing rate must be 0 or greater"),
  defaultCostRate: z.string().min(0, "Cost rate must be 0 or greater"),
});

type RateSettingsData = z.infer<typeof rateSettingsSchema>;

export default function SystemSettings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("rates");

  // Fetch system settings
  const { data: settings = [], isLoading } = useQuery<SystemSetting[]>({
    queryKey: ["/api/settings"],
  });

  // Get current rate settings
  const defaultBillingRate = settings.find(s => s.settingKey === 'DEFAULT_BILLING_RATE')?.settingValue || '0';
  const defaultCostRate = settings.find(s => s.settingKey === 'DEFAULT_COST_RATE')?.settingValue || '0';

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

  // Mutations
  const updateRatesMutation = useMutation({
    mutationFn: async (data: RateSettingsData) => {
      // Update both rate settings
      await Promise.all([
        apiRequest("/api/settings/DEFAULT_BILLING_RATE", {
          method: "POST",
          body: JSON.stringify({
            settingKey: "DEFAULT_BILLING_RATE",
            settingValue: data.defaultBillingRate,
            settingType: "number",
            description: "System-wide default billing rate used as final fallback when no other rates are available"
          }),
        }),
        apiRequest("/api/settings/DEFAULT_COST_RATE", {
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

  const handleRateSubmit = (data: RateSettingsData) => {
    updateRatesMutation.mutate(data);
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
            <TabsTrigger value="rates" className="flex items-center space-x-2">
              <DollarSign className="w-4 h-4" />
              <span>Default Rates</span>
            </TabsTrigger>
            <TabsTrigger value="general" className="flex items-center space-x-2">
              <Settings className="w-4 h-4" />
              <span>General</span>
            </TabsTrigger>
          </TabsList>

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