import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Sparkles, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Info, DollarSign, Clock, Users, ArrowLeft } from "lucide-react";

interface GeneratedEstimateStructure {
  estimateType: 'detailed' | 'program' | 'block' | 'retainer';
  commercialScheme: string;
  epics: Array<{
    name: string;
    order: number;
    stages: Array<{
      name: string;
      order: number;
      lineItems: Array<{
        description: string;
        role: string;
        hours: number;
        rate: number;
        costRate: number;
        isSalaried: boolean;
        notes?: string;
      }>;
    }>;
  }>;
  summary: {
    totalHours: number;
    totalFees: number;
    totalCost: number;
    marginPercent: number;
    projectSize: string;
    suggestedDurationWeeks: number;
  };
}

interface NarrativeEstimateGeneratorProps {
  open: boolean;
  onClose: () => void;
}

export function NarrativeEstimateGenerator({ open, onClose }: NarrativeEstimateGeneratorProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<'input' | 'generating' | 'preview'>('input');
  const [narrativeText, setNarrativeText] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [estimateName, setEstimateName] = useState('');
  const [industry, setIndustry] = useState('');
  const [constraints, setConstraints] = useState('');
  const [generatedEstimate, setGeneratedEstimate] = useState<GeneratedEstimateStructure | null>(null);
  const [unmatchedRoles, setUnmatchedRoles] = useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Array<{ id: string; name: string; rackRate: number; costRate: number; isSalaried: boolean }>>([]);
  const [hasGroundingDoc, setHasGroundingDoc] = useState(true);
  const [roleRemapping, setRoleRemapping] = useState<Record<string, string>>({});
  const [expandedEpics, setExpandedEpics] = useState<Set<number>>(new Set());

  const { data: clients } = useQuery<any[]>({
    queryKey: ['/api/clients'],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('/api/ai/generate-estimate-from-narrative', {
        method: 'POST',
        body: JSON.stringify({
          narrativeText: narrativeText || undefined,
          projectDescription: projectDescription || narrativeText.substring(0, 500) || undefined,
          clientName: clientName || undefined,
          industry: industry || undefined,
          constraints: constraints || undefined,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedEstimate(data.estimate);
      setUnmatchedRoles(data.unmatchedRoles || []);
      setAvailableRoles(data.availableRoles || []);
      setHasGroundingDoc(data.hasGroundingDoc ?? true);
      setExpandedEpics(new Set(data.estimate.epics.map((_: any, i: number) => i)));
      setStep('preview');
    },
    onError: (error: any) => {
      toast({ title: "Generation Failed", description: error.message || "Failed to generate estimate from narrative", variant: "destructive" });
      setStep('input');
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!generatedEstimate) throw new Error("No estimate to apply");

      const epicsWithRemapping = generatedEstimate.epics.map(epic => ({
        ...epic,
        stages: epic.stages.map(stage => ({
          ...stage,
          lineItems: stage.lineItems.map(li => {
            const remappedRoleName = roleRemapping[li.role];
            if (remappedRoleName) {
              const remappedRole = availableRoles.find(r => r.name === remappedRoleName);
              if (remappedRole) {
                return {
                  ...li,
                  role: remappedRole.name,
                  roleId: remappedRole.id,
                  rate: remappedRole.rackRate,
                  costRate: remappedRole.costRate,
                  isSalaried: remappedRole.isSalaried,
                };
              }
            }
            const matchedRole = availableRoles.find(r => r.name === li.role);
            return matchedRole ? { ...li, roleId: matchedRole.id } : li;
          }),
        })),
      }));

      const res = await apiRequest('/api/ai/generate-estimate-from-narrative/apply', {
        method: 'POST',
        body: JSON.stringify({
          name: estimateName || `AI-Generated Estimate — ${clientName || 'New'}`,
          clientId: clientId || undefined,
          estimateType: generatedEstimate.estimateType,
          commercialScheme: generatedEstimate.commercialScheme,
          epics: epicsWithRemapping,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Estimate Created", description: "Your estimate has been created from the narrative." });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      onClose();
      resetState();
      navigate(`/estimates/${data.estimateId}`);
    },
    onError: (error: any) => {
      toast({ title: "Creation Failed", description: error.message || "Failed to create estimate", variant: "destructive" });
    },
  });

  const resetState = () => {
    setStep('input');
    setNarrativeText('');
    setProjectDescription('');
    setClientId('');
    setClientName('');
    setEstimateName('');
    setIndustry('');
    setConstraints('');
    setGeneratedEstimate(null);
    setUnmatchedRoles([]);
    setRoleRemapping({});
    setExpandedEpics(new Set());
  };

  const handleGenerate = () => {
    if (!narrativeText && !projectDescription) {
      toast({ title: "Input Required", description: "Please paste a narrative or enter a project description.", variant: "destructive" });
      return;
    }
    setStep('generating');
    generateMutation.mutate();
  };

  const toggleEpic = (index: number) => {
    const next = new Set(expandedEpics);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setExpandedEpics(next);
  };

  const formatCurrency = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); resetState(); } }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Generate Estimate from Narrative
          </DialogTitle>
          <DialogDescription>
            Paste a proposal, SOW, or project description and let AI build a structured estimate with epics, stages, and line items.
          </DialogDescription>
        </DialogHeader>

        {step === 'input' && (
          <div className="space-y-4">
            <div>
              <Label>Estimate Name</Label>
              <Input
                value={estimateName}
                onChange={(e) => setEstimateName(e.target.value)}
                placeholder="e.g., DaVita Runway Lift - Phase 1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Client</Label>
                <Select value={clientId} onValueChange={(v) => {
                  setClientId(v);
                  const c = clients?.find((c: any) => c.id === v);
                  if (c) setClientName(c.name);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select client (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Industry</Label>
                <Input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g., Healthcare, Financial Services"
                />
              </div>
            </div>

            <div>
              <Label>Project Narrative / SOW Text</Label>
              <Textarea
                value={narrativeText}
                onChange={(e) => setNarrativeText(e.target.value)}
                placeholder="Paste the proposal narrative, SOW, or project description here. The AI will analyze it and generate a structured estimate with epics, stages, roles, and hours..."
                className="min-h-[250px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {narrativeText.length > 0 ? `${narrativeText.length.toLocaleString()} characters` : 'Supports up to 100,000 characters'}
              </p>
            </div>

            <div>
              <Label>Additional Constraints or Notes</Label>
              <Textarea
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                placeholder="e.g., Budget cap of $200K, must complete within 12 weeks, exclude training phase..."
                className="min-h-[60px]"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { onClose(); resetState(); }}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={!narrativeText && !projectDescription}>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Estimate
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-purple-500" />
            <p className="text-lg font-medium">Analyzing narrative and building estimate...</p>
            <p className="text-sm text-muted-foreground">This may take 15-30 seconds for large documents</p>
          </div>
        )}

        {step === 'preview' && generatedEstimate && (
          <div className="space-y-4">
            {!hasGroundingDoc && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-blue-700 dark:text-blue-300">Tip: Upload your estimation methodology</p>
                  <p className="text-blue-600 dark:text-blue-400">
                    For best results, upload your estimation methodology document in Grounding Docs under the "Estimate Generation & WBS Methodology" category. This teaches the AI your specific roles, rates, and project structure patterns.
                  </p>
                </div>
              </div>
            )}

            {unmatchedRoles.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm w-full">
                  <p className="font-medium text-amber-700 dark:text-amber-300">
                    {unmatchedRoles.length} role{unmatchedRoles.length > 1 ? 's' : ''} not found in your catalog
                  </p>
                  <p className="text-amber-600 dark:text-amber-400 mb-2">
                    Remap them to existing roles before creating the estimate:
                  </p>
                  <div className="space-y-2">
                    {unmatchedRoles.map((role) => (
                      <div key={role} className="flex items-center gap-2">
                        <Badge variant="outline" className="text-amber-700 border-amber-300 shrink-0">{role}</Badge>
                        <span className="text-muted-foreground shrink-0">→</span>
                        <Select
                          value={roleRemapping[role] || ''}
                          onValueChange={(v) => setRoleRemapping(prev => ({ ...prev, [role]: v }))}
                        >
                          <SelectTrigger className="h-8 w-[200px]">
                            <SelectValue placeholder="Select role..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableRoles.map(r => (
                              <SelectItem key={r.id} value={r.name}>{r.name} (${r.rackRate}/hr)</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Clock className="w-4 h-4" /> Total Hours
                  </div>
                  <p className="text-2xl font-bold">{generatedEstimate.summary.totalHours.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <DollarSign className="w-4 h-4" /> Total Fees
                  </div>
                  <p className="text-2xl font-bold">{formatCurrency(generatedEstimate.summary.totalFees)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <CheckCircle2 className="w-4 h-4" /> Margin
                  </div>
                  <p className="text-2xl font-bold">{generatedEstimate.summary.marginPercent.toFixed(1)}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Users className="w-4 h-4" /> Duration
                  </div>
                  <p className="text-2xl font-bold">{generatedEstimate.summary.suggestedDurationWeeks}w</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <Badge variant="secondary">{generatedEstimate.estimateType.replace('_', ' ')}</Badge>
              <Badge variant="outline">{generatedEstimate.commercialScheme.replace(/_/g, ' ')}</Badge>
              <Badge variant="outline">{generatedEstimate.summary.projectSize} project</Badge>
              <span className="text-muted-foreground">{generatedEstimate.epics.length} epics</span>
            </div>

            <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
              {generatedEstimate.epics.map((epic, ei) => {
                const epicHours = epic.stages.reduce((s, st) => s + st.lineItems.reduce((s2, li) => s2 + li.hours, 0), 0);
                const epicFees = epic.stages.reduce((s, st) => s + st.lineItems.reduce((s2, li) => s2 + li.hours * li.rate, 0), 0);
                const isExpanded = expandedEpics.has(ei);

                return (
                  <Collapsible key={ei} open={isExpanded} onOpenChange={() => toggleEpic(ei)}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50 text-left">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="font-medium">{epic.name}</span>
                        <Badge variant="outline" className="text-xs">{epic.stages.length} stages</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{epicHours.toFixed(0)} hrs</span>
                        <span>{formatCurrency(epicFees)}</span>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {epic.stages.map((stage, si) => (
                        <div key={si} className="ml-6 border-l-2 border-muted pl-4 py-2">
                          <p className="text-sm font-medium text-muted-foreground mb-2">{stage.name}</p>
                          <div className="space-y-1">
                            {stage.lineItems.map((li, lii) => {
                              const isUnmatched = unmatchedRoles.includes(li.role) && !roleRemapping[li.role];
                              return (
                                <div key={lii} className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-muted/30">
                                  <div className="flex-1 min-w-0">
                                    <span className="truncate">{li.description}</span>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0 ml-4">
                                    <span className={`text-xs px-2 py-0.5 rounded ${isUnmatched ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : 'bg-muted'}`}>
                                      {roleRemapping[li.role] || li.role}
                                    </span>
                                    <span className="w-16 text-right">{li.hours}h</span>
                                    <span className="w-20 text-right text-muted-foreground">${li.rate}/hr</span>
                                    <span className="w-20 text-right font-medium">{formatCurrency(li.hours * li.rate)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('input')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Edit
              </Button>
              <Button
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending || (unmatchedRoles.length > 0 && unmatchedRoles.some(r => !roleRemapping[r]))}
              >
                {applyMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Create Estimate
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
