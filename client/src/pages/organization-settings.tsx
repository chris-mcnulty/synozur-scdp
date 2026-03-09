import { useState, useEffect } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Save, Image, Mail, Phone, Globe, FileText, Settings, Palette, Link2, LifeBuoy, Upload, DollarSign, ExternalLink, CheckCircle, Info, ArrowRight, Languages, Sparkles, Hash, RotateCcw, HardDrive, Shield, Loader2, RefreshCw, AlertTriangle, Database } from "lucide-react";
import { MicrosoftPlannerIcon } from "@/components/icons/microsoft-icons";
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
  speContainerIdDev: string | null;
  speContainerIdProd: string | null;
  speStorageEnabled: boolean;
  speMigrationStatus: string | null;
  speMigrationStartedAt: string | null;
  adminConsentGranted: boolean;
  azureTenantId: string | null;
  serverEnvironment: 'production' | 'development';
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
  primaryColor: z.string().optional().default("#810FFB"),
  secondaryColor: z.string().optional().default("#E60CB3"),
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

interface VocabularyCatalogTerm {
  id: string;
  termType: string;
  termValue: string;
  description: string | null;
  isSystemDefault: boolean;
  displayOrder: number;
}

interface OrganizationVocabularySelection {
  id: string;
  tenantId: string | null;
  epicTermId: string | null;
  stageTermId: string | null;
  workstreamTermId: string | null;
  milestoneTermId: string | null;
  activityTermId: string | null;
}

const vocabularySelectionsSchema = z.object({
  epicTermId: z.string().nullable().optional(),
  stageTermId: z.string().nullable().optional(),
  workstreamTermId: z.string().nullable().optional(),
  milestoneTermId: z.string().nullable().optional(),
  activityTermId: z.string().nullable().optional(),
});

type VocabularySelectionsData = z.infer<typeof vocabularySelectionsSchema>;

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

function HubSpotIntegrationCard() {
  const { toast } = useToast();

  interface CrmStatus {
    provider: string;
    tenantConnected: boolean;
    platformConfigured: boolean;
    tenantEnabled: boolean;
    dealProbabilityThreshold: number;
    dealStageMappings: Record<string, string> | null;
    selectedPipelineId: string | null;
    revenueSyncEnabled: boolean;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
    connectionId: string | null;
  }

  interface HubSpotPipeline {
    id: string;
    label: string;
    stages: { id: string; label: string; probability: number; displayOrder: number }[];
  }

  const { data: crmStatus, isLoading } = useQuery<CrmStatus>({
    queryKey: ["/api/crm/status"],
  });

  const updateConnectionMutation = useMutation({
    mutationFn: (data: { isEnabled?: boolean; dealProbabilityThreshold?: number; dealStageMappings?: Record<string, string>; selectedPipelineId?: string }) =>
      apiRequest("/api/crm/connection", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/status"] });
      toast({ title: "HubSpot settings updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const [threshold, setThreshold] = useState<string>("40");
  const [selectedPipeline, setSelectedPipeline] = useState<string>("");
  const [stageMappings, setStageMappings] = useState<Record<string, string>>({});
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: pipelines } = useQuery<HubSpotPipeline[]>({
    queryKey: ["/api/crm/pipelines"],
    enabled: !!crmStatus?.tenantEnabled && !!crmStatus?.tenantConnected,
  });

  const disconnectMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/crm/hubspot/oauth/disconnect", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/status"] });
      toast({ title: "HubSpot disconnected" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to disconnect", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (crmStatus) {
      setThreshold(String(crmStatus.dealProbabilityThreshold));
      if (crmStatus.selectedPipelineId) {
        setSelectedPipeline(crmStatus.selectedPipelineId);
      }
      if (crmStatus.dealStageMappings) {
        setStageMappings(crmStatus.dealStageMappings);
      }
    }
  }, [crmStatus]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const data = await apiRequest("/api/crm/hubspot/oauth/start");
      if (data.authorizeUrl) {
        window.open(data.authorizeUrl, "_blank", "width=600,height=700");
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/crm/status"] });
        }, 5000);
        const pollInterval = setInterval(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/crm/status"] });
        }, 3000);
        setTimeout(() => clearInterval(pollInterval), 120000);
      }
    } catch (error: any) {
      toast({ title: "Failed to start connection", description: error.message, variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="border-2">
        <CardContent className="py-6">
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-5 w-5" />
            HubSpot CRM
          </CardTitle>
          {crmStatus?.tenantConnected ? (
            <Badge variant="outline" className="text-green-600 border-green-600">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          ) : crmStatus?.platformConfigured ? (
            <Badge variant="outline" className="text-orange-600 border-orange-600">
              Not Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Not Available
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Pull deals from HubSpot that meet your probability threshold and create estimates from them. Deal amounts sync back to HubSpot when estimates are updated.
        </p>

        {!crmStatus?.platformConfigured && (
          <div className="rounded-lg border p-3 bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
              <p className="text-sm text-orange-800 dark:text-orange-300">
                HubSpot integration is not yet available. Please contact your platform administrator.
              </p>
            </div>
          </div>
        )}

        {crmStatus?.platformConfigured && !crmStatus?.tenantConnected && (
          <div className="border-t pt-3">
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              {isConnecting ? "Opening HubSpot..." : "Connect to HubSpot"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              You'll be redirected to HubSpot to authorize access to your account
            </p>
          </div>
        )}

        {crmStatus?.tenantConnected && (
          <>
            <div className="flex items-center justify-between py-2 border-t pt-3">
              <div>
                <p className="text-sm font-medium">Enable HubSpot Sync</p>
                <p className="text-xs text-muted-foreground">Show HubSpot deals in Constellation and allow estimate creation</p>
              </div>
              <Switch
                checked={crmStatus?.tenantEnabled ?? false}
                onCheckedChange={(checked) => {
                  updateConnectionMutation.mutate({ isEnabled: checked });
                }}
              />
            </div>

            {crmStatus?.tenantEnabled && (
              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-sm font-medium">Deal Probability Threshold</label>
                    <p className="text-xs text-muted-foreground">Only show deals at or above this probability percentage</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      className="w-20 text-center font-mono"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const num = parseInt(threshold, 10);
                        if (isNaN(num) || num < 0 || num > 100) {
                          toast({ title: "Invalid threshold", description: "Enter a number between 0 and 100", variant: "destructive" });
                          return;
                        }
                        updateConnectionMutation.mutate({ dealProbabilityThreshold: num });
                      }}
                      disabled={updateConnectionMutation.isPending}
                    >
                      <Save className="h-3 w-3 mr-1" />
                      Save
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-3 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Deal Stage Mapping</p>
                    <p className="text-xs text-muted-foreground">Map estimate statuses to HubSpot deal stages so they auto-update when an estimate changes status</p>
                  </div>

                  {pipelines && pipelines.length > 0 ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Pipeline</label>
                        <Select
                          value={selectedPipeline}
                          onValueChange={(val) => {
                            setSelectedPipeline(val);
                            setStageMappings({});
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a pipeline" />
                          </SelectTrigger>
                          <SelectContent>
                            {pipelines.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedPipeline && (() => {
                        const activePipeline = pipelines.find(p => p.id === selectedPipeline);
                        if (!activePipeline) return null;
                        const estimateStatuses = [
                          { key: "draft", label: "Draft" },
                          { key: "final", label: "Final" },
                          { key: "sent", label: "Sent" },
                          { key: "approved", label: "Approved" },
                          { key: "rejected", label: "Rejected" },
                        ];
                        return (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                              {estimateStatuses.map(es => (
                                <div key={es.key} className="flex items-center gap-2">
                                  <span className="text-xs w-16 shrink-0 font-medium">{es.label}</span>
                                  <Select
                                    value={stageMappings[es.key] || "__none__"}
                                    onValueChange={(val) => {
                                      setStageMappings(prev => {
                                        const next = { ...prev };
                                        if (val === "__none__") {
                                          delete next[es.key];
                                        } else {
                                          next[es.key] = val;
                                        }
                                        return next;
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs flex-1">
                                      <SelectValue placeholder="Not mapped" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">Not mapped</SelectItem>
                                      {activePipeline.stages.map(s => (
                                        <SelectItem key={s.id} value={s.id}>
                                          {s.label} ({Math.round(s.probability * 100)}%)
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ))}
                            </div>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                updateConnectionMutation.mutate({
                                  dealStageMappings: stageMappings,
                                  selectedPipelineId: selectedPipeline,
                                });
                              }}
                              disabled={updateConnectionMutation.isPending}
                            >
                              <Save className="h-3 w-3 mr-1" />
                              Save Stage Mappings
                            </Button>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Loading pipelines...</p>
                  )}
                </div>

                <div className="border-t pt-3">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium">Revenue & Activity Sync</p>
                      <p className="text-xs text-muted-foreground">Sync invoice totals, payment status, and status report activity to linked HubSpot deals</p>
                    </div>
                    <Switch
                      checked={crmStatus?.revenueSyncEnabled !== false}
                      onCheckedChange={(checked) => {
                        apiRequest("/api/crm/connection", {
                          method: "PUT",
                          body: JSON.stringify({ revenueSyncEnabled: checked }),
                        }).then(() => {
                          queryClient.invalidateQueries({ queryKey: ["/api/crm/status"] });
                          toast({ title: checked ? "Revenue sync enabled" : "Revenue sync disabled" });
                        }).catch((err: Error) => {
                          toast({ title: "Failed to update", description: err.message, variant: "destructive" });
                        });
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" asChild>
                    <a href="/crm/deals">
                      <ArrowRight className="h-4 w-4 mr-1" />
                      View CRM Deals
                    </a>
                  </Button>
                </div>

                {crmStatus?.lastSyncAt && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {new Date(crmStatus.lastSyncAt).toLocaleString()}
                    {crmStatus.lastSyncStatus === "error" && crmStatus.lastSyncError && (
                      <span className="text-red-500 ml-2">Error: {crmStatus.lastSyncError}</span>
                    )}
                  </p>
                )}
              </div>
            )}

            <div className="border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect HubSpot"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentStorageCard({ tenantSettings }: { tenantSettings: TenantSettings }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [devContainerId, setDevContainerId] = useState(tenantSettings.speContainerIdDev || "");
  const [prodContainerId, setProdContainerId] = useState(tenantSettings.speContainerIdProd || "");
  const [verifyResult, setVerifyResult] = useState<{ status: string; error?: string } | null>(null);

  useEffect(() => {
    setDevContainerId(tenantSettings.speContainerIdDev || "");
    setProdContainerId(tenantSettings.speContainerIdProd || "");
  }, [tenantSettings.speContainerIdDev, tenantSettings.speContainerIdProd]);

  const isPlatformAdmin = user?.platformRole === 'global_admin' || user?.platformRole === 'constellation_admin';
  const isProduction = tenantSettings.serverEnvironment === 'production';
  const currentEnvLabel = isProduction ? 'production' : 'development';
  const currentContainerId = isProduction ? tenantSettings.speContainerIdProd : tenantSettings.speContainerIdDev;

  const createContainerMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/tenants/${tenantSettings.id}/spe/create-container`, {
        method: "POST",
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/settings"] });
      toast({ title: "Container created", description: `SPE container created for ${currentEnvLabel}: ${data.containerId}` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create container", description: error.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/tenants/${tenantSettings.id}/spe/verify`, {
        method: "POST",
      }),
    onSuccess: (data: any) => {
      setVerifyResult(data);
      if (data.status === "healthy") {
        toast({ title: "Container verified", description: "SPE container is accessible and healthy." });
      } else {
        toast({ title: "Verification failed", description: data.error || "Container is not accessible.", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      setVerifyResult({ status: "error", error: error.message });
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: (config: { speContainerIdDev?: string; speContainerIdProd?: string; speStorageEnabled?: boolean }) =>
      apiRequest(`/api/tenants/${tenantSettings.id}/spe/config`, {
        method: "PATCH",
        body: JSON.stringify(config),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/settings"] });
      toast({ title: "Configuration updated", description: "SPE storage configuration has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update configuration", description: error.message, variant: "destructive" });
    },
  });

  const migrateMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/tenants/${tenantSettings.id}/migrate-storage`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/settings"] });
      toast({ title: "Migration started", description: "File migration to SPE has been initiated." });
    },
    onError: (error: Error) => {
      toast({ title: "Migration failed", description: error.message, variant: "destructive" });
    },
  });

  const [includeUntagged, setIncludeUntagged] = useState(false);
  const [inventoryData, setInventoryData] = useState<{
    totalFiles: number;
    totalSize: number;
    untaggedFiles: number;
    byDocumentType: Record<string, number>;
    files: Array<{ fileName: string; documentType: string; size: number; path: string; tagged: boolean }>;
  } | null>(null);

  const inventoryMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/tenants/${tenantSettings.id}/storage-inventory${includeUntagged ? '?includeUntagged=true' : ''}`),
    onSuccess: (data: any) => {
      setInventoryData(data);
      toast({ title: "Inventory complete", description: `Found ${data.totalFiles} file(s) in existing storage.` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to scan storage", description: error.message, variant: "destructive" });
    },
  });

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [deleteFromAzure, setDeleteFromAzure] = useState(false);
  const [resetResult, setResetResult] = useState<{ success: boolean; message: string; deleted?: boolean } | null>(null);

  const resetContainerMutation = useMutation({
    mutationFn: (opts: { deleteFromAzure: boolean }) =>
      apiRequest(`/api/tenants/${tenantSettings.id}/spe/reset`, {
        method: "POST",
        body: JSON.stringify({ deleteFromAzure: opts.deleteFromAzure }),
      }),
    onSuccess: (data: any) => {
      setResetResult(data);
      setShowResetConfirm(false);
      setDeleteFromAzure(false);
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/settings"] });
      toast({ title: "Container reset", description: data.message });
    },
    onError: (error: Error) => {
      setResetResult({ success: false, message: error.message });
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    },
  });

  const [registerResult, setRegisterResult] = useState<{ success: boolean; message: string } | null>(null);

  const registerContainerTypeMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/tenants/${tenantSettings.id}/spe/register-container-type`, {
        method: "POST",
      }),
    onSuccess: (data: any) => {
      setRegisterResult(data);
      if (data.success) {
        toast({ title: "Container type registered", description: data.message || "Container type registered in tenant SharePoint." });
      } else {
        toast({ title: "Registration failed", description: data.message || "Could not register container type.", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      setRegisterResult({ success: false, message: error.message });
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    },
  });

  const [grantPermResult, setGrantPermResult] = useState<{ success: boolean; message: string } | null>(null);

  const grantPermissionsMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/tenants/${tenantSettings.id}/spe/grant-permissions`, {
        method: "POST",
      }),
    onSuccess: (data: any) => {
      setGrantPermResult(data);
      if (data.success) {
        toast({ title: "Permissions granted", description: data.message || "Owner permissions granted on the container." });
      } else {
        toast({ title: "Permission grant failed", description: data.message || "Could not grant permissions.", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      setGrantPermResult({ success: false, message: error.message });
      toast({ title: "Permission grant failed", description: error.message, variant: "destructive" });
    },
  });

  const [testResult, setTestResult] = useState<{
    success: boolean;
    uploadOk: boolean;
    downloadOk: boolean;
    deleteOk: boolean;
    error?: string;
    details?: string;
  } | null>(null);

  const testUploadMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/tenants/${tenantSettings.id}/spe/test-upload`, {
        method: "POST",
      }),
    onSuccess: (data: any) => {
      setTestResult(data);
      if (data.success) {
        toast({ title: "Test passed", description: "Upload, download, and cleanup all succeeded." });
      } else {
        toast({ title: "Test failed", description: data.error || "One or more steps failed.", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      setTestResult({ success: false, uploadOk: false, downloadOk: false, deleteOk: false, error: error.message });
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveContainerIds = () => {
    updateConfigMutation.mutate({
      speContainerIdDev: devContainerId || undefined,
      speContainerIdProd: prodContainerId || undefined,
    });
  };

  const handleToggleEnabled = (enabled: boolean) => {
    if (enabled && !currentContainerId) {
      toast({
        title: "Cannot enable SPE",
        description: `Configure a container ID for ${currentEnvLabel} first.`,
        variant: "destructive",
      });
      return;
    }
    updateConfigMutation.mutate({ speStorageEnabled: enabled });
  };

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            SharePoint Embedded Document Storage
          </CardTitle>
          {tenantSettings.speStorageEnabled ? (
            <Badge variant="outline" className="text-green-600 border-green-600">
              <CheckCircle className="h-3 w-3 mr-1" />
              Enabled
            </Badge>
          ) : currentContainerId ? (
            <Badge variant="outline" className="text-orange-600 border-orange-600">
              Configured (Disabled)
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Not Configured
            </Badge>
          )}
        </div>
        <CardDescription>
          Store invoices, expense receipts, and project files in your organization's own SharePoint Embedded container.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-3 bg-muted/30">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Current Environment: <Badge variant="secondary">{currentEnvLabel}</Badge></span>
          </div>
          <p className="text-xs text-muted-foreground">
            Container operations apply to the {currentEnvLabel} environment. Each environment uses a separate container.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-muted-foreground">Azure AD Tenant:</span>
          {tenantSettings.azureTenantId ? (
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">{tenantSettings.azureTenantId}</code>
          ) : (
            <span className="text-orange-600 dark:text-orange-400">Not set — will auto-populate when an admin signs in via SSO</span>
          )}
        </div>

        {!tenantSettings.adminConsentGranted && (
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Azure AD admin consent must be granted before creating SPE containers. Complete admin consent setup in your Azure portal first.</span>
              <Button
                variant="outline"
                size="sm"
                className="ml-3 shrink-0"
                onClick={() => {
                  updateConfigMutation.mutate({
                    adminConsentGranted: true,
                  });
                }}
                disabled={updateConfigMutation.isPending}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Mark Consent Complete
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3 border-t pt-3">
          <p className="text-sm font-medium">Container IDs</p>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium w-24 shrink-0">Development</label>
              <Input
                value={devContainerId}
                onChange={(e) => setDevContainerId(e.target.value)}
                placeholder="Enter dev container ID"
                className="flex-1 font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium w-24 shrink-0">Production</label>
              <Input
                value={prodContainerId}
                onChange={(e) => setProdContainerId(e.target.value)}
                placeholder="Enter prod container ID"
                className="flex-1 font-mono text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveContainerIds}
              disabled={updateConfigMutation.isPending}
            >
              {updateConfigMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
              Save Container IDs
            </Button>
            {currentContainerId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setVerifyResult(null); verifyMutation.mutate(); }}
                disabled={verifyMutation.isPending}
              >
                {verifyMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Verify Access
              </Button>
            )}
          </div>

          {verifyResult && (
            <div className={`rounded-lg border p-3 ${verifyResult.status === "healthy" ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800" : "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800"}`}>
              <div className="flex items-center gap-2">
                {verifyResult.status === "healthy" ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                )}
                <span className="text-sm font-medium">
                  {verifyResult.status === "healthy" ? "Container is healthy and accessible" : `Verification failed: ${verifyResult.error || "Container not accessible"}`}
                </span>
              </div>
            </div>
          )}
        </div>

        {tenantSettings.adminConsentGranted && !currentContainerId && (
          <div className="border-t pt-3">
            <Button
              onClick={() => createContainerMutation.mutate()}
              disabled={createContainerMutation.isPending}
              className="w-full"
            >
              {createContainerMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              {createContainerMutation.isPending ? "Creating Container..." : `Create Container for ${currentEnvLabel}`}
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Creates a new SPE container named "{tenantSettings.name}-{isProduction ? 'Prod' : 'Dev'}"
            </p>
          </div>
        )}

        <div className="flex items-center justify-between py-2 border-t pt-3">
          <div>
            <p className="text-sm font-medium">Enable SPE Storage</p>
            <p className="text-xs text-muted-foreground">Route document storage through this tenant's SPE container</p>
          </div>
          <Switch
            checked={tenantSettings.speStorageEnabled}
            onCheckedChange={handleToggleEnabled}
            disabled={updateConfigMutation.isPending}
          />
        </div>

        {currentContainerId && (
          <div className="border-t pt-3 space-y-3">
            <div className="space-y-2">
              <p className="text-sm font-medium">Register Container Type</p>
              <p className="text-xs text-muted-foreground">
                Registers the SPE container type in this tenant's SharePoint. Required once before file operations work. This is automatically done during container creation, but can be re-run if needed.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setRegisterResult(null); registerContainerTypeMutation.mutate(); }}
                disabled={registerContainerTypeMutation.isPending}
              >
                {registerContainerTypeMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Shield className="h-3 w-3 mr-1" />}
                {registerContainerTypeMutation.isPending ? "Registering..." : "Register Container Type"}
              </Button>
              {registerResult && (
                <div className={`rounded-lg border p-3 text-sm ${registerResult.success ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800" : "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800"}`}>
                  <div className="flex items-center gap-2 font-medium">
                    {registerResult.success ? (
                      <><CheckCircle className="h-4 w-4 text-green-600" /> {registerResult.message}</>
                    ) : (
                      <><AlertTriangle className="h-4 w-4 text-red-600" /> {registerResult.message}</>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Grant Container Permissions</p>
              <p className="text-xs text-muted-foreground">
                Grants owner permissions to the application on the existing container. Required if the container was created externally or permissions are missing.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setGrantPermResult(null); grantPermissionsMutation.mutate(); }}
                disabled={grantPermissionsMutation.isPending}
              >
                {grantPermissionsMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Shield className="h-3 w-3 mr-1" />}
                {grantPermissionsMutation.isPending ? "Granting..." : "Grant Permissions"}
              </Button>
              {grantPermResult && (
                <div className={`rounded-lg border p-3 text-sm ${grantPermResult.success ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800" : "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800"}`}>
                  <div className="flex items-center gap-2 font-medium">
                    {grantPermResult.success ? (
                      <><CheckCircle className="h-4 w-4 text-green-600" /> {grantPermResult.message}</>
                    ) : (
                      <><AlertTriangle className="h-4 w-4 text-red-600" /> {grantPermResult.message}</>
                    )}
                  </div>
                </div>
              )}
            </div>

            <p className="text-sm font-medium">Test Container Access</p>
            <p className="text-xs text-muted-foreground">
              Upload a test file to the SPE container, download it back, and clean up. This confirms files can be saved and retrieved correctly before going live.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setTestResult(null); testUploadMutation.mutate(); }}
              disabled={testUploadMutation.isPending}
            >
              {testUploadMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
              {testUploadMutation.isPending ? "Testing..." : "Run Test Upload"}
            </Button>
            {testResult && (
              <div className={`rounded-lg border p-3 text-sm space-y-1 ${testResult.success ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800" : "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800"}`}>
                <div className="flex items-center gap-2 font-medium">
                  {testResult.success ? (
                    <><CheckCircle className="h-4 w-4 text-green-600" /> All tests passed</>
                  ) : (
                    <><AlertTriangle className="h-4 w-4 text-red-600" /> {testResult.error || "Some tests failed"}</>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                  <div className={`flex items-center gap-1 ${testResult.uploadOk ? "text-green-600" : "text-red-600"}`}>
                    {testResult.uploadOk ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />} Upload
                  </div>
                  <div className={`flex items-center gap-1 ${testResult.downloadOk ? "text-green-600" : "text-red-600"}`}>
                    {testResult.downloadOk ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />} Download
                  </div>
                  <div className={`flex items-center gap-1 ${testResult.deleteOk ? "text-green-600" : "text-red-600"}`}>
                    {testResult.deleteOk ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />} Cleanup
                  </div>
                </div>
                {testResult.details && <p className="text-xs text-muted-foreground break-all">{testResult.details}</p>}
                {!testResult.success && testResult.error && testResult.error !== testResult.details && (
                  <p className="text-xs text-red-500 dark:text-red-400 break-all mt-1">Graph API Error: {testResult.error}</p>
                )}
              </div>
            )}
          </div>
        )}

        {isPlatformAdmin && currentContainerId && (
          <div className="border-t pt-3 space-y-3">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Reset Container</p>
            <p className="text-xs text-muted-foreground">
              Disconnect the current SPE container from this tenant. This disables SPE storage and clears the container ID, allowing you to create a new one. Optionally, you can also permanently delete the container and all its files from Azure.
            </p>
            {!showResetConfirm ? (
              <Button
                variant="outline"
                size="sm"
                className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={() => { setResetResult(null); setShowResetConfirm(true); }}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset Container
              </Button>
            ) : (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-3">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  Are you sure you want to reset the container for {currentEnvLabel}?
                </p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  Container ID: <code className="bg-red-100 dark:bg-red-900/40 px-1 rounded">{currentContainerId}</code>
                </p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteFromAzure}
                    onChange={(e) => setDeleteFromAzure(e.target.checked)}
                    className="rounded border-red-400"
                  />
                  <span className="text-red-700 dark:text-red-300">
                    Also permanently delete the container and all its files from Azure
                  </span>
                </label>
                {deleteFromAzure && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium pl-6">
                    This action cannot be undone. All documents stored in this container will be permanently lost.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => resetContainerMutation.mutate({ deleteFromAzure })}
                    disabled={resetContainerMutation.isPending}
                  >
                    {resetContainerMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                    {resetContainerMutation.isPending ? "Resetting..." : deleteFromAzure ? "Delete & Reset" : "Disconnect Only"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowResetConfirm(false); setDeleteFromAzure(false); }}
                    disabled={resetContainerMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {resetResult && (
              <div className={`rounded-lg border p-3 text-sm ${resetResult.success ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800" : "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800"}`}>
                <div className="flex items-center gap-2 font-medium">
                  {resetResult.success ? (
                    <><CheckCircle className="h-4 w-4 text-green-600" /> {resetResult.message}</>
                  ) : (
                    <><AlertTriangle className="h-4 w-4 text-red-600" /> {resetResult.message}</>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {isPlatformAdmin && (
          <div className="border-t pt-3 space-y-3">
            <p className="text-sm font-medium">Existing Storage Inventory</p>
            <p className="text-xs text-muted-foreground">
              Scan current storage (Replit Object Storage / local) to see what files exist before migrating. Files are not modified — this is read-only.
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setInventoryData(null); inventoryMutation.mutate(); }}
                disabled={inventoryMutation.isPending}
              >
                {inventoryMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Database className="h-3 w-3 mr-1" />}
                {inventoryMutation.isPending ? "Scanning..." : "Scan Storage"}
              </Button>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeUntagged}
                  onChange={(e) => setIncludeUntagged(e.target.checked)}
                  className="rounded border-muted-foreground"
                />
                Include untagged files
              </label>
            </div>
            {inventoryData && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{inventoryData.totalFiles} file(s) found</span>
                  {inventoryData.totalSize > 0 && (
                    <span className="text-xs text-muted-foreground">{(inventoryData.totalSize / 1024 / 1024).toFixed(2)} MB total</span>
                  )}
                </div>
                {inventoryData.untaggedFiles > 0 && (
                  <p className="text-xs text-orange-600 dark:text-orange-400">
                    {inventoryData.untaggedFiles} file(s) have no tenant tag. {!includeUntagged ? "Check \"Include untagged files\" and re-scan to see them." : "Shown below — these need tenant tags before migration."}
                  </p>
                )}
                {Object.keys(inventoryData.byDocumentType).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(inventoryData.byDocumentType).map(([type, count]) => (
                      <Badge key={type} variant="secondary" className="text-xs">
                        {type}: {count}
                      </Badge>
                    ))}
                  </div>
                )}
                {inventoryData.files.length > 0 && inventoryData.files.length <= 50 && (
                  <div className="max-h-40 overflow-y-auto border rounded-md">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-1.5 font-medium">File</th>
                          <th className="text-left p-1.5 font-medium">Type</th>
                          <th className="text-left p-1.5 font-medium">Tagged</th>
                          {inventoryData.totalSize > 0 && <th className="text-right p-1.5 font-medium">Size</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {inventoryData.files.map((f, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-1.5 font-mono truncate max-w-[200px]">{f.fileName}</td>
                            <td className="p-1.5">{f.documentType}</td>
                            <td className="p-1.5">{f.tagged ? <CheckCircle className="h-3 w-3 text-green-600" /> : <AlertTriangle className="h-3 w-3 text-orange-500" />}</td>
                            {inventoryData.totalSize > 0 && <td className="p-1.5 text-right">{(f.size / 1024).toFixed(1)} KB</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {inventoryData.files.length > 50 && (
                  <p className="text-xs text-muted-foreground">Showing summary only — {inventoryData.files.length} files is too many to list individually.</p>
                )}
              </div>
            )}
          </div>
        )}

        {isPlatformAdmin && tenantSettings.speStorageEnabled && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-sm font-medium">File Migration</p>
            <p className="text-xs text-muted-foreground">
              Migrate existing files from Replit Object Storage to this tenant's SPE container. Originals are preserved — migration is additive only.
            </p>
            {tenantSettings.speMigrationStatus && (
              <div className="flex items-center gap-2">
                <Badge variant={
                  tenantSettings.speMigrationStatus === 'completed' ? 'default' :
                  tenantSettings.speMigrationStatus === 'in_progress' ? 'secondary' :
                  tenantSettings.speMigrationStatus === 'failed' ? 'destructive' : 'outline'
                }>
                  {tenantSettings.speMigrationStatus === 'in_progress' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {tenantSettings.speMigrationStatus}
                </Badge>
                {tenantSettings.speMigrationStartedAt && (
                  <span className="text-xs text-muted-foreground">
                    Started: {new Date(tenantSettings.speMigrationStartedAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => migrateMutation.mutate()}
              disabled={migrateMutation.isPending || tenantSettings.speMigrationStatus === 'in_progress'}
            >
              {migrateMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
              {tenantSettings.speMigrationStatus === 'in_progress' ? "Migration In Progress..." : "Start Migration"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function OrganizationSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("branding");

  const [editingGlNumber, setEditingGlNumber] = useState(false);
  const [newGlNumber, setNewGlNumber] = useState<string>('');

  const { data: tenantsData } = useQuery<TenantsResponse>({
    queryKey: ["/api/auth/tenants"],
  });

  const activeTenant = tenantsData?.tenants?.find(t => t.isActive);

  const { data: tenantSettings, isLoading: isLoadingSettings } = useQuery<TenantSettings>({
    queryKey: ["/api/tenant/settings"],
  });

  const { data: glNumberData } = useQuery<{ nextGlInvoiceNumber: number; formatted: string }>({
    queryKey: ["/api/billing/gl-invoice-number"],
  });

  const glNumberMutation = useMutation({
    mutationFn: (nextGlInvoiceNumber: number) => apiRequest("/api/billing/gl-invoice-number", {
      method: "PUT",
      body: JSON.stringify({ nextGlInvoiceNumber }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/gl-invoice-number"] });
      setEditingGlNumber(false);
      toast({ title: "GL invoice number counter updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update counter", description: error.message, variant: "destructive" });
    },
  });

  const handleGlNumberSave = () => {
    const num = parseInt(newGlNumber, 10);
    if (isNaN(num) || num < 0) {
      toast({ title: "Invalid number", description: "Please enter a valid non-negative number.", variant: "destructive" });
      return;
    }
    glNumberMutation.mutate(num);
  };

  interface FinancialAlertRecipient {
    id: string;
    userId: string;
    role: string;
    receiveFinancialAlerts: boolean;
    userName: string;
    userEmail: string | null;
  }

  const { data: alertRecipients = [], isLoading: isLoadingAlertRecipients } = useQuery<FinancialAlertRecipient[]>({
    queryKey: ["/api/tenant/financial-alert-recipients"],
  });

  const toggleAlertMutation = useMutation({
    mutationFn: ({ membershipId, receiveFinancialAlerts }: { membershipId: string; receiveFinancialAlerts: boolean }) =>
      apiRequest(`/api/tenant/financial-alert-recipients/${membershipId}`, {
        method: "PATCH",
        body: JSON.stringify({ receiveFinancialAlerts }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/financial-alert-recipients"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
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
      primaryColor: "#810FFB",
      secondaryColor: "#E60CB3",
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
      primaryColor: (tenantSettings as any)?.branding?.primaryColor || "#810FFB",
      secondaryColor: (tenantSettings as any)?.branding?.secondaryColor || "#E60CB3",
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
          branding: {
            primaryColor: data.primaryColor || "#810FFB",
            secondaryColor: data.secondaryColor || "#E60CB3",
          },
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

  const { data: catalogTerms = [], isLoading: isLoadingCatalog } = useQuery<VocabularyCatalogTerm[]>({
    queryKey: ["/api/vocabulary/catalog"],
  });

  const { data: orgSelections, isLoading: isLoadingSelections } = useQuery<OrganizationVocabularySelection>({
    queryKey: ["/api/vocabulary/organization/selections"],
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/context"] });
      vocabularyForm.reset(data);
      toast({ title: "Terminology updated", description: "Organization terminology defaults have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save terminology settings.", variant: "destructive" });
    },
  });

  const handleVocabularySubmit = (data: VocabularySelectionsData) => {
    updateVocabularyMutation.mutate(data);
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
                {tenantSettings?.name ? (
                  <Badge variant="secondary" className="font-medium">
                    {tenantSettings.name}
                  </Badge>
                ) : activeTenant ? (
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
              <TabsTrigger value="vocabulary" className="flex items-center gap-2">
                <Languages className="w-4 h-4" />
                <span>Vocabulary</span>
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
                      <CardTitle>Report Branding Colors</CardTitle>
                      <CardDescription>
                        Colors used in exported PowerPoint status reports and branded documents
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={brandingForm.control}
                          name="primaryColor"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Primary Color</FormLabel>
                              <div className="flex items-center gap-3">
                                <FormControl>
                                  <Input
                                    type="color"
                                    {...field}
                                    className="w-12 h-10 p-1 cursor-pointer"
                                  />
                                </FormControl>
                                <Input
                                  value={field.value}
                                  onChange={field.onChange}
                                  placeholder="#810FFB"
                                  className="flex-1 font-mono text-sm"
                                />
                                <div
                                  className="w-10 h-10 rounded border"
                                  style={{ backgroundColor: field.value || '#810FFB' }}
                                />
                              </div>
                              <FormDescription>
                                Used for slide headers, title bars, and primary accents in reports
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={brandingForm.control}
                          name="secondaryColor"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Secondary Color</FormLabel>
                              <div className="flex items-center gap-3">
                                <FormControl>
                                  <Input
                                    type="color"
                                    {...field}
                                    className="w-12 h-10 p-1 cursor-pointer"
                                  />
                                </FormControl>
                                <Input
                                  value={field.value}
                                  onChange={field.onChange}
                                  placeholder="#E60CB3"
                                  className="flex-1 font-mono text-sm"
                                />
                                <div
                                  className="w-10 h-10 rounded border"
                                  style={{ backgroundColor: field.value || '#E60CB3' }}
                                />
                              </div>
                              <FormDescription>
                                Used for gradient accents, highlights, and secondary elements
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex gap-3 p-3 border rounded-lg bg-muted/30">
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground mb-2">Preview gradient:</p>
                          <div
                            className="h-8 rounded"
                            style={{
                              background: `linear-gradient(135deg, ${brandingForm.watch('primaryColor') || '#810FFB'}, ${brandingForm.watch('secondaryColor') || '#E60CB3'})`,
                            }}
                          />
                        </div>
                      </div>
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

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Hash className="h-5 w-5" />
                    GL Invoice Number Counter
                  </CardTitle>
                  <CardDescription>
                    Each new invoice batch is automatically assigned the next GL invoice number. You can view or reset the counter here.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="text-sm font-medium">Next GL Invoice Number</label>
                      {!editingGlNumber ? (
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-2xl font-mono font-semibold tracking-wider">
                            {glNumberData?.formatted || "—"}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingGlNumber(true);
                              setNewGlNumber(String(glNumberData?.nextGlInvoiceNumber || 1000));
                            }}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Reset
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            type="number"
                            min="0"
                            value={newGlNumber}
                            onChange={(e) => setNewGlNumber(e.target.value)}
                            className="w-40 font-mono"
                          />
                          <Button
                            size="sm"
                            onClick={handleGlNumberSave}
                            disabled={glNumberMutation.isPending}
                          >
                            <Save className="h-4 w-4 mr-1" />
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setEditingGlNumber(false); setNewGlNumber(''); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This counter increments automatically each time a new invoice batch is created. Resetting it will change the next number assigned.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Financial Alert Recipients
                  </CardTitle>
                  <CardDescription>
                    Choose which team members receive email notifications for financial events like expense report submissions, approvals, and rejections. If no one is selected, admins and billing admins will receive alerts by default.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingAlertRecipients ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : alertRecipients.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No team members found in this organization.</p>
                  ) : (
                    <div className="space-y-1">
                      {alertRecipients.map((member) => (
                        <div key={member.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{member.userName}</span>
                              <Badge variant="outline" className="text-xs shrink-0">{member.role}</Badge>
                            </div>
                            {member.userEmail && (
                              <p className="text-xs text-muted-foreground truncate">{member.userEmail}</p>
                            )}
                          </div>
                          <Switch
                            checked={member.receiveFinancialAlerts}
                            onCheckedChange={(checked) => {
                              toggleAlertMutation.mutate({
                                membershipId: member.id,
                                receiveFinancialAlerts: checked,
                              });
                            }}
                          />
                        </div>
                      ))}
                      {!alertRecipients.some(m => m.receiveFinancialAlerts) && (
                        <Alert className="mt-3">
                          <Info className="h-4 w-4" />
                          <AlertDescription>
                            No recipients selected. Financial alerts will default to admins and billing admins in this organization.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="integrations" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link2 className="h-5 w-5" />
                    Organization Integrations
                  </CardTitle>
                  <CardDescription>
                    Microsoft 365 service connections for this organization. Integration settings are specific to each organization and will change when you switch organizations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Card className="border-2">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <MicrosoftPlannerIcon className="h-5 w-5" />
                          Microsoft Planner — Project Assignments
                        </CardTitle>
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Available
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Synchronize project resource assignments with Microsoft Planner tasks for collaborative task management. Each project connects to its own Planner plan.
                      </p>
                      <div className="rounded-lg border p-3 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                        <div className="flex items-start gap-2">
                          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                          <p className="text-sm text-blue-800 dark:text-blue-300">
                            Planner connectivity is configured <strong>per project</strong>. Open any project, go to the <strong>Planner</strong> tab, and click <strong>"Connect to Planner"</strong> to link it to an existing plan or create a new one.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Button variant="outline" size="sm" asChild>
                          <a href="/projects">
                            <ArrowRight className="h-4 w-4 mr-1" />
                            Go to Projects
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-2">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <MicrosoftPlannerIcon className="h-5 w-5" />
                          Microsoft Planner — Support Tickets
                        </CardTitle>
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Available
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Automatically create Planner tasks from support tickets and close tickets when their Planner tasks are completed.
                      </p>
                      <div className="rounded-lg border p-3 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                        <div className="flex items-start gap-2">
                          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                          <p className="text-sm text-blue-800 dark:text-blue-300">
                            Support ticket Planner integration is configured on the <strong>Support</strong> tab of this page. Connect a Planner plan and enable bidirectional sync there.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => {
                          const tabsEl = document.querySelector('[data-state="active"][role="tabpanel"]');
                          const supportTrigger = document.querySelector('[value="support"]') as HTMLElement;
                          supportTrigger?.click();
                        }}>
                          <ArrowRight className="h-4 w-4 mr-1" />
                          Go to Support Tab
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <HubSpotIntegrationCard />

                  <Card className="border border-dashed">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Mail className="h-5 w-5" />
                          Email (Microsoft 365)
                        </CardTitle>
                        <Badge variant="secondary">Platform-managed</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Email notifications (expense reminders, time reminders, invoice delivery) are handled through the platform's Microsoft 365 connection.
                      </p>
                    </CardContent>
                  </Card>

                  {tenantSettings && <DocumentStorageCard tenantSettings={tenantSettings} />}
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
                    Select preferred terminology for this organization. These defaults apply to all new projects and can be overridden at the client or project level.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {isLoadingCatalog || isLoadingSelections ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-lg">Loading terminology options...</div>
                    </div>
                  ) : catalogTerms.length === 0 ? (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        No vocabulary terms have been configured yet. A platform administrator needs to set up the vocabulary catalog in System Settings first.
                      </AlertDescription>
                    </Alert>
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
                          >
                            Consulting
                            <Badge variant="secondary" className="ml-2 text-xs">Program / Phase / Category / Target / Deliverable</Badge>
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
                                  <FormDescription>Top-level project grouping</FormDescription>
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
                                  <FormDescription>Mid-level project phase</FormDescription>
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
                                  <FormDescription>Individual task or work item level</FormDescription>
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
                                  <FormDescription>Parallel work track (optional)</FormDescription>
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
                                  <FormDescription>Checkpoint or target (optional)</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="flex justify-end">
                            <Button
                              type="submit"
                              disabled={updateVocabularyMutation.isPending}
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

            <TabsContent value="support" className="space-y-6">
              <AdminSupportTab />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Layout>
  );
}
