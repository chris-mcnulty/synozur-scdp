import { useState, useEffect } from "react";
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
  AlertCircle
} from "lucide-react";
import { Link } from "wouter";
import { Client, Project, InvoiceBatch, Sow } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

type ProjectWithClient = Project & { client: Client };
type InvoiceBatchWithDetails = InvoiceBatch & {
  totalLinesCount: number;
  clientCount: number;
  projectCount: number;
};

export default function ClientDetail() {
  const { id: clientId } = useParams<{ id: string }>();
  const [location, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Client>>({});

  const { toast } = useToast();

  // Auto-enter edit mode if ?edit=true is in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('edit') === 'true') {
      setIsEditing(true);
      // Clean the URL by removing the edit parameter
      urlParams.delete('edit');
      const newSearch = urlParams.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Fetch client details
  const { data: client, isLoading: clientLoading, error: clientError } = useQuery<Client>({
    queryKey: ["/api/clients", clientId],
    enabled: !!clientId
  });

  // Debug logging
  console.log('Client Detail Debug:', { clientId, clientLoading, client, clientError });

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
    setIsEditing(true);
    setEditForm({
      name: client?.name || "",
      status: client?.status || "pending",
      billingContact: client?.billingContact || "",
      contactName: client?.contactName || "",
      contactAddress: client?.contactAddress || "",
      currency: client?.currency || "USD",
      msaDate: client?.msaDate || "",
      sinceDate: client?.sinceDate || "",
      hasMsa: client?.hasMsa || false,
      msaDocument: client?.msaDocument || "",
      ndaDate: client?.ndaDate || "",
      hasNda: client?.hasNda || false,
      ndaDocument: client?.ndaDocument || ""
    });
  };

  const handleSave = () => {
    updateClientMutation.mutate(editForm);
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
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="flex items-center space-x-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Client Name</span>
                          </div>
                          <p className="font-medium" data-testid="text-client-name">{client.name}</p>
                          
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
              <CardHeader>
                <CardTitle>Invoice History</CardTitle>
              </CardHeader>
              <CardContent>
                {clientBatches.length === 0 ? (
                  <div className="text-center py-8">
                    <Receipt className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No invoices found for this client</p>
                  </div>
                ) : (
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Batch ID</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Lines</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientBatches.map((batch) => (
                          <TableRow key={batch.batchId} data-testid={`row-batch-${batch.batchId}`}>
                            <TableCell className="font-mono text-sm">
                              {batch.batchId}
                            </TableCell>
                            <TableCell>
                              {batch.startDate && batch.endDate ? (
                                <div className="text-sm">
                                  {format(new Date(batch.startDate), "MMM d")} - {format(new Date(batch.endDate), "MMM d, yyyy")}
                                </div>
                              ) : (
                                'Custom period'
                              )}
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
                            <TableCell>
                              {batch.totalAmount ? 
                                `${client.currency} ${Number(batch.totalAmount).toLocaleString()}` : 
                                'TBD'
                              }
                            </TableCell>
                            <TableCell>
                              {batch.totalLinesCount || 0} lines
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(batch.createdAt), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                              <Link href={`/billing/batches/${batch.batchId}`}>
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
        </Tabs>
      </div>
    </Layout>
  );
}