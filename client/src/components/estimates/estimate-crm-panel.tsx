import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Handshake,
  Link2,
  Unlink,
  Plus,
  Search,
  Check,
  ExternalLink,
  Loader2,
  UserPlus,
  X,
  AlertTriangle,
} from "lucide-react";

interface EstimateCrmPanelProps {
  estimateId: string;
  estimateName: string;
  clientId: string;
  clientName: string;
  totalFees?: string | null;
}

interface CrmLinkData {
  crmEnabled: boolean;
  dealLinked: boolean;
  dealMapping?: { id: string; crmObjectId: string } | null;
  deal?: { id: string; dealName: string; amount: string | null; dealStageName: string; pipelineName: string } | null;
  companyLinked: boolean;
  companyMapping?: { id: string; crmObjectId: string } | null;
  company?: { id: string; name: string; domain: string | null; industry: string | null; city: string | null; state: string | null } | null;
  clientId?: string | null;
}

interface HubSpotDealResult {
  id: string;
  dealName: string;
  amount: string | null;
  dealStageName: string;
  pipelineName: string;
  isMapped: boolean;
}

interface HubSpotCompanyResult {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  isMapped: boolean;
}

interface HubSpotPipeline {
  id: string;
  label: string;
  stages: { id: string; label: string; probability: number }[];
}

export function EstimateCrmPanel({ estimateId, estimateName, clientId, clientName, totalFees }: EstimateCrmPanelProps) {
  const { toast } = useToast();

  // State for dialogs
  const [showLinkDealDialog, setShowLinkDealDialog] = useState(false);
  const [showCreateDealDialog, setShowCreateDealDialog] = useState(false);
  const [showLinkCompanyDialog, setShowLinkCompanyDialog] = useState(false);
  const [showCreateCompanyDialog, setShowCreateCompanyDialog] = useState(false);
  const [showCreateContactDialog, setShowCreateContactDialog] = useState(false);

  // Search state
  const [dealSearch, setDealSearch] = useState("");
  const [debouncedDealSearch, setDebouncedDealSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [selectedDealId, setSelectedDealId] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  // Create deal form
  const [newDealName, setNewDealName] = useState("");
  const [newDealAmount, setNewDealAmount] = useState("");
  const [newDealPipeline, setNewDealPipeline] = useState("");
  const [newDealStage, setNewDealStage] = useState("");

  // Create company form
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyDomain, setNewCompanyDomain] = useState("");
  const [newCompanyIndustry, setNewCompanyIndustry] = useState("");
  const [newCompanyPhone, setNewCompanyPhone] = useState("");

  // Create contact form
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactFirstName, setNewContactFirstName] = useState("");
  const [newContactLastName, setNewContactLastName] = useState("");
  const [newContactTitle, setNewContactTitle] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  // ---- Queries ----
  const { data: crmLink, isLoading } = useQuery<CrmLinkData>({
    queryKey: ["/api/estimates", estimateId, "crm-link"],
  });

  // Debounce deal search to avoid excessive HubSpot API calls on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDealSearch(dealSearch), 300);
    return () => clearTimeout(timer);
  }, [dealSearch]);

  const { data: dealsData } = useQuery<{ deals: HubSpotDealResult[] }>({
    queryKey: ["/api/crm/deals/search", debouncedDealSearch],
    queryFn: () => apiRequest(`/api/crm/deals/search?q=${encodeURIComponent(debouncedDealSearch)}`),
    enabled: showLinkDealDialog && debouncedDealSearch.length >= 2 && crmLink?.crmEnabled === true,
  });

  const { data: companiesData } = useQuery<{ companies: HubSpotCompanyResult[] }>({
    queryKey: ["/api/crm/companies", companySearch.trim()],
    queryFn: () => apiRequest(`/api/crm/companies?search=${encodeURIComponent(companySearch.trim())}`),
    enabled:
      showLinkCompanyDialog &&
      companySearch.trim().length >= 2 &&
      crmLink?.crmEnabled === true,
  });

  const { data: pipelines = [] } = useQuery<HubSpotPipeline[]>({
    queryKey: ["/api/crm/pipelines"],
    enabled: showCreateDealDialog && crmLink?.crmEnabled === true,
  });

  // ---- Mutations ----

  const linkDealMutation = useMutation({
    mutationFn: (dealId: string) =>
      apiRequest(`/api/crm/deals/${dealId}/link-estimate`, {
        method: "POST",
        body: JSON.stringify({ estimateId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "crm-link"] });
      setShowLinkDealDialog(false);
      setDealSearch("");
      setSelectedDealId("");
      toast({ title: "Estimate linked to HubSpot deal" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to link deal", description: error.message, variant: "destructive" });
    },
  });

  const unlinkDealMutation = useMutation({
    mutationFn: (dealId: string) =>
      apiRequest(`/api/crm/deals/${dealId}/unlink-estimate/${estimateId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "crm-link"] });
      toast({ title: "Deal unlinked from estimate" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to unlink deal", description: error.message, variant: "destructive" });
    },
  });

  const createDealMutation = useMutation({
    mutationFn: (data: { dealname: string; amount?: string; pipeline?: string; dealstage?: string; companyId?: string; linkEstimateId: string }) =>
      apiRequest("/api/crm/deals", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "crm-link"] });
      setShowCreateDealDialog(false);
      resetCreateDealForm();
      toast({ title: "HubSpot deal created and linked" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create deal", description: error.message, variant: "destructive" });
    },
  });

  const linkCompanyMutation = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest(`/api/crm/companies/${companyId}/link-client`, {
        method: "POST",
        body: JSON.stringify({ clientId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "crm-link"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "crm-link"] });
      setShowLinkCompanyDialog(false);
      setCompanySearch("");
      setSelectedCompanyId("");
      toast({ title: "Client linked to HubSpot company" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to link company", description: error.message, variant: "destructive" });
    },
  });

  const unlinkCompanyMutation = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest(`/api/crm/companies/${companyId}/unlink-client`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "crm-link"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "crm-link"] });
      toast({ title: "Company unlinked from client" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to unlink company", description: error.message, variant: "destructive" });
    },
  });

  const createCompanyMutation = useMutation({
    mutationFn: (data: { name: string; domain?: string; industry?: string; phone?: string; linkClientId: string }) =>
      apiRequest("/api/crm/companies", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "crm-link"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "crm-link"] });
      setShowCreateCompanyDialog(false);
      resetCreateCompanyForm();
      toast({ title: "HubSpot company created and linked to client" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create company", description: error.message, variant: "destructive" });
    },
  });

  const createContactMutation = useMutation({
    mutationFn: (data: { email: string; firstname?: string; lastname?: string; jobtitle?: string; phone?: string; companyId?: string }) =>
      apiRequest("/api/crm/contacts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setShowCreateContactDialog(false);
      resetCreateContactForm();
      toast({ title: "HubSpot contact created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create contact", description: error.message, variant: "destructive" });
    },
  });

  // ---- Helpers ----

  function resetCreateDealForm() {
    setNewDealName("");
    setNewDealAmount("");
    setNewDealPipeline("");
    setNewDealStage("");
  }

  function resetCreateCompanyForm() {
    setNewCompanyName("");
    setNewCompanyDomain("");
    setNewCompanyIndustry("");
    setNewCompanyPhone("");
  }

  function resetCreateContactForm() {
    setNewContactEmail("");
    setNewContactFirstName("");
    setNewContactLastName("");
    setNewContactTitle("");
    setNewContactPhone("");
  }

  function openCreateDealDialog() {
    setNewDealName(estimateName);
    setNewDealAmount(totalFees || "");
    setShowCreateDealDialog(true);
  }

  function openCreateCompanyDialog() {
    setNewCompanyName(clientName);
    setShowCreateCompanyDialog(true);
  }

  const selectedPipelineStages = pipelines.find(p => p.id === newDealPipeline)?.stages || [];

  // Don't render if CRM is not enabled or still loading
  if (isLoading) return null;
  if (!crmLink?.crmEnabled) return null;

  const formatAmount = (amount: string | null | undefined) => {
    if (!amount) return null;
    const num = parseFloat(amount);
    if (isNaN(num)) return amount;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(num);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-orange-500" />
            HubSpot CRM
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Prominent callout when this estimate has no linked deal */}
          {!crmLink.dealLinked && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Not linked to a HubSpot deal</p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">Link or create a deal below to track this estimate in HubSpot.</p>
              </div>
            </div>
          )}
          {/* Company/Client Link Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">Company</span>
              {crmLink.companyLinked ? (
                <Badge variant="outline" className="text-green-600 border-green-300 text-xs px-1.5 py-0">
                  <Check className="h-3 w-3 mr-0.5" />
                  Linked
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground text-xs px-1.5 py-0">
                  Not linked
                </Badge>
              )}
            </div>
            {crmLink.companyLinked && crmLink.company ? (
              <div className="ml-5 space-y-1">
                <p className="text-sm">{crmLink.company.name}</p>
                {crmLink.company.domain && (
                  <p className="text-xs text-muted-foreground">{crmLink.company.domain}</p>
                )}
                {crmLink.company.industry && (
                  <p className="text-xs text-muted-foreground">{crmLink.company.industry}</p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => {
                    if (confirm("Unlink this HubSpot company from the client?")) {
                      unlinkCompanyMutation.mutate(crmLink.companyMapping!.crmObjectId);
                    }
                  }}
                  disabled={unlinkCompanyMutation.isPending}
                >
                  <Unlink className="h-3 w-3 mr-1" />
                  Unlink
                </Button>
              </div>
            ) : (
              <div className="ml-5 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowLinkCompanyDialog(true)}>
                  <Link2 className="h-3 w-3 mr-1" />
                  Link Existing
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openCreateCompanyDialog}>
                  <Plus className="h-3 w-3 mr-1" />
                  Create in HubSpot
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* Deal/Estimate Link Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Handshake className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">Deal</span>
              {crmLink.dealLinked ? (
                <Badge variant="outline" className="text-green-600 border-green-300 text-xs px-1.5 py-0">
                  <Check className="h-3 w-3 mr-0.5" />
                  Linked
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground text-xs px-1.5 py-0">
                  Not linked
                </Badge>
              )}
            </div>
            {crmLink.dealLinked && crmLink.deal ? (
              <div className="ml-5 space-y-1">
                <p className="text-sm">{crmLink.deal.dealName}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {crmLink.deal.amount && (
                    <span>{formatAmount(crmLink.deal.amount)}</span>
                  )}
                  <span>{crmLink.deal.dealStageName}</span>
                  <span>{crmLink.deal.pipelineName}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => {
                    if (confirm("Unlink this HubSpot deal from the estimate?")) {
                      unlinkDealMutation.mutate(crmLink.dealMapping!.crmObjectId);
                    }
                  }}
                  disabled={unlinkDealMutation.isPending}
                >
                  <Unlink className="h-3 w-3 mr-1" />
                  Unlink
                </Button>
              </div>
            ) : (
              <div className="ml-5 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowLinkDealDialog(true)}>
                  <Link2 className="h-3 w-3 mr-1" />
                  Link Existing
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openCreateDealDialog}>
                  <Plus className="h-3 w-3 mr-1" />
                  Create in HubSpot
                </Button>
              </div>
            )}
          </div>

          {/* Create contact shortcut — only when company is linked */}
          {crmLink.companyLinked && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">Contact</span>
                </div>
                <div className="ml-5">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowCreateContactDialog(true)}>
                    <Plus className="h-3 w-3 mr-1" />
                    Create Contact in HubSpot
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ====== Link Deal Dialog ====== */}
      <Dialog open={showLinkDealDialog} onOpenChange={(open) => { if (!open) { setShowLinkDealDialog(false); setDealSearch(""); setSelectedDealId(""); } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Link HubSpot Deal</DialogTitle>
            <DialogDescription>Search for an existing deal to link to this estimate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Search Deals</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by deal name..."
                  value={dealSearch}
                  onChange={(e) => setDealSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto border rounded-md">
              {dealSearch.length < 2 ? (
                <p className="text-sm text-muted-foreground p-3 text-center">Type at least 2 characters to search</p>
              ) : dealsData?.deals?.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 text-center">No deals found</p>
              ) : (
                dealsData?.deals?.map((deal) => (
                  <div
                    key={deal.id}
                    className={`flex items-center justify-between p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 ${selectedDealId === deal.id ? "bg-primary/10" : ""} ${deal.isMapped ? "opacity-50" : ""}`}
                    onClick={() => !deal.isMapped && setSelectedDealId(deal.id)}
                  >
                    <div>
                      <p className="text-sm font-medium">{deal.dealName}</p>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        {deal.amount && <span>{formatAmount(deal.amount)}</span>}
                        <span>{deal.dealStageName}</span>
                        <span>{deal.pipelineName}</span>
                      </div>
                    </div>
                    {deal.isMapped && (
                      <Badge variant="secondary" className="text-xs shrink-0">Already linked</Badge>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Can't find it?</span>
              <Button variant="link" size="sm" className="h-auto p-0 text-sm" onClick={() => { setShowLinkDealDialog(false); openCreateDealDialog(); }}>
                Create a new deal in HubSpot
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLinkDealDialog(false); setDealSearch(""); setSelectedDealId(""); }}>Cancel</Button>
            <Button disabled={!selectedDealId || linkDealMutation.isPending} onClick={() => linkDealMutation.mutate(selectedDealId)}>
              {linkDealMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
              Link Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== Create Deal Dialog ====== */}
      <Dialog open={showCreateDealDialog} onOpenChange={(open) => { if (!open) { setShowCreateDealDialog(false); resetCreateDealForm(); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create HubSpot Deal</DialogTitle>
            <DialogDescription>Create a new deal in HubSpot and link it to this estimate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Deal Name <span className="text-destructive">*</span></Label>
              <Input value={newDealName} onChange={(e) => setNewDealName(e.target.value)} placeholder="Deal name" />
            </div>
            <div className="space-y-2">
              <Label>Amount ($)</Label>
              <Input type="number" step="0.01" value={newDealAmount} onChange={(e) => setNewDealAmount(e.target.value)} placeholder="e.g. 50000" />
            </div>
            {pipelines.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label>Pipeline</Label>
                  <Select value={newDealPipeline} onValueChange={(val) => { setNewDealPipeline(val); setNewDealStage(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select pipeline" />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelines.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedPipelineStages.length > 0 && (
                  <div className="space-y-2">
                    <Label>Stage</Label>
                    <Select value={newDealStage} onValueChange={setNewDealStage}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedPipelineStages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.label} ({Math.round(s.probability * 100)}%)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDealDialog(false); resetCreateDealForm(); }}>Cancel</Button>
            <Button
              disabled={!newDealName.trim() || createDealMutation.isPending}
              onClick={() => {
                createDealMutation.mutate({
                  dealname: newDealName.trim(),
                  amount: newDealAmount || undefined,
                  pipeline: newDealPipeline || undefined,
                  dealstage: newDealStage || undefined,
                  companyId: crmLink?.companyMapping?.crmObjectId || undefined,
                  linkEstimateId: estimateId,
                });
              }}
            >
              {createDealMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create & Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== Link Company Dialog ====== */}
      <Dialog open={showLinkCompanyDialog} onOpenChange={(open) => { if (!open) { setShowLinkCompanyDialog(false); setCompanySearch(""); setSelectedCompanyId(""); } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Link HubSpot Company</DialogTitle>
            <DialogDescription>Search for an existing company to link to <strong>{clientName}</strong>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Search Companies</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by company name..."
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto border rounded-md">
              {companiesData?.companies?.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 text-center">No companies found</p>
              ) : (
                companiesData?.companies?.map((company) => (
                  <div
                    key={company.id}
                    className={`flex items-center justify-between p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 ${selectedCompanyId === company.id ? "bg-primary/10" : ""} ${company.isMapped ? "opacity-50" : ""}`}
                    onClick={() => !company.isMapped && setSelectedCompanyId(company.id)}
                  >
                    <div>
                      <p className="text-sm font-medium">{company.name}</p>
                      {company.domain && <p className="text-xs text-muted-foreground">{company.domain}</p>}
                      {company.industry && <p className="text-xs text-muted-foreground">{company.industry}</p>}
                    </div>
                    {company.isMapped && (
                      <Badge variant="secondary" className="text-xs shrink-0">Already linked</Badge>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Can't find it?</span>
              <Button variant="link" size="sm" className="h-auto p-0 text-sm" onClick={() => { setShowLinkCompanyDialog(false); openCreateCompanyDialog(); }}>
                Create a new company in HubSpot
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLinkCompanyDialog(false); setCompanySearch(""); setSelectedCompanyId(""); }}>Cancel</Button>
            <Button disabled={!selectedCompanyId || linkCompanyMutation.isPending} onClick={() => linkCompanyMutation.mutate(selectedCompanyId)}>
              {linkCompanyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
              Link Company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== Create Company Dialog ====== */}
      <Dialog open={showCreateCompanyDialog} onOpenChange={(open) => { if (!open) { setShowCreateCompanyDialog(false); resetCreateCompanyForm(); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create HubSpot Company</DialogTitle>
            <DialogDescription>Create a new company in HubSpot and link it to <strong>{clientName}</strong>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name <span className="text-destructive">*</span></Label>
              <Input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="Company name" />
            </div>
            <div className="space-y-2">
              <Label>Domain</Label>
              <Input value={newCompanyDomain} onChange={(e) => setNewCompanyDomain(e.target.value)} placeholder="e.g. acme.com" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input value={newCompanyIndustry} onChange={(e) => setNewCompanyIndustry(e.target.value)} placeholder="e.g. Technology" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={newCompanyPhone} onChange={(e) => setNewCompanyPhone(e.target.value)} placeholder="e.g. (555) 123-4567" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateCompanyDialog(false); resetCreateCompanyForm(); }}>Cancel</Button>
            <Button
              disabled={!newCompanyName.trim() || createCompanyMutation.isPending}
              onClick={() => {
                createCompanyMutation.mutate({
                  name: newCompanyName.trim(),
                  domain: newCompanyDomain || undefined,
                  industry: newCompanyIndustry || undefined,
                  phone: newCompanyPhone || undefined,
                  linkClientId: clientId,
                });
              }}
            >
              {createCompanyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create & Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== Create Contact Dialog ====== */}
      <Dialog open={showCreateContactDialog} onOpenChange={(open) => { if (!open) { setShowCreateContactDialog(false); resetCreateContactForm(); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create HubSpot Contact</DialogTitle>
            <DialogDescription>
              Create a new contact in HubSpot
              {crmLink?.company ? ` associated with ${crmLink.company.name}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} placeholder="contact@example.com" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input value={newContactFirstName} onChange={(e) => setNewContactFirstName(e.target.value)} placeholder="First name" />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input value={newContactLastName} onChange={(e) => setNewContactLastName(e.target.value)} placeholder="Last name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Job Title</Label>
                <Input value={newContactTitle} onChange={(e) => setNewContactTitle(e.target.value)} placeholder="e.g. Director of IT" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} placeholder="e.g. (555) 123-4567" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateContactDialog(false); resetCreateContactForm(); }}>Cancel</Button>
            <Button
              disabled={!newContactEmail.trim() || createContactMutation.isPending}
              onClick={() => {
                createContactMutation.mutate({
                  email: newContactEmail.trim(),
                  firstname: newContactFirstName || undefined,
                  lastname: newContactLastName || undefined,
                  jobtitle: newContactTitle || undefined,
                  phone: newContactPhone || undefined,
                  companyId: crmLink?.companyMapping?.crmObjectId || undefined,
                });
              }}
            >
              {createContactMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Create Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
