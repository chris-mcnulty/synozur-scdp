import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  Cpu,
  Activity,
  DollarSign,
  Zap,
  Settings,
  BarChart3,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  RefreshCw,
  TrendingUp,
  Bell,
  Plus,
  Trash2,
  Shield,
  AlertCircle,
  Link,
  FlaskConical,
} from "lucide-react";
import type { AI_MODELS, AI_MODEL_INFO } from "@shared/schema";

interface ProviderStatus {
  name: string;
  configured: boolean;
  displayName: string;
}

interface AiConfig {
  id?: string;
  activeProvider: string;
  activeModel: string;
  providerConfig: any;
  enableStreaming: boolean;
  maxTokensPerRequest: number;
  monthlyTokenBudget: number | null;
  alertThresholds: number[] | null;
  alertEnabled: boolean | null;
}

interface AiUsageAlert {
  id: string;
  periodMonth: string;
  thresholdPercent: number;
  tokenUsageAtAlert: number;
  monthlyBudget: number;
  alertedAt: string;
  notifiedEmails: string[] | null;
}

interface AiOptions {
  providers: Record<string, ProviderStatus>;
  models: Record<string, readonly string[]>;
  modelInfo: Record<string, {
    name: string;
    description: string;
    costTier: string;
    providers: string[];
    contextWindow: number;
    costPer1kPrompt: number;
    costPer1kCompletion: number;
  }>;
  features: Record<string, string>;
}

interface UsageLog {
  id: string;
  provider: string;
  model: string;
  feature: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostMicrodollars: number | null;
  latencyMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface UsageStats {
  period: { start: string; end: string };
  totalRequests: number;
  totalTokens: number;
  totalCostMicrodollars: number;
  totalCostDollars: number;
  byModel: Record<string, { requests: number; tokens: number; cost: number }>;
  byFeature: Record<string, { requests: number; tokens: number; cost: number }>;
  dailyUsage: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  recentLogs: UsageLog[];
}

function costTierBadge(tier: string) {
  const variants: Record<string, string> = {
    free: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[tier] || variants.medium}`}>{tier}</span>;
}

function formatFeatureName(feature: string): string {
  return feature.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMicrodollars(microdollars: number): string {
  const dollars = microdollars / 1_000_000;
  if (dollars < 0.01) return `$${dollars.toFixed(6)}`;
  if (dollars < 1) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function ModelConfigSection() {
  const { toast } = useToast();

  const { data: config, isLoading: configLoading } = useQuery<AiConfig>({
    queryKey: ["/api/admin/ai-config"],
  });

  const { data: options, isLoading: optionsLoading } = useQuery<AiOptions>({
    queryKey: ["/api/admin/ai-config/options"],
  });

  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [enableStreaming, setEnableStreaming] = useState(true);
  const [maxTokens, setMaxTokens] = useState("4096");
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [alertThresholds, setAlertThresholds] = useState("75, 90, 100");

  const isInitialized = selectedProvider !== "";

  if (config && !isInitialized) {
    setSelectedProvider(config.activeProvider);
    setSelectedModel(config.activeModel);
    setEnableStreaming(config.enableStreaming ?? true);
    setMaxTokens(String(config.maxTokensPerRequest || 4096));
    setMonthlyBudget(config.monthlyTokenBudget ? String(config.monthlyTokenBudget) : "");
    setAlertEnabled(config.alertEnabled ?? true);
    setAlertThresholds((config.alertThresholds ?? [75, 90, 100]).join(", "));
  }

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<AiConfig>) => {
      return apiRequest("/api/admin/ai-config", {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-config"] });
      toast({ title: "Configuration updated", description: "AI model configuration has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const parsedThresholds = alertThresholds
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0 && n <= 200);

    updateMutation.mutate({
      activeProvider: selectedProvider,
      activeModel: selectedModel,
      enableStreaming,
      maxTokensPerRequest: parseInt(maxTokens, 10) || 4096,
      monthlyTokenBudget: monthlyBudget ? parseInt(monthlyBudget, 10) : null,
      alertThresholds: parsedThresholds.length > 0 ? parsedThresholds : [75, 90, 100],
      alertEnabled,
    });
  };

  if (configLoading || optionsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const availableModels = options?.models[selectedProvider] || [];
  const modelInfo = options?.modelInfo || {};

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="w-5 h-5" />
            Provider & Model Selection
          </CardTitle>
          <CardDescription>Choose the AI provider and model for all AI features in Constellation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Active Provider</Label>
              <Select value={selectedProvider} onValueChange={(v) => { setSelectedProvider(v); setSelectedModel(options?.models[v]?.[0] || ""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {options?.providers && Object.entries(options.providers).map(([key, p]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        {p.configured ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                        {p.displayName}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Active Model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((m) => (
                    <SelectItem key={m} value={m}>
                      <div className="flex items-center gap-2">
                        {modelInfo[m]?.name || m}
                        {modelInfo[m] && costTierBadge(modelInfo[m].costTier)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {modelInfo[selectedModel] && (
                <p className="text-xs text-muted-foreground">{modelInfo[selectedModel].description} — Context: {formatNumber(modelInfo[selectedModel].contextWindow)} tokens</p>
              )}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center justify-between space-x-4">
              <div>
                <Label>Streaming</Label>
                <p className="text-xs text-muted-foreground">Enable streaming responses</p>
              </div>
              <Switch checked={enableStreaming} onCheckedChange={setEnableStreaming} />
            </div>

            <div className="space-y-2">
              <Label>Max Tokens / Request</Label>
              <Input type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} min={256} max={128000} />
            </div>

            <div className="space-y-2">
              <Label>Monthly Token Budget</Label>
              <Input type="number" value={monthlyBudget} onChange={(e) => setMonthlyBudget(e.target.value)} placeholder="Unlimited" min={0} />
              <p className="text-xs text-muted-foreground">Leave empty for unlimited</p>
            </div>
          </div>

          {monthlyBudget && (
            <>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-center justify-between space-x-4">
                  <div>
                    <Label>Usage Alerts</Label>
                    <p className="text-xs text-muted-foreground">Email platform admins when thresholds are crossed</p>
                  </div>
                  <Switch checked={alertEnabled} onCheckedChange={setAlertEnabled} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Alert Thresholds (%)</Label>
                  <Input
                    value={alertThresholds}
                    onChange={(e) => setAlertThresholds(e.target.value)}
                    placeholder="75, 90, 100"
                    disabled={!alertEnabled}
                  />
                  <p className="text-xs text-muted-foreground">Comma-separated percentages. Alerts send once per threshold per month.</p>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Provider Status
          </CardTitle>
          <CardDescription>Configuration status for each AI provider</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {options?.providers && Object.entries(options.providers).map(([key, p]) => (
              <div key={key} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                {p.configured ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium">{p.displayName}</p>
                  <p className="text-xs text-muted-foreground">{p.configured ? "Ready" : "Not configured"}</p>
                </div>
                {config?.activeProvider === key && (
                  <Badge variant="default" className="ml-auto text-xs">Active</Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UsageDashboardSection() {
  const { data: usage, isLoading } = useQuery<UsageStats>({
    queryKey: ["/api/admin/ai-usage"],
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!usage) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No usage data available yet.</p>
          <p className="text-sm text-muted-foreground mt-1">AI usage will appear here once AI features are used.</p>
        </CardContent>
      </Card>
    );
  }

  const featureEntries = usage.byFeature ? Object.entries(usage.byFeature).sort((a, b) => b[1].requests - a[1].requests) : [];
  const modelEntries = usage.byModel ? Object.entries(usage.byModel).sort((a, b) => b[1].requests - a[1].requests) : [];
  const maxFeatureRequests = featureEntries.length > 0 ? Math.max(...featureEntries.map(([, v]) => v.requests)) : 1;
  const maxModelRequests = modelEntries.length > 0 ? Math.max(...modelEntries.map(([, v]) => v.requests)) : 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                <Activity className="w-5 h-5 text-blue-600 dark:text-blue-300" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-2xl font-bold">{formatNumber(usage.totalRequests)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                <Cpu className="w-5 h-5 text-purple-600 dark:text-purple-300" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Tokens</p>
                <p className="text-2xl font-bold">{formatNumber(usage.totalTokens)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
                <DollarSign className="w-5 h-5 text-green-600 dark:text-green-300" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estimated Cost</p>
                <p className="text-2xl font-bold">{formatMicrodollars(usage.totalCostMicrodollars)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900">
                <TrendingUp className="w-5 h-5 text-orange-600 dark:text-orange-300" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Tokens/Request</p>
                <p className="text-2xl font-bold">
                  {usage.totalRequests > 0 ? formatNumber(Math.round(usage.totalTokens / usage.totalRequests)) : "0"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage by Feature</CardTitle>
          </CardHeader>
          <CardContent>
            {featureEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No feature usage data</p>
            ) : (
              <div className="space-y-3">
                {featureEntries.map(([feature, data]) => (
                  <div key={feature} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{formatFeatureName(feature)}</span>
                      <span className="text-muted-foreground">{data.requests} requests</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${(data.requests / maxFeatureRequests) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage by Model</CardTitle>
          </CardHeader>
          <CardContent>
            {modelEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No model usage data</p>
            ) : (
              <div className="space-y-3">
                {modelEntries.map(([model, data]) => (
                  <div key={model} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{model}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{formatNumber(data.tokens)} tokens</span>
                        <span className="text-muted-foreground">{data.requests} req</span>
                      </div>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-chart-2 rounded-full transition-all"
                        style={{ width: `${(data.requests / maxModelRequests) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {usage.dailyUsage && usage.dailyUsage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Usage (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-40">
              {usage.dailyUsage.map((day, i) => {
                const maxDayReqs = Math.max(...usage.dailyUsage.map((d) => d.requests));
                const height = maxDayReqs > 0 ? (day.requests / maxDayReqs) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground border rounded px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
                      {new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {day.requests} req, {formatNumber(day.tokens)} tokens
                    </div>
                    <div
                      className="w-full bg-primary/80 rounded-t hover:bg-primary transition-colors min-h-[2px]"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              {usage.dailyUsage.length > 0 && (
                <>
                  <span>{new Date(usage.dailyUsage[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <span>{new Date(usage.dailyUsage[usage.dailyUsage.length - 1].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Recent AI Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(!usage.recentLogs || usage.recentLogs.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-4">No recent AI calls</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Feature</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Latency</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.recentLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{formatFeatureName(log.feature)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{log.provider}</TableCell>
                      <TableCell className="text-xs font-medium">{log.model}</TableCell>
                      <TableCell className="text-right text-xs">
                        <span title={`Prompt: ${log.promptTokens} / Completion: ${log.completionTokens}`}>
                          {formatNumber(log.totalTokens)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {log.estimatedCostMicrodollars != null ? formatMicrodollars(log.estimatedCostMicrodollars) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {log.latencyMs != null ? `${(log.latencyMs / 1000).toFixed(1)}s` : "—"}
                      </TableCell>
                      <TableCell>
                        {log.errorCode ? (
                          <Badge variant="destructive" className="text-xs">{log.errorCode}</Badge>
                        ) : (
                          <Badge variant="default" className="text-xs bg-green-600">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertHistorySection />
    </div>
  );
}

function AlertHistorySection() {
  const { data: alerts, isLoading } = useQuery<AiUsageAlert[]>({
    queryKey: ["/api/admin/ai-usage/alerts"],
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!alerts || alerts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Alert History
        </CardTitle>
        <CardDescription>Usage threshold alerts that have been sent</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead className="text-right">Usage at Alert</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead>Notified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(alert.alertedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell className="text-sm">{alert.periodMonth}</TableCell>
                  <TableCell>
                    <Badge variant={alert.thresholdPercent >= 100 ? "destructive" : "outline"} className="text-xs">
                      {alert.thresholdPercent}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">{formatNumber(alert.tokenUsageAtAlert)}</TableCell>
                  <TableCell className="text-right text-sm">{formatNumber(alert.monthlyBudget)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{alert.notifiedEmails?.length || 0} admin(s)</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface CopilotStudioStatus {
  agentCardUrl: string;
  agentCardReachable: boolean;
  agentCardValid: boolean;
  agentCardError: string | null;
  oauth: {
    audience: string;
    scope: string;
    scopeDescription: string;
    tokenUrl: string;
    authorizationUrl: string;
    staticCardAudienceMatch: boolean;
  };
  knownClientIds: string[];
  azpEnforcementActive: boolean;
}

interface TestResult {
  ok: boolean;
  httpStatus: number | null;
  message: string;
  detail: any;
}

interface AgentCardHealthResponse {
  result: {
    status: 'ok' | 'invalid' | 'error';
    checkedAt: string;
    skillCount?: number;
    errors?: string[];
    message?: string;
  } | null;
}

function AgentCardHealthCard() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<AgentCardHealthResponse>({
    queryKey: ["/api/admin/agent-card-health"],
    refetchInterval: 5 * 60 * 1000,
  });

  const checkMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/agent-card-health/check", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent-card-health"] });
      toast({ title: "Health check complete", description: "Agent card health check has finished." });
    },
    onError: (err: Error) => {
      toast({ title: "Check failed", description: err.message, variant: "destructive" });
    },
  });

  const result = data?.result ?? null;

  const statusColor = result?.status === 'ok'
    ? 'text-green-600 dark:text-green-400'
    : result?.status === 'invalid'
    ? 'text-yellow-500'
    : result?.status === 'error'
    ? 'text-destructive'
    : 'text-muted-foreground';

  const StatusIcon = result?.status === 'ok'
    ? CheckCircle2
    : result?.status === 'invalid'
    ? AlertCircle
    : XCircle;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Agent Card Health Check
            </CardTitle>
            <CardDescription>
              Scheduled validation result for the A2A agent card. The scheduler runs every hour and emails admins on failure. Use the button below to trigger an immediate re-check.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkMutation.mutate()}
            disabled={checkMutation.isPending}
            className="shrink-0"
          >
            {checkMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Run check now
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !result ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-md border bg-muted/30">
            <Clock className="w-4 h-4 shrink-0" />
            No health check result available yet. The scheduled check runs every hour, or you can trigger one manually above.
          </div>
        ) : (
          <div className={`p-3 rounded-md border space-y-2 ${result.status === 'ok' ? 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800' : result.status === 'invalid' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800' : 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800'}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusIcon className={`w-4 h-4 shrink-0 ${statusColor}`} />
              <span className={`text-sm font-medium ${statusColor}`}>
                {result.status === 'ok' ? 'Healthy' : result.status === 'invalid' ? 'Validation failed' : 'Error'}
              </span>
              <Badge
                variant="outline"
                className={`text-xs ml-auto ${result.status === 'ok' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' : result.status === 'invalid' ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800' : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'}`}
              >
                {result.status.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3 shrink-0" />
              Checked at {new Date(result.checkedAt).toLocaleString()}
              {result.skillCount !== undefined && (
                <span className="ml-2 text-muted-foreground">· {result.skillCount} skill{result.skillCount !== 1 ? 's' : ''}</span>
              )}
            </div>
            {result.message && (
              <p className="text-xs text-muted-foreground border-t pt-2 mt-1">{result.message}</p>
            )}
            {result.errors && result.errors.length > 0 && (
              <ul className="text-xs space-y-1 border-t pt-2 mt-1">
                {result.errors.map((err, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <XCircle className="w-3 h-3 shrink-0 mt-0.5 text-destructive" />
                    <span>{err}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CopilotStudioPanel() {
  const { toast } = useToast();
  const [newClientId, setNewClientId] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const { data: status, isLoading, refetch } = useQuery<CopilotStudioStatus>({
    queryKey: ["/api/admin/copilot-studio/status"],
  });

  const addClientMutation = useMutation({
    mutationFn: async (clientId: string) =>
      apiRequest("/api/admin/copilot-studio/known-clients", {
        method: "POST",
        body: JSON.stringify({ clientId }),
      }),
    onSuccess: () => {
      setNewClientId("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/copilot-studio/status"] });
      toast({ title: "Client ID added", description: "The Copilot Studio client ID has been pre-authorized." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add", description: err.message, variant: "destructive" });
    },
  });

  const removeClientMutation = useMutation({
    mutationFn: async (clientId: string) =>
      apiRequest(`/api/admin/copilot-studio/known-clients/${encodeURIComponent(clientId)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/copilot-studio/status"] });
      toast({ title: "Client ID removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/copilot-studio/test", { method: "POST" }),
    onSuccess: (data: any) => {
      setTestResult(data);
    },
    onError: (err: Error) => {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link className="w-4 h-4" />
            Agent Card Status
          </CardTitle>
          <CardDescription>
            Public discovery endpoint used by Copilot Studio to find this agent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            {status?.agentCardReachable && status?.agentCardValid ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
            ) : status?.agentCardReachable ? (
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            )}
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">
                  {status?.agentCardValid
                    ? "Reachable & valid"
                    : status?.agentCardReachable
                    ? "Reachable but invalid"
                    : "Not reachable"}
                </span>
                {status?.agentCardReachable && status?.agentCardValid && (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                    Healthy
                  </Badge>
                )}
                {!status?.agentCardReachable && (
                  <Badge variant="destructive" className="text-xs">Unreachable</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono break-all">{status?.agentCardUrl}</p>
              {status?.agentCardError && (
                <p className="text-xs text-destructive">{status.agentCardError}</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-auto shrink-0">
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />
            OAuth 2.0 Configuration
          </CardTitle>
          <CardDescription>
            Entra ID application details for the Copilot Studio connector setup
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {status && !status.oauth.staticCardAudienceMatch && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/10 text-sm text-yellow-800 dark:text-yellow-400 mb-3">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>The runtime app ID (AZURE_CLIENT_ID) differs from the audience in the static agent card (<code className="text-xs font-mono">.well-known/agent.json</code>). Re-generate the agent card to keep them in sync.</span>
              </div>
            )}
            <div className="grid grid-cols-[140px_1fr] gap-2 items-start text-sm">
              <span className="text-muted-foreground font-medium">Application ID URI</span>
              <span className="font-mono text-xs break-all">{status?.oauth.audience}</span>
            </div>
            <Separator />
            <div className="grid grid-cols-[140px_1fr] gap-2 items-start text-sm">
              <span className="text-muted-foreground font-medium">Scope</span>
              <span className="font-mono text-xs break-all">{status?.oauth.scope}</span>
            </div>
            <Separator />
            <div className="grid grid-cols-[140px_1fr] gap-2 items-start text-sm">
              <span className="text-muted-foreground font-medium">Scope description</span>
              <span className="text-xs">{status?.oauth.scopeDescription}</span>
            </div>
            <Separator />
            <div className="grid grid-cols-[140px_1fr] gap-2 items-start text-sm">
              <span className="text-muted-foreground font-medium">Token URL</span>
              <span className="font-mono text-xs break-all">{status?.oauth.tokenUrl}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Pre-authorized Client IDs
            {status?.azpEnforcementActive ? (
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 ml-auto">
                Enforced
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground ml-auto">
                Open (any client)
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Copilot Studio agent app Client IDs allowed to call the MCP endpoints. When the list is non-empty, the MCP bearer auth enforces that incoming tokens carry an <code className="text-xs bg-muted px-1 rounded">azp</code> claim matching one of these IDs — preventing unregistered apps from calling the API. When empty, any validly-signed token is accepted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status?.azpEnforcementActive && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/10 text-sm text-yellow-800 dark:text-yellow-400">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>No client IDs configured — any app with a valid Entra token can call MCP endpoints. Add at least one Copilot Studio agent client ID to restrict access.</span>
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={newClientId}
              onChange={(e) => setNewClientId(e.target.value)}
              className="font-mono text-sm"
            />
            <Button
              onClick={() => addClientMutation.mutate(newClientId.trim())}
              disabled={!newClientId.trim() || addClientMutation.isPending}
              size="sm"
            >
              {addClientMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add
            </Button>
          </div>

          {(!status?.knownClientIds || status.knownClientIds.length === 0) ? (
            <p className="text-sm text-muted-foreground italic">No pre-authorized client IDs configured.</p>
          ) : (
            <div className="space-y-2">
              {status.knownClientIds.map((id) => (
                <div key={id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                  <span className="font-mono text-xs flex-1 break-all">{id}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeClientMutation.mutate(id)}
                    disabled={removeClientMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="w-4 h-4" />
            Connection Test
          </CardTitle>
          <CardDescription>
            Checks that the MCP /me route is registered and the bearer auth middleware is responding. A 401 result is expected and healthy — it means the route exists and auth is active. A 200 would indicate the token was accepted. Any other status (or a connection failure) indicates a configuration problem. This is an endpoint reachability check, not a full end-to-end OAuth token validation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            variant="outline"
          >
            {testMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FlaskConical className="w-4 h-4 mr-2" />
            )}
            Test connection
          </Button>

          {testResult && (
            <div className={`p-3 rounded-md border text-sm space-y-1 ${testResult.ok ? "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800" : "bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800"}`}>
              <div className="flex items-center gap-2 font-medium">
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
                {testResult.ok ? "Connection healthy" : "Connection issue"}
                {testResult.httpStatus && (
                  <Badge variant="outline" className="text-xs ml-auto">HTTP {testResult.httpStatus}</Badge>
                )}
              </div>
              <p className="text-muted-foreground text-xs">{testResult.message}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AiSettings() {
  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Brain className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">AI Settings</h1>
            <p className="text-muted-foreground">Manage AI model configuration and monitor usage across Constellation</p>
          </div>
        </div>

        <Tabs defaultValue="config" className="space-y-6">
          <TabsList>
            <TabsTrigger value="config" className="gap-2">
              <Settings className="w-4 h-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Usage & Costs
            </TabsTrigger>
            <TabsTrigger value="copilot" className="gap-2">
              <Link className="w-4 h-4" />
              Copilot Studio
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config">
            <ModelConfigSection />
          </TabsContent>

          <TabsContent value="usage">
            <UsageDashboardSection />
          </TabsContent>

          <TabsContent value="copilot">
            <div className="space-y-6">
              <AgentCardHealthCard />
              <CopilotStudioPanel />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
