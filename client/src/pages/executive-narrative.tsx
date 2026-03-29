import { useState } from "react";
import { useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Calendar,
  Loader2,
  Copy,
  Download,
  TrendingUp,
  Users,
  DollarSign,
  AlertTriangle,
  FolderOpen,
  Target,
  Brain,
} from "lucide-react";

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultDateRange() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: formatLocalDate(firstOfMonth),
    endDate: formatLocalDate(lastOfMonth),
  };
}

interface NarrativeStats {
  totalHours: number;
  billableHours: number;
  totalRevenue: number;
  totalExpenses: number;
  activeProjects: number;
  estimatesCreated: number;
  milestonesCompleted: number;
  openRisks: number;
  openIssues: number;
}

interface NarrativeResponse {
  narrative: string;
  period: { startDate: string; endDate: string };
  stats: NarrativeStats;
}

export default function ExecutiveNarrative() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const defaults = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [result, setResult] = useState<NarrativeResponse | null>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/reports/executive-narrative", {
        method: "POST",
        body: JSON.stringify({ startDate, endDate }),
      });
      return res as NarrativeResponse;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "Narrative Generated", description: "Your executive summary is ready." });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Could not generate the executive narrative.",
        variant: "destructive",
      });
    },
  });

  const handleCopy = async () => {
    if (!result?.narrative) return;
    await navigator.clipboard.writeText(result.narrative);
    toast({ title: "Copied", description: "Narrative copied to clipboard." });
  };

  const handleDownload = () => {
    if (!result?.narrative) return;
    const blob = new Blob([result.narrative], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `executive-narrative-${result.period.startDate}-to-${result.period.endDate}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = result?.stats;

  return (
    <Layout>
      <Helmet>
        <title>Executive Narrative | Constellation</title>
      </Helmet>

      <div className="container mx-auto max-w-5xl py-8 px-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Executive Narrative</h1>
            <p className="text-sm text-muted-foreground">
              AI-generated practice summary across all clients, projects, and estimates.
              Powered by AI-assisted analysis.
            </p>
          </div>
        </div>

        {/* Date range + generate */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Reporting Period
            </CardTitle>
            <CardDescription>Select the date range for the narrative summary.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || !startDate || !endDate}
                className="min-w-[160px]"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Narrative
                  </>
                )}
              </Button>
            </div>
            {generateMutation.isPending && (
              <p className="text-sm text-muted-foreground mt-3">
                Aggregating data and generating narrative. This may take 30–60 seconds...
              </p>
            )}
          </CardContent>
        </Card>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Billable Hours" value={stats.billableHours.toFixed(1)} />
            <StatCard icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={`$${stats.totalRevenue.toLocaleString()}`} />
            <StatCard icon={<FolderOpen className="h-4 w-4" />} label="Active Projects" value={String(stats.activeProjects)} />
            <StatCard icon={<Target className="h-4 w-4" />} label="Milestones Done" value={String(stats.milestonesCompleted)} />
            <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Open Risks" value={String(stats.openRisks)} />
          </div>
        )}

        {/* Narrative output */}
        {result?.narrative && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Generated Narrative</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
              <CardDescription>
                Period: {result.period.startDate} to {result.period.endDate}
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              <SafeMarkdown content={result.narrative} />
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-lg font-semibold">{value}</p>
    </Card>
  );
}

function SafeMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-2 ml-4 list-disc space-y-1">
          {listItems.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ul>
      );
      listItems = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h1 = line.match(/^# (.+)$/);
    const h2 = line.match(/^## (.+)$/);
    const h3 = line.match(/^### (.+)$/);
    const li = line.match(/^[-*] (.+)$/);
    if (h3) { flushList(); elements.push(<h3 key={i} className="text-base font-semibold mt-4 mb-1">{renderInline(h3[1])}</h3>); }
    else if (h2) { flushList(); elements.push(<h2 key={i} className="text-lg font-semibold mt-6 mb-2">{renderInline(h2[1])}</h2>); }
    else if (h1) { flushList(); elements.push(<h1 key={i} className="text-xl font-bold mt-6 mb-2">{renderInline(h1[1])}</h1>); }
    else if (li) { listItems.push(li[1]); }
    else if (line.trim() === "") { flushList(); }
    else { flushList(); elements.push(<p key={i} className="mb-2">{renderInline(line)}</p>); }
  }
  flushList();
  return <div className="prose prose-sm dark:prose-invert max-w-none">{elements}</div>;
}

function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2]) parts.push(<strong key={match.index}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={match.index}>{match[3]}</em>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
