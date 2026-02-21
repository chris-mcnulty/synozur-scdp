import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Handshake, DollarSign, Calendar, ExternalLink, Plus, AlertTriangle, ArrowLeft, Search } from "lucide-react";

interface HubSpotDeal {
  id: string;
  dealName: string;
  amount: string | number | null;
  dealStage: string;
  dealStageName: string;
  pipeline: string;
  pipelineName: string;
  probability: number;
  closeDate: string;
  ownerName: string;
  companyName: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  isMapped: boolean;
  mapping: { localObjectId: string } | null;
}

interface DealsResponse {
  deals: HubSpotDeal[];
  threshold: number;
  total: number;
  mapped: number;
}

interface CrmStatus {
  provider: string;
  platformConnected: boolean;
  tenantEnabled: boolean;
  dealProbabilityThreshold: number;
}

interface Client {
  id: number;
  name: string;
}

function formatCurrency(amount: string | number | null): string {
  if (amount === null || amount === undefined) return "—";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

export default function CrmDeals() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<HubSpotDeal | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [estimateName, setEstimateName] = useState("");

  const { data: crmStatus, isLoading: isLoadingStatus } = useQuery<CrmStatus>({
    queryKey: ["/api/crm/status"],
  });

  const { data: dealsData, isLoading: isLoadingDeals } = useQuery<DealsResponse>({
    queryKey: ["/api/crm/deals"],
    enabled: crmStatus?.tenantEnabled === true,
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: dialogOpen,
  });

  const createEstimateMutation = useMutation({
    mutationFn: (dealId: string) =>
      apiRequest(`/api/crm/deals/${dealId}/create-estimate`, {
        method: "POST",
        body: JSON.stringify({
          clientId: selectedClientId && selectedClientId !== "auto" ? parseInt(selectedClientId) : undefined,
          estimateName: estimateName || undefined,
        }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({ title: "Estimate created", description: `Estimate created from deal successfully.` });
      setDialogOpen(false);
      setSelectedDeal(null);
      setSelectedClientId("");
      setEstimateName("");
      if (data?.estimate?.id) {
        navigate(`/estimates/${data.estimate.id}`);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create estimate", description: error.message, variant: "destructive" });
    },
  });

  const openCreateDialog = (deal: HubSpotDeal) => {
    setSelectedDeal(deal);
    setEstimateName(deal.dealName);
    setSelectedClientId("auto");
    setDialogOpen(true);
  };

  const handleCreateEstimate = () => {
    if (!selectedDeal) return;
    createEstimateMutation.mutate(selectedDeal.id);
  };

  const filteredDeals = dealsData?.deals?.filter((deal) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      deal.dealName.toLowerCase().includes(term) ||
      deal.companyName?.toLowerCase().includes(term) ||
      deal.ownerName?.toLowerCase().includes(term) ||
      deal.dealStageName?.toLowerCase().includes(term)
    );
  }) ?? [];

  if (isLoadingStatus) {
    return (
      <Layout>
        <div className="container mx-auto py-8 px-4 max-w-7xl space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-96" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!crmStatus?.platformConnected || !crmStatus?.tenantEnabled) {
    return (
      <Layout>
        <div className="container mx-auto py-8 px-4 max-w-7xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Handshake className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">CRM Deals</h1>
            </div>
          </div>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {!crmStatus?.platformConnected
                ? "HubSpot is not connected to the platform. Contact your platform administrator to set up the HubSpot connection."
                : "HubSpot sync is not enabled for your organization. Enable it in Organization Settings to view CRM deals."}
            </AlertDescription>
          </Alert>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate("/organization-settings")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Organization Settings
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Handshake className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">CRM Deals</h1>
              <p className="text-sm text-muted-foreground">
                {isLoadingDeals
                  ? "Loading deals..."
                  : `${dealsData?.total ?? 0} deals above ${dealsData?.threshold ?? 0}% probability · ${dealsData?.mapped ?? 0} mapped to estimates`}
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base">HubSpot Deals</CardTitle>
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search deals..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingDeals ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : filteredDeals.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchTerm ? "No deals match your search." : "No deals found above the probability threshold."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Deal Name</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Pipeline</TableHead>
                      <TableHead className="text-center">Probability</TableHead>
                      <TableHead>Close Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeals.map((deal) => (
                      <TableRow key={deal.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{deal.dealName}</p>
                            {deal.companyName && (
                              <p className="text-xs text-muted-foreground">{deal.companyName}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {deal.amount ? formatCurrency(deal.amount) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{deal.dealStageName || deal.dealStage}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {deal.pipelineName || deal.pipeline}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={deal.probability >= 80 ? "default" : deal.probability >= 50 ? "secondary" : "outline"}
                          >
                            {deal.probability}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {deal.closeDate
                            ? new Date(deal.closeDate).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {deal.isMapped ? (
                            <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                              Mapped
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-orange-600 border-orange-400">
                              Unmapped
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {deal.isMapped && deal.mapping?.localObjectId ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/estimates/${deal.mapping!.localObjectId}`)}
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View Estimate
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openCreateDialog(deal)}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Create Estimate
                            </Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Estimate from Deal</DialogTitle>
            <DialogDescription>
              Create a new estimate linked to "{selectedDeal?.dealName}".
              {selectedDeal?.amount ? ` Deal value: ${formatCurrency(selectedDeal.amount)}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Estimate Name</Label>
              <Input
                value={estimateName}
                onChange={(e) => setEstimateName(e.target.value)}
                placeholder="Enter estimate name"
              />
            </div>
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect from HubSpot</SelectItem>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={String(client.id)}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose "Auto-detect" to match the client from HubSpot company data, or select an existing client.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateEstimate}
              disabled={createEstimateMutation.isPending}
            >
              {createEstimateMutation.isPending ? "Creating..." : "Create Estimate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
