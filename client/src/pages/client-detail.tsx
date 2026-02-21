import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { 
  ArrowLeft,
  Building2, 
  Edit,
  Save,
  X,
  Mail,
  MapPin,
  DollarSign,
  Calendar,
  Users,
  FileText,
  Receipt,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Filter,
  UserPlus,
  Trash2,
  UserCircle
} from "lucide-react";
import { Link } from "wouter";
import { Client, Project, InvoiceBatch, Sow } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ClientRateOverridesSection } from "@/components/ClientRateOverridesSection";

type ProjectWithClient = Project & { client: Client };
type InvoiceBatchWithDetails = InvoiceBatch & {
  totalLinesCount: number;
  clientCount: number;
  projectCount: number;
};

interface VocabularyCatalogTerm {
  id: string;
  termType: 'epic' | 'stage' | 'activity' | 'workstream';
  termValue: string;
  description: string | null;
  displayOrder: number;
  createdAt: string;
}

interface OrganizationVocabularySelection {
  id: string;
  epicTermId: string | null;
  stageTermId: string | null;
  activityTermId: string | null;
  workstreamTermId: string | null;
  createdAt: string;
  updatedAt: string;
}

type ClientEditForm = Partial<Client> & {
  vocabularyEpic?: string;
  vocabularyStage?: string;
  vocabularyActivity?: string;
  vocabularyWorkstream?: string;
};

function ClientCrmLink({ clientId }: { clientId: string }) {
  const { toast } = useToast();

  interface CrmLinkData {
    linked: boolean;
    crmEnabled: boolean;
    mapping?: { id: string; crmObjectId: string };
    company?: { id: string; name: string; domain: string | null; industry: string | null; city: string | null; state: string | null; phone: string | null; website: string | null };
  }

  interface HubSpotCompanyItem {
    id: string;
    name: string;
    domain: string | null;
    industry: string | null;
    isMapped: boolean;
  }

  const { data: crmLink, isLoading } = useQuery<CrmLinkData>({
    queryKey: ["/api/clients", clientId, "crm-link"],
    queryFn: () => fetch(`/api/clients/${clientId}/crm-link`).then(r => r.json()),
  });

  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  const { data: companiesData } = useQuery<{ companies: HubSpotCompanyItem[] }>({
    queryKey: ["/api/crm/companies", companySearch],
    queryFn: () => fetch(`/api/crm/companies?search=${encodeURIComponent(companySearch)}`).then(r => r.json()),
    enabled: showLinkDialog && crmLink?.crmEnabled === true,
  });

  const linkMutation = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest(`/api/crm/companies/${companyId}/link-client`, {
        method: "POST",
        body: JSON.stringify({ clientId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "crm-link"] });
      setShowLinkDialog(false);
      toast({ title: "HubSpot company linked" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to link", description: error.message, variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest(`/api/crm/companies/${companyId}/unlink-client`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "crm-link"] });
      toast({ title: "HubSpot company unlinked" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to unlink", description: error.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: (data: { companyId: string; direction: string }) =>
      apiRequest(`/api/crm/companies/${data.companyId}/sync`, {
        method: "POST",
        body: JSON.stringify({ direction: data.direction }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "crm-link"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      toast({ title: "Sync complete" });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return null;
  if (!crmLink?.crmEnabled) return null;

  return (
    <>
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            HubSpot CRM
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {crmLink?.linked && crmLink.company ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-green-600 border-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Linked
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{crmLink.company.name}</p>
                {crmLink.company.domain && (
                  <p className="text-xs text-muted-foreground">{crmLink.company.domain}</p>
                )}
                {crmLink.company.industry && (
                  <p className="text-xs text-muted-foreground">{crmLink.company.industry}</p>
                )}
                {(crmLink.company.city || crmLink.company.state) && (
                  <p className="text-xs text-muted-foreground">
                    {[crmLink.company.city, crmLink.company.state].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncMutation.mutate({ companyId: crmLink.mapping!.crmObjectId, direction: "from_hubspot" })}
                  disabled={syncMutation.isPending}
                >
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Sync from HubSpot
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm("Unlink this HubSpot company from this client?")) {
                      unlinkMutation.mutate(crmLink.mapping!.crmObjectId);
                    }
                  }}
                  disabled={unlinkMutation.isPending}
                >
                  <X className="h-3 w-3 mr-1" />
                  Unlink
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No HubSpot company linked to this client.
              </p>
              <Button variant="outline" size="sm" onClick={() => setShowLinkDialog(true)}>
                <UserPlus className="h-4 w-4 mr-1" />
                Link HubSpot Company
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link HubSpot Company</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Search HubSpot Companies</Label>
              <Input
                placeholder="Type to search..."
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
              />
            </div>
            <div className="max-h-60 overflow-y-auto border rounded-md">
              {companiesData?.companies?.map((company) => (
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
                    <Badge variant="secondary" className="text-xs">Already linked</Badge>
                  )}
                </div>
              ))}
              {companiesData?.companies?.length === 0 && (
                <p className="text-sm text-muted-foreground p-3 text-center">No companies found</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>Cancel</Button>
            <Button
              disabled={!selectedCompanyId || linkMutation.isPending}
              onClick={() => linkMutation.mutate(selectedCompanyId)}
            >
              {linkMutation.isPending ? "Linking..." : "Link Company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ClientDetail() {
  const { id: clientId } = useParams<{ id: string }>();
  const [location, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<ClientEditForm>({});
  const [invoiceYearFilter, setInvoiceYearFilter] = useState<string>("all");
  const [showAddStakeholder, setShowAddStakeholder] = useState(false);
  const [stakeholderForm, setStakeholderForm] = useState({ email: '', name: '', stakeholderTitle: '' });
  const [matchedUser, setMatchedUser] = useState<{ id: string; name: string; email: string } | null>(null);

  const { toast } = useToast();

  // Fetch client details
  const { data: client, isLoading: clientLoading, error: clientError } = useQuery<Client>({
    queryKey: ["/api/clients", clientId],
    enabled: !!clientId
  });

  // Fetch vocabulary catalog (all available terms)
  const { data: catalogTerms = [] } = useQuery<VocabularyCatalogTerm[]>({
    queryKey: ["/api/vocabulary/catalog"],
  });

  // Fetch organization vocabulary selections (to show defaults)
  const { data: orgSelections } = useQuery<OrganizationVocabularySelection>({
    queryKey: ["/api/vocabulary/organization/selections"],
  });

  // Organize catalog terms by type
  const epicTerms = catalogTerms.filter(t => t.termType === 'epic').sort((a, b) => a.displayOrder - b.displayOrder);
  const stageTerms = catalogTerms.filter(t => t.termType === 'stage').sort((a, b) => a.displayOrder - b.displayOrder);
  const activityTerms = catalogTerms.filter(t => t.termType === 'activity').sort((a, b) => a.displayOrder - b.displayOrder);
  const workstreamTerms = catalogTerms.filter(t => t.termType === 'workstream').sort((a, b) => a.displayOrder - b.displayOrder);

  // Get term value by ID for display purposes
  const getTermValue = (termId: string | null | undefined): string => {
    if (!termId) return '';
    const term = catalogTerms.find(t => t.id === termId);
    return term ? term.termValue : '';
  };

  // Auto-enter edit mode if ?edit=true is in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('edit') === 'true' && client) {
      // Populate form with client data
      setEditForm({
        name: client.name,
        status: client.status,
        billingContact: client.billingContact || "",
        contactName: client.contactName || "",
        contactAddress: client.contactAddress || "",
        secondaryContactName: client.secondaryContactName || "",
        secondaryContactEmail: client.secondaryContactEmail || "",
        currency: client.currency,
        paymentTerms: client.paymentTerms || "",
        paymentMethod: client.paymentMethod || "ACH Transfer",
        msaDate: client.msaDate || "",
        sinceDate: client.sinceDate || "",
        hasMsa: client.hasMsa || false,
        msaDocument: client.msaDocument || "",
        ndaDate: client.ndaDate || "",
        hasNda: client.hasNda || false,
        ndaDocument: client.ndaDocument || "",
        epicTermId: client.epicTermId || null,
        stageTermId: client.stageTermId || null,
        activityTermId: client.activityTermId || null,
        workstreamTermId: client.workstreamTermId || null,
      });
      setIsEditing(true);
      // Clean the URL by removing the edit parameter
      urlParams.delete('edit');
      const newSearch = urlParams.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
      window.history.replaceState({}, '', newUrl);
    }
  }, [client]);

  // Fetch client projects
  const { data: allProjects = [] } = useQuery<ProjectWithClient[]>({
    queryKey: ["/api/projects"]
  });

  const clientProjects = allProjects.filter(p => p.clientId === clientId);

  // Fetch client SOWs
  const { data: allSows = [] } = useQuery<Sow[]>({
    queryKey: ["/api/sows"]
  });

  const clientSows = allSows.filter(sow => 
    clientProjects.some(project => project.id === sow.projectId)
  );

  // Fetch invoice batches for this specific client
  const { data: clientBatches = [] } = useQuery<InvoiceBatchWithDetails[]>({
    queryKey: ["/api/clients", clientId, "invoice-batches"],
    enabled: !!clientId
  });

  const { data: stakeholders = [], isLoading: stakeholdersLoading } = useQuery<any[]>({
    queryKey: ["/api/clients", clientId, "stakeholders"],
    enabled: !!clientId
  });

  const { data: allPlatformUsers = [], isError: usersQueryError } = useQuery<{ id: string; name: string; email: string }[]>({
    queryKey: ["/api/users?includeInactive=true&includeStakeholders=true"],
    enabled: showAddStakeholder,
  });

  const addStakeholderMutation = useMutation({
    mutationFn: async (data: { email: string; name: string; stakeholderTitle: string }) => {
      return apiRequest(`/api/clients/${clientId}/stakeholders`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "stakeholders"] });
      toast({ title: "Stakeholder added", description: "Client stakeholder has been added successfully" });
      setShowAddStakeholder(false);
      setStakeholderForm({ email: '', name: '', stakeholderTitle: '' });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeStakeholderMutation = useMutation({
    mutationFn: async (stakeholderId: string) => {
      return apiRequest(`/api/clients/${clientId}/stakeholders/${stakeholderId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "stakeholders"] });
      toast({ title: "Stakeholder removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getEffectiveDate = (batch: InvoiceBatchWithDetails) => {
    return batch.asOfDate || (batch.finalizedAt ? new Date(batch.finalizedAt).toISOString().split('T')[0] : null) || new Date(batch.createdAt).toISOString().split('T')[0];
  };

  const invoiceAvailableYears = useMemo(() => {
    const years = new Set<string>();
    clientBatches.forEach(batch => {
      const d = getEffectiveDate(batch);
      if (d) years.add(new Date(d + 'T00:00:00').getFullYear().toString());
    });
    return Array.from(years).sort().reverse();
  }, [clientBatches]);

  const invoiceFilteredBatches = useMemo(() => {
    if (invoiceYearFilter === 'all') return clientBatches;
    return clientBatches.filter(batch => {
      const d = getEffectiveDate(batch);
      return d && new Date(d + 'T00:00:00').getFullYear().toString() === invoiceYearFilter;
    });
  }, [clientBatches, invoiceYearFilter]);

  const invoiceTotals = useMemo(() => {
    let totalAmount = 0;
    let totalTax = 0;
    let totalPaid = 0;
    let count = 0;
    for (const batch of invoiceFilteredBatches) {
      if (batch.status !== 'finalized') continue;
      const base = Number(batch.totalAmount || 0) - Number(batch.discountAmount || 0);
      const tax = batch.taxAmountOverride != null ? Number(batch.taxAmountOverride) : (batch.taxAmount != null ? Number(batch.taxAmount) : 0);
      totalAmount += base;
      totalTax += tax;
      const invoiceTotal = base + tax;
      totalPaid += batch.paymentStatus === 'paid' ? invoiceTotal : Number(batch.paymentAmount || 0);
      count++;
    }
    return { totalAmount, totalTax, totalInvoiced: totalAmount + totalTax, totalPaid, outstanding: (totalAmount + totalTax) - totalPaid, count };
  }, [invoiceFilteredBatches]);

  const fmtCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  const updateClientMutation = useMutation({
    mutationFn: async (updates: Partial<Client>) => {
      return apiRequest(`/api/clients/${clientId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId] });
      toast({
        title: "Client updated",
        description: "Client information has been successfully updated."
      });
      setIsEditing(false);
      setEditForm({});
    },
    onError: (error: any) => {
      toast({
        title: "Error updating client",
        description: error.message || "Failed to update client",
        variant: "destructive"
      });
    }
  });

  const handleEdit = () => {
    if (!client) {
      return;
    }
    
    // Populate form with current client data
    setEditForm({
      name: client.name,
      status: client.status,
      billingContact: client.billingContact || "",
      contactName: client.contactName || "",
      contactAddress: client.contactAddress || "",
      secondaryContactName: client.secondaryContactName || "",
      secondaryContactEmail: client.secondaryContactEmail || "",
      currency: client.currency,
      paymentTerms: client.paymentTerms || "",
      paymentMethod: client.paymentMethod || "ACH Transfer",
      msaDate: client.msaDate || "",
      sinceDate: client.sinceDate || "",
      hasMsa: client.hasMsa || false,
      msaDocument: client.msaDocument || "",
      ndaDate: client.ndaDate || "",
      hasNda: client.hasNda || false,
      ndaDocument: client.ndaDocument || "",
      epicTermId: client.epicTermId || null,
      stageTermId: client.stageTermId || null,
      activityTermId: client.activityTermId || null,
      workstreamTermId: client.workstreamTermId || null,
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    // Convert empty date strings and vocabulary overrides to null before sending to API
    const cleanedForm = {
      ...editForm,
      msaDate: editForm.msaDate === "" ? null : editForm.msaDate,
      sinceDate: editForm.sinceDate === "" ? null : editForm.sinceDate,
      ndaDate: editForm.ndaDate === "" ? null : editForm.ndaDate,
      // Convert sentinel values back to null for payment terms
      paymentTerms: editForm.paymentTerms === "__tenant_default__" ? null : (editForm.paymentTerms || null),
      // Ensure vocabulary term IDs are null if empty
      epicTermId: editForm.epicTermId || null,
      stageTermId: editForm.stageTermId || null,
      activityTermId: editForm.activityTermId || null,
      workstreamTermId: editForm.workstreamTermId || null,
      // Remove the legacy vocabulary fields if present
      vocabularyEpic: undefined,
      vocabularyStage: undefined,
      vocabularyActivity: undefined,
      vocabularyWorkstream: undefined,
    };
    updateClientMutation.mutate(cleanedForm);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditForm({});
  };

  if (clientLoading) {
    return (
      <Layout>
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </Layout>
    );
  }

  if (clientError) {
    return (
      <Layout>
        <div className="p-6">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-semibold">Error Loading Client</h1>
            <p className="text-muted-foreground">
              {clientError instanceof Error ? clientError.message : 'Failed to load client data'}
            </p>
            <p className="text-sm text-muted-foreground">Client ID: {clientId}</p>
            <Link href="/clients">
              <Button>Back to Clients</Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  if (!client && !clientLoading) {
    return (
      <Layout>
        <div className="p-6">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-semibold">Client Not Found</h1>
            <p className="text-muted-foreground">The requested client could not be found.</p>
            <p className="text-sm text-muted-foreground">Client ID: {clientId}</p>
            <Link href="/clients">
              <Button>Back to Clients</Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const calculateProjectStats = () => {
    const total = clientProjects.length;
    const active = clientProjects.filter(p => p.status === 'active').length;
    const completed = clientProjects.filter(p => p.status === 'completed').length;
    const paused = clientProjects.filter(p => p.status === 'paused').length;
    
    return { total, active, completed, paused };
  };

  const projectStats = calculateProjectStats();

  // Type guard to ensure client exists for rendering
  if (!client) {
    return null; // This should never happen due to earlier checks, but satisfies TypeScript
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/clients">
              <Button variant="ghost" size="sm" data-testid="button-back-to-clients">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Clients
              </Button>
            </Link>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight flex items-center">
                <Building2 className="h-6 w-6 mr-2 text-primary" />
                {client.name}
              </h1>
              <p className="text-muted-foreground">
                Client since {format(new Date(client.createdAt), "MMMM yyyy")}
              </p>
            </div>
          </div>
          {!isEditing && (
            <Button onClick={handleEdit} data-testid="button-edit-client">
              <Edit className="h-4 w-4 mr-2" />
              Edit Client
            </Button>
          )}
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="projects">Projects ({projectStats.total})</TabsTrigger>
            <TabsTrigger value="sows">SOWs & Change Orders ({clientSows.length})</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="rate-overrides">Rate Overrides</TabsTrigger>
            <TabsTrigger value="stakeholders">Stakeholders ({stakeholders.length})</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Client Details */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      Client Information
                      {isEditing && (
                        <div className="flex space-x-2">
                          <Button 
                            size="sm" 
                            onClick={handleSave}
                            disabled={updateClientMutation.isPending}
                            data-testid="button-save-client"
                          >
                            <Save className="h-4 w-4 mr-2" />
                            {updateClientMutation.isPending ? 'Saving...' : 'Save'}
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={handleCancel}
                            data-testid="button-cancel-edit"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isEditing ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="clientName">Client Name</Label>
                          <Input
                            id="clientName"
                            value={editForm.name || ""}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            data-testid="input-edit-client-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="shortName">Short Name</Label>
                          <Input
                            id="shortName"
                            value={editForm.shortName || ""}
                            onChange={(e) => setEditForm({ ...editForm, shortName: e.target.value })}
                            placeholder="e.g., MSFT, GOOG"
                            maxLength={10}
                            data-testid="input-edit-client-short-name"
                          />
                          <p className="text-xs text-muted-foreground">Abbreviated name for project dropdowns</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="currency">Currency</Label>
                          <Select 
                            value={editForm.currency || "USD"}
                            onValueChange={(value) => setEditForm({ ...editForm, currency: value })}
                          >
                            <SelectTrigger data-testid="select-edit-currency">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="GBP">GBP</SelectItem>
                              <SelectItem value="CAD">CAD</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="status">Status</Label>
                          <Select 
                            value={editForm.status || "pending"}
                            onValueChange={(value) => setEditForm({ ...editForm, status: value })}
                          >
                            <SelectTrigger data-testid="select-edit-status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending (No signed MSA/SOW)</SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                              <SelectItem value="archived">Archived</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="contactName">Contact Name</Label>
                          <Input
                            id="contactName"
                            value={editForm.contactName || ""}
                            onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })}
                            data-testid="input-edit-contact-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="billingContact">Billing Contact Email</Label>
                          <Input
                            id="billingContact"
                            type="email"
                            value={editForm.billingContact || ""}
                            onChange={(e) => setEditForm({ ...editForm, billingContact: e.target.value })}
                            data-testid="input-edit-billing-contact"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="secondaryContactName">Secondary Contact Name (Optional)</Label>
                          <Input
                            id="secondaryContactName"
                            value={editForm.secondaryContactName || ""}
                            onChange={(e) => setEditForm({ ...editForm, secondaryContactName: e.target.value })}
                            placeholder="e.g., Finance Department"
                            data-testid="input-edit-secondary-contact-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="secondaryContactEmail">Secondary Contact Email (Optional)</Label>
                          <Input
                            id="secondaryContactEmail"
                            type="email"
                            value={editForm.secondaryContactEmail || ""}
                            onChange={(e) => setEditForm({ ...editForm, secondaryContactEmail: e.target.value })}
                            placeholder="e.g., ap@company.com"
                            data-testid="input-edit-secondary-contact-email"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="paymentTerms">Payment Terms</Label>
                          <Select
                            value={editForm.paymentTerms || "__tenant_default__"}
                            onValueChange={(value) => setEditForm({ ...editForm, paymentTerms: value === "__tenant_default__" ? null : value })}
                          >
                            <SelectTrigger data-testid="select-edit-payment-terms">
                              <SelectValue placeholder="Use tenant default" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__tenant_default__">Use Tenant Default</SelectItem>
                              <SelectItem value="Net 10">Net 10</SelectItem>
                              <SelectItem value="Net 30">Net 30</SelectItem>
                              <SelectItem value="Net 45">Net 45</SelectItem>
                              <SelectItem value="Net 60">Net 60</SelectItem>
                              <SelectItem value="Due Upon Receipt">Due Upon Receipt</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="paymentMethod">Payment Method</Label>
                          <Select
                            value={editForm.paymentMethod || "ACH Transfer"}
                            onValueChange={(value) => setEditForm({ ...editForm, paymentMethod: value })}
                          >
                            <SelectTrigger data-testid="select-edit-payment-method">
                              <SelectValue placeholder="Select payment method" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ACH Transfer">ACH Transfer</SelectItem>
                              <SelectItem value="Wire Transfer">Wire Transfer</SelectItem>
                              <SelectItem value="Check">Check</SelectItem>
                              <SelectItem value="Credit Card">Credit Card</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <Label htmlFor="contactAddress">Contact Address</Label>
                          <Textarea
                            id="contactAddress"
                            value={editForm.contactAddress || ""}
                            onChange={(e) => setEditForm({ ...editForm, contactAddress: e.target.value })}
                            data-testid="textarea-edit-contact-address"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="msaDate">MSA Signed Date</Label>
                          <Input
                            id="msaDate"
                            type="date"
                            value={editForm.msaDate || ""}
                            onChange={(e) => setEditForm({ 
                              ...editForm, 
                              msaDate: e.target.value,
                              hasMsa: Boolean(e.target.value) // Auto-update hasMsa based on date
                            })}
                            data-testid="input-edit-msa-date"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="sinceDate">Client Since Date</Label>
                          <Input
                            id="sinceDate"
                            type="date"
                            value={editForm.sinceDate || ""}
                            onChange={(e) => setEditForm({ ...editForm, sinceDate: e.target.value })}
                            data-testid="input-edit-since-date"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ndaDate">NDA Signed Date</Label>
                          <Input
                            id="ndaDate"
                            type="date"
                            value={editForm.ndaDate || ""}
                            onChange={(e) => setEditForm({ 
                              ...editForm, 
                              ndaDate: e.target.value,
                              hasNda: Boolean(e.target.value) // Auto-update hasNda based on date
                            })}
                            data-testid="input-edit-nda-date"
                          />
                        </div>
                        {catalogTerms.length > 0 && (
                          <div className="md:col-span-2 pt-4 border-t">
                            <h4 className="text-sm font-medium mb-4">Terminology Customization (Optional)</h4>
                            <p className="text-sm text-muted-foreground mb-4">
                              Override default terminology for this client. Select from predefined options. Leave unset to use organization defaults (shown in parentheses).
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="epicTermId">Epic Term</Label>
                                <Select
                                  value={editForm.epicTermId || "__default__"}
                                  onValueChange={(value) => setEditForm({ ...editForm, epicTermId: value === "__default__" ? null : value })}
                                >
                                  <SelectTrigger data-testid="select-vocab-epic">
                                    <SelectValue placeholder="Select epic term" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__default__">
                                      Use organization default{orgSelections?.epicTermId && ` (${getTermValue(orgSelections.epicTermId)})`}
                                    </SelectItem>
                                    {epicTerms?.map(term => (
                                      <SelectItem key={term.id} value={term.id}>
                                        {term.termValue}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="stageTermId">Stage Term</Label>
                                <Select
                                  value={editForm.stageTermId || "__default__"}
                                  onValueChange={(value) => setEditForm({ ...editForm, stageTermId: value === "__default__" ? null : value })}
                                >
                                  <SelectTrigger data-testid="select-vocab-stage">
                                    <SelectValue placeholder="Select stage term" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__default__">
                                      Use organization default{orgSelections?.stageTermId && ` (${getTermValue(orgSelections.stageTermId)})`}
                                    </SelectItem>
                                    {stageTerms?.map(term => (
                                      <SelectItem key={term.id} value={term.id}>
                                        {term.termValue}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="activityTermId">Activity Term</Label>
                                <Select
                                  value={editForm.activityTermId || "__default__"}
                                  onValueChange={(value) => setEditForm({ ...editForm, activityTermId: value === "__default__" ? null : value })}
                                >
                                  <SelectTrigger data-testid="select-vocab-activity">
                                    <SelectValue placeholder="Select activity term" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__default__">
                                      Use organization default{orgSelections?.activityTermId && ` (${getTermValue(orgSelections.activityTermId)})`}
                                    </SelectItem>
                                    {activityTerms?.map(term => (
                                      <SelectItem key={term.id} value={term.id}>
                                        {term.termValue}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="workstreamTermId">Workstream Term</Label>
                                <Select
                                  value={editForm.workstreamTermId || "__default__"}
                                  onValueChange={(value) => setEditForm({ ...editForm, workstreamTermId: value === "__default__" ? null : value })}
                                >
                                  <SelectTrigger data-testid="select-vocab-workstream">
                                    <SelectValue placeholder="Select workstream term" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__default__">
                                      Use organization default{orgSelections?.workstreamTermId && ` (${getTermValue(orgSelections.workstreamTermId)})`}
                                    </SelectItem>
                                    {workstreamTerms?.map(term => (
                                      <SelectItem key={term.id} value={term.id}>
                                        {term.termValue}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="flex items-center space-x-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Client Name</span>
                          </div>
                          <p className="font-medium" data-testid="text-client-name">
                            {client.name}
                            {client.shortName && (
                              <span className="ml-2 text-sm text-muted-foreground">({client.shortName})</span>
                            )}
                          </p>
                          
                          <div className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Status</span>
                          </div>
                          <Badge 
                            variant={
                              client.status === 'active' ? 'default' :
                              client.status === 'pending' ? 'secondary' :
                              client.status === 'inactive' ? 'outline' : 'destructive'
                            }
                            data-testid="badge-client-status"
                          >
                            {client.status === 'pending' ? 'Pending (No signed MSA/SOW)' :
                             client.status === 'active' ? 'Active' :
                             client.status === 'inactive' ? 'Inactive' : 'Archived'}
                          </Badge>
                          
                          {client.contactName && (
                            <>
                              <div className="flex items-center space-x-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Contact Person</span>
                              </div>
                              <p data-testid="text-contact-name">{client.contactName}</p>
                            </>
                          )}

                          <div className="flex items-center space-x-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Currency</span>
                          </div>
                          <Badge variant="outline" data-testid="badge-currency">
                            {client.currency}
                          </Badge>
                        </div>

                        <div className="space-y-4">
                          {client.billingContact && (
                            <>
                              <div className="flex items-center space-x-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Billing Contact</span>
                              </div>
                              <p data-testid="text-billing-contact">{client.billingContact}</p>
                            </>
                          )}

                          {(client.secondaryContactName || client.secondaryContactEmail) && (
                            <>
                              <div className="flex items-center space-x-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Secondary Contact (CC on Invoices)</span>
                              </div>
                              <p data-testid="text-secondary-contact">
                                {client.secondaryContactName}
                                {client.secondaryContactName && client.secondaryContactEmail && ' - '}
                                {client.secondaryContactEmail}
                              </p>
                            </>
                          )}

                          {client.contactAddress && (
                            <>
                              <div className="flex items-center space-x-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Address</span>
                              </div>
                              <p className="text-sm" data-testid="text-contact-address">
                                {client.contactAddress}
                              </p>
                            </>
                          )}

                          <div className="flex items-center space-x-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Client Since</span>
                          </div>
                          <p data-testid="text-client-since">
                            {client.sinceDate ? 
                              format(new Date(client.sinceDate), "MMMM d, yyyy") : 
                              format(new Date(client.createdAt), "MMMM d, yyyy")
                            }
                          </p>
                          
                          {client.hasMsa && (
                            <>
                              <div className="flex items-center space-x-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">MSA Status</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Badge variant="default" data-testid="badge-msa-status">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  MSA Signed
                                </Badge>
                                {client.msaDate && (
                                  <span className="text-sm text-muted-foreground">
                                    {format(new Date(client.msaDate), "MMM d, yyyy")}
                                  </span>
                                )}
                              </div>
                              {client.msaDocument && (
                                <div className="flex items-center space-x-2">
                                  <a 
                                    href={`/api/documents/${client.msaDocument}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 hover:text-blue-800 underline flex items-center space-x-1"
                                    data-testid="link-msa-document"
                                  >
                                    <FileText className="h-3 w-3" />
                                    <span>View MSA Document</span>
                                  </a>
                                </div>
                              )}
                            </>
                          )}
                          
                          {!client.hasMsa && (
                            <>
                              <div className="flex items-center space-x-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">MSA Status</span>
                              </div>
                              <Badge variant="outline" data-testid="badge-no-msa">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                No MSA
                              </Badge>
                            </>
                          )}
                          
                          {client.hasNda && (
                            <>
                              <div className="flex items-center space-x-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">NDA Status</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Badge variant="secondary" data-testid="badge-nda-status">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  NDA Signed
                                </Badge>
                                {client.ndaDate && (
                                  <span className="text-sm text-muted-foreground">
                                    {format(new Date(client.ndaDate), "MMM d, yyyy")}
                                  </span>
                                )}
                              </div>
                              {client.ndaDocument && (
                                <div className="flex items-center space-x-2">
                                  <a 
                                    href={`/api/documents/${client.ndaDocument}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 hover:text-blue-800 underline flex items-center space-x-1"
                                    data-testid="link-nda-document"
                                  >
                                    <FileText className="h-3 w-3" />
                                    <span>View NDA Document</span>
                                  </a>
                                </div>
                              )}
                            </>
                          )}
                          
                          {!client.hasNda && (
                            <>
                              <div className="flex items-center space-x-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">NDA Status</span>
                              </div>
                              <Badge variant="outline" data-testid="badge-no-nda">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                No NDA
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Project Stats */}
              <div>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Project Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-muted/50 rounded">
                        <div className="text-2xl font-bold text-primary">{projectStats.total}</div>
                        <div className="text-xs text-muted-foreground">Total Projects</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 dark:bg-green-950 rounded">
                        <div className="text-2xl font-bold text-green-600">{projectStats.active}</div>
                        <div className="text-xs text-muted-foreground">Active</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-blue-50 dark:bg-blue-950 rounded">
                        <div className="text-2xl font-bold text-blue-600">{projectStats.completed}</div>
                        <div className="text-xs text-muted-foreground">Completed</div>
                      </div>
                      <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-950 rounded">
                        <div className="text-2xl font-bold text-yellow-600">{projectStats.paused}</div>
                        <div className="text-xs text-muted-foreground">Paused</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <ClientCrmLink clientId={clientId!} />
              </div>
            </div>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Client Projects</CardTitle>
              </CardHeader>
              <CardContent>
                {clientProjects.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No projects found for this client</p>
                  </div>
                ) : (
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>PM</TableHead>
                          <TableHead>Budget</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientProjects.map((project) => (
                          <TableRow key={project.id} data-testid={`row-project-${project.id}`}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{project.name}</p>
                                <p className="text-sm text-muted-foreground line-clamp-1">
                                  {project.code}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  project.status === 'active' ? 'default' :
                                  project.status === 'completed' ? 'secondary' :
                                  project.status === 'paused' ? 'outline' : 'destructive'
                                }
                              >
                                {project.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {project.pm || 'Unassigned'}
                            </TableCell>
                            <TableCell>
                              {project.baselineBudget ? 
                                `${client.currency} ${Number(project.baselineBudget).toLocaleString()}` : 
                                project.sowValue ?
                                `${client.currency} ${Number(project.sowValue).toLocaleString()}` :
                                'No budget set'
                              }
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(project.createdAt), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                              <Link href={`/projects/${project.id}`}>
                                <Button size="sm" variant="outline">
                                  View
                                </Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SOWs Tab */}
          <TabsContent value="sows" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Statements of Work & Change Orders</CardTitle>
              </CardHeader>
              <CardContent>
                {clientSows.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No SOWs or change orders found for this client</p>
                  </div>
                ) : (
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Document</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Project</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientSows.map((sow) => {
                          const project = clientProjects.find(p => p.id === sow.projectId);
                          return (
                            <TableRow key={sow.id} data-testid={`row-sow-${sow.id}`}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{sow.name}</p>
                                  {sow.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-1">
                                      {sow.description}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {sow.type === 'sow' ? 'SOW' : 'Change Order'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {project ? project.name : 'Unknown Project'}
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={
                                    sow.status === 'approved' ? 'default' :
                                    sow.status === 'draft' ? 'secondary' : 'outline'
                                  }
                                >
                                  {sow.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {sow.value ? 
                                  `${client.currency} ${Number(sow.value).toLocaleString()}` : 
                                  'TBD'
                                }
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(sow.createdAt), "MMM d, yyyy")}
                              </TableCell>
                              <TableCell>
                                <Button size="sm" variant="outline">
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle>Invoice History</CardTitle>
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <Select value={invoiceYearFilter} onValueChange={setInvoiceYearFilter}>
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder="Filter by year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Years</SelectItem>
                        {invoiceAvailableYears.map(year => (
                          <SelectItem key={year} value={year}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {invoiceTotals.count > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground mb-1">Invoices</div>
                      <div className="text-lg font-bold">{invoiceTotals.count}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground mb-1">Total Invoiced</div>
                      <div className="text-lg font-bold">{fmtCurrency(invoiceTotals.totalInvoiced)}</div>
                      <div className="text-xs text-muted-foreground">{fmtCurrency(invoiceTotals.totalAmount)} + {fmtCurrency(invoiceTotals.totalTax)} tax</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground mb-1">Amount Paid</div>
                      <div className="text-lg font-bold text-green-600">{fmtCurrency(invoiceTotals.totalPaid)}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground mb-1">Outstanding</div>
                      <div className={`text-lg font-bold ${invoiceTotals.outstanding > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>{fmtCurrency(invoiceTotals.outstanding)}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground mb-1">Period</div>
                      <div className="text-sm font-medium">{invoiceYearFilter === 'all' ? 'All Time' : invoiceYearFilter}</div>
                      <div className="text-xs text-muted-foreground">By as-of date</div>
                    </div>
                  </div>
                )}

                {invoiceFilteredBatches.length === 0 ? (
                  <div className="text-center py-8">
                    <Receipt className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">
                      {clientBatches.length === 0 ? 'No invoices found for this client' : `No invoices found for ${invoiceYearFilter}`}
                    </p>
                  </div>
                ) : (
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead>As-Of Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Tax</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoiceFilteredBatches.map((batch) => {
                          const effectiveDate = getEffectiveDate(batch);
                          const base = Number(batch.totalAmount || 0) - Number(batch.discountAmount || 0);
                          const tax = batch.taxAmountOverride != null ? Number(batch.taxAmountOverride) : (batch.taxAmount != null ? Number(batch.taxAmount) : 0);
                          const total = base + tax;

                          return (
                            <TableRow key={batch.batchId} data-testid={`row-batch-${batch.batchId}`}>
                              <TableCell className="font-mono text-sm">
                                {batch.glInvoiceNumber || batch.batchId}
                              </TableCell>
                              <TableCell>
                                {batch.startDate && batch.endDate ? (
                                  <div className="text-sm">
                                    {format(new Date(batch.startDate + 'T00:00:00'), "MMM d")} - {format(new Date(batch.endDate + 'T00:00:00'), "MMM d, yyyy")}
                                  </div>
                                ) : (
                                  'Custom period'
                                )}
                              </TableCell>
                              <TableCell className="text-sm">
                                {effectiveDate ? format(new Date(effectiveDate + 'T00:00:00'), "MMM d, yyyy") : '—'}
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={
                                    batch.status === 'finalized' ? 'default' :
                                    batch.status === 'review' ? 'secondary' : 'outline'
                                  }
                                >
                                  {batch.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {fmtCurrency(base)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {fmtCurrency(tax)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {fmtCurrency(total)}
                              </TableCell>
                              <TableCell>
                                <Badge variant={
                                  batch.paymentStatus === 'paid' ? 'default' :
                                  batch.paymentStatus === 'partial' ? 'secondary' : 'destructive'
                                } className={
                                  batch.paymentStatus === 'paid' ? 'bg-green-600' :
                                  batch.paymentStatus === 'partial' ? 'bg-amber-500' : ''
                                }>
                                  {batch.paymentStatus || 'unpaid'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Link href={`/billing/batches/${batch.batchId}`}>
                                  <Button size="sm" variant="outline">
                                    View
                                  </Button>
                                </Link>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {invoiceFilteredBatches.some(b => b.status === 'finalized') && (
                          <TableRow className="bg-primary/5 font-bold border-t-2 border-primary/20">
                            <TableCell colSpan={4} className="text-right">
                              Totals ({invoiceTotals.count} finalized)
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{fmtCurrency(invoiceTotals.totalAmount)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtCurrency(invoiceTotals.totalTax)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtCurrency(invoiceTotals.totalInvoiced)}</TableCell>
                            <TableCell colSpan={2}></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rate Overrides Tab */}
          <TabsContent value="rate-overrides" className="space-y-6">
            <ClientRateOverridesSection clientId={clientId!} />
          </TabsContent>

          {/* Stakeholders Tab */}
          <TabsContent value="stakeholders" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <UserCircle className="h-5 w-5" />
                  Client Stakeholders
                </CardTitle>
                <Button size="sm" onClick={() => setShowAddStakeholder(true)}>
                  <UserPlus className="h-4 w-4 mr-1" /> Add Stakeholder
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  External client-side contacts who can be assigned as owners or assignees on project RAIDD items.
                </p>
                {stakeholdersLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : stakeholders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <UserCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No stakeholders yet</p>
                    <p className="text-sm">Add client-side contacts to assign them to RAIDD items</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Title / Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stakeholders.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.userName}</TableCell>
                          <TableCell>{s.userEmail}</TableCell>
                          <TableCell>{s.stakeholderTitle || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={s.status === 'active' ? 'default' : 'secondary'}>
                              {s.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => removeStakeholderMutation.mutate(s.id)}
                              disabled={removeStakeholderMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Stakeholder Dialog */}
        <Dialog open={showAddStakeholder} onOpenChange={(open) => {
          setShowAddStakeholder(open);
          if (!open) { setMatchedUser(null); setStakeholderForm({ email: '', name: '', stakeholderTitle: '' }); }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Client Stakeholder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="stakeholder-email">Email *</Label>
                <Input
                  id="stakeholder-email"
                  type="email"
                  placeholder="Start typing to search existing users..."
                  value={stakeholderForm.email}
                  onChange={(e) => {
                    const email = e.target.value;
                    setStakeholderForm({ ...stakeholderForm, email });
                    const found = allPlatformUsers.find(u => u.email?.toLowerCase() === email.toLowerCase().trim());
                    if (found) {
                      setMatchedUser(found);
                      setStakeholderForm(prev => ({ ...prev, email, name: found.name }));
                    } else {
                      setMatchedUser(null);
                    }
                  }}
                />
                {matchedUser ? (
                  <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2">
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span className="text-sm text-green-700 dark:text-green-300">
                      Existing user found: <strong>{matchedUser.name}</strong> ({matchedUser.email}). They will be linked, not duplicated.
                    </span>
                  </div>
                ) : usersQueryError ? (
                  <p className="text-xs text-muted-foreground">If this email belongs to an existing user, they will be linked automatically. Otherwise a new user will be created.</p>
                ) : stakeholderForm.email.length > 2 ? (
                  <p className="text-xs text-muted-foreground">No existing user matches this email. A new user account will be created.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Enter the email of an existing platform user or a new person.</p>
                )}
                {stakeholderForm.email.length >= 2 && !matchedUser && (() => {
                  const suggestions = allPlatformUsers.filter(u =>
                    (u.email || '').toLowerCase().includes(stakeholderForm.email.toLowerCase().trim()) ||
                    (u.name || '').toLowerCase().includes(stakeholderForm.email.toLowerCase().trim())
                  ).slice(0, 5);
                  if (suggestions.length === 0) return null;
                  return (
                    <div className="border rounded-md divide-y text-sm max-h-40 overflow-y-auto">
                      {suggestions.map(u => (
                        <button
                          key={u.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex justify-between items-center"
                          onClick={() => {
                            setStakeholderForm(prev => ({ ...prev, email: u.email, name: u.name }));
                            setMatchedUser(u);
                          }}
                        >
                          <span className="font-medium">{u.name}</span>
                          <span className="text-muted-foreground">{u.email}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="space-y-2">
                <Label htmlFor="stakeholder-name">Name</Label>
                <Input
                  id="stakeholder-name"
                  placeholder="Jane Smith"
                  value={stakeholderForm.name}
                  onChange={(e) => setStakeholderForm({ ...stakeholderForm, name: e.target.value })}
                  disabled={!!matchedUser}
                />
                {matchedUser && <p className="text-xs text-muted-foreground">Name auto-filled from existing user record.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="stakeholder-title">Title / Role at Client</Label>
                <Input
                  id="stakeholder-title"
                  placeholder="e.g., CTO, Project Sponsor, Technical Lead"
                  value={stakeholderForm.stakeholderTitle}
                  onChange={(e) => setStakeholderForm({ ...stakeholderForm, stakeholderTitle: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddStakeholder(false)}>Cancel</Button>
              <Button
                onClick={() => addStakeholderMutation.mutate(stakeholderForm)}
                disabled={!stakeholderForm.email || addStakeholderMutation.isPending}
              >
                {addStakeholderMutation.isPending ? "Adding..." : "Add Stakeholder"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}