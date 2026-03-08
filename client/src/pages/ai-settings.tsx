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

  const isInitialized = selectedProvider !== "";

  if (config && !isInitialized) {
    setSelectedProvider(config.activeProvider);
    setSelectedModel(config.activeModel);
    setEnableStreaming(config.enableStreaming ?? true);
    setMaxTokens(String(config.maxTokensPerRequest || 4096));
    setMonthlyBudget(config.monthlyTokenBudget ? String(config.monthlyTokenBudget) : "");
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
    updateMutation.mutate({
      activeProvider: selectedProvider,
      activeModel: selectedModel,
      enableStreaming,
      maxTokensPerRequest: parseInt(maxTokens, 10) || 4096,
      monthlyTokenBudget: monthlyBudget ? parseInt(monthlyBudget, 10) : null,
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
          </TabsList>

          <TabsContent value="config">
            <ModelConfigSection />
          </TabsContent>

          <TabsContent value="usage">
            <UsageDashboardSection />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
