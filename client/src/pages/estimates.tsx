import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Plus, FileText, Edit, Eye, Download, Send, Calendar, DollarSign, Trash2, Copy, Archive, ArchiveRestore } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

// Copy estimate form schemas
const copySameClientSchema = z.object({
  name: z.string().min(1, "Estimate name is required"),
  projectId: z.string().nullable(),
});

const copyDifferentClientSchema = z.object({
  name: z.string().min(1, "Estimate name is required"),
  targetClientId: z.string().min(1, "Please select a client"),
  projectId: z.string().nullable(),
});

const copyNewClientSchema = z.object({
  name: z.string().min(1, "Estimate name is required"),
  clientName: z.string().min(1, "Client name is required"),
  billingContact: z.string().email().optional().or(z.literal("")),
  currency: z.string(),
});

interface Estimate {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  projectId?: string;
  projectName?: string;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  estimateType?: 'detailed' | 'block';
  totalHours: number;
  totalCost: number;
  totalAmount: number;
  presentedTotal?: number;
  archived: boolean;
  createdAt: string;
  validUntil: string;
}

export default function Estimates() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createClientDialogOpen, setCreateClientDialogOpen] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [estimateToDelete, setEstimateToDelete] = useState<Estimate | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [estimateToCopy, setEstimateToCopy] = useState<Estimate | null>(null);
  const [copyMode, setCopyMode] = useState<'same' | 'different' | 'new'>('same');
  const [estimateType, setEstimateType] = useState<string>('detailed');
  const [showArchived, setShowArchived] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Copy form instances
  const copySameForm = useForm<z.infer<typeof copySameClientSchema>>({
    resolver: zodResolver(copySameClientSchema),
    defaultValues: {
      name: '',
      projectId: null,
    },
  });

  const copyDifferentForm = useForm<z.infer<typeof copyDifferentClientSchema>>({
    resolver: zodResolver(copyDifferentClientSchema),
    defaultValues: {
      name: '',
      targetClientId: '',
      projectId: null,
    },
  });

  const copyNewForm = useForm<z.infer<typeof copyNewClientSchema>>({
    resolver: zodResolver(copyNewClientSchema),
    defaultValues: {
      name: '',
      clientName: '',
      billingContact: '',
      currency: 'USD',
    },
  });

  const { data: estimates = [], isLoading } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates", showArchived],
    queryFn: async () => {
      const sessionId = localStorage.getItem('sessionId');
      const headers: Record<string, string> = {};
      if (sessionId) {
        headers['X-Session-Id'] = sessionId;
      }
      
      const res = await fetch(`/api/estimates?includeArchived=${showArchived}`, {
        headers,
        credentials: 'include'
      });
      if (!res.ok) {
        throw new Error('Failed to fetch estimates');
      }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/clients"],
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const createEstimate = useMutation({
    mutationFn: (data: any) => apiRequest("/api/estimates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      setCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "Estimate created successfully",
      });
    },
    onError: (error: any) => {
      console.error("Estimate creation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create estimate. Please check your permissions and try again.",
        variant: "destructive",
      });
    },
  });

  const deleteEstimate = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/estimates/${id}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      setDeleteDialogOpen(false);
      setEstimateToDelete(null);
      toast({
        title: "Success",
        description: "Estimate deleted successfully",
      });
    },
    onError: (error: any) => {
      console.error("Estimate deletion error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete estimate. You may not have permission.",
        variant: "destructive",
      });
    },
  });

  const copyEstimate = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => apiRequest(`/api/estimates/${id}/copy`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: (newEstimate: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setCopyDialogOpen(false);
      setEstimateToCopy(null);
      toast({
        title: "Success",
        description: "Estimate copied successfully",
      });
      // Navigate to the new estimate
      setLocation(`/estimates/${newEstimate.id}`);
    },
    onError: (error: any) => {
      console.error("Estimate copy error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to copy estimate. Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleArchive = useMutation({
    mutationFn: ({ id, archived }: { id: string, archived: boolean }) => apiRequest(`/api/estimates/${id}/archive`, {
      method: "PATCH",
      body: JSON.stringify({ archived }),
    }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: variables.archived ? "Estimate archived successfully" : "Estimate unarchived successfully",
      });
    },
    onError: (error: any) => {
      console.error("Archive toggle error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update estimate. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createClient = useMutation({
    mutationFn: (data: any) => apiRequest("/api/clients", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setCreateClientDialogOpen(false);
      toast({
        title: "Success",
        description: "Client created successfully",
      });
    },
    onError: (error: any) => {
      console.error("Client creation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create client. Please check your permissions and try again.",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: "bg-gray-100 text-gray-700",
      sent: "bg-blue-100 text-blue-700",
      approved: "bg-green-100 text-green-700",
      rejected: "bg-red-100 text-red-700",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold" data-testid="estimates-title">Estimates</h2>
            <p className="text-muted-foreground" data-testid="estimates-subtitle">
              Create and manage project estimates for clients
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-new-estimate">
            <Plus className="w-4 h-4 mr-2" />
            New Estimate
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Estimates</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{estimates.length}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {estimates.filter(e => e.status === 'sent').length}
              </div>
              <p className="text-xs text-muted-foreground">Awaiting client response</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {estimates.filter(e => e.status === 'approved').length}
              </div>
              <p className="text-xs text-muted-foreground">Ready to start</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${estimates.reduce((sum, e) => sum + (e.presentedTotal || e.totalAmount || e.totalCost || 0), 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">All estimates (quote totals)</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Estimate List</CardTitle>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="show-archived" 
                  checked={showArchived}
                  onCheckedChange={(checked) => setShowArchived(checked as boolean)}
                  data-testid="checkbox-show-archived"
                />
                <label 
                  htmlFor="show-archived" 
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Show Archived
                </label>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading estimates...</div>
            ) : estimates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No estimates yet. Create your first estimate to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estimate Name</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total Hours</TableHead>
                    <TableHead>Quote Total</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estimates.map((estimate) => (
                    <TableRow key={estimate.id} data-testid={`estimate-row-${estimate.id}`}>
                      <TableCell className="font-medium">{estimate.name}</TableCell>
                      <TableCell>{estimate.clientName}</TableCell>
                      <TableCell>{estimate.projectName || "-"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          estimate.estimateType === 'block' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {estimate.estimateType === 'block' ? 'Block' : 'Detailed'}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(estimate.status)}</TableCell>
                      <TableCell>{(estimate.totalHours || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        {estimate.presentedTotal && estimate.presentedTotal !== estimate.totalAmount ? (
                          <span className="text-blue-600 font-medium" title={`Line items: $${(estimate.totalAmount || 0).toLocaleString()}`}>
                            ${(estimate.presentedTotal || 0).toLocaleString()}
                          </span>
                        ) : (
                          <span>${((estimate.presentedTotal || estimate.totalAmount || estimate.totalCost) || 0).toLocaleString()}</span>
                        )}
                      </TableCell>
                      <TableCell>{estimate.validUntil ? format(new Date(estimate.validUntil), "MMM d, yyyy") : "-"}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            data-testid={`view-estimate-${estimate.id}`}
                            onClick={() => setLocation(`/estimates/${estimate.id}`)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            data-testid={`edit-estimate-${estimate.id}`}
                            onClick={() => setLocation(`/estimates/${estimate.id}`)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {estimate.status === 'draft' && (
                            <Button size="sm" variant="ghost" data-testid={`send-estimate-${estimate.id}`}>
                              <Send className="w-4 h-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" data-testid={`download-estimate-${estimate.id}`}>
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            data-testid={`copy-estimate-${estimate.id}`}
                            onClick={() => {
                              setEstimateToCopy(estimate);
                              setCopyMode('same');
                              // Reset forms with estimate data
                              const copyName = `${estimate.name} (Copy)`;
                              copySameForm.reset({
                                name: copyName,
                                projectId: estimate.projectId || null,
                              });
                              copyDifferentForm.reset({
                                name: copyName,
                                targetClientId: '',
                                projectId: null,
                              });
                              copyNewForm.reset({
                                name: copyName,
                                clientName: '',
                                billingContact: '',
                                currency: 'USD',
                              });
                              setCopyDialogOpen(true);
                            }}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            data-testid={`${estimate.archived ? 'unarchive' : 'archive'}-estimate-${estimate.id}`}
                            onClick={() => toggleArchive.mutate({ id: estimate.id, archived: !estimate.archived })}
                            title={estimate.archived ? 'Unarchive' : 'Archive'}
                          >
                            {estimate.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-destructive hover:text-destructive"
                            data-testid={`delete-estimate-${estimate.id}`}
                            onClick={() => {
                              setEstimateToDelete(estimate);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Estimate</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const projectId = formData.get('projectId');
              const clientId = formData.get('clientId');
              const selectedEstimateType = formData.get('estimateType') || 'detailed';
              
              console.log('Form submission data:', {
                name: formData.get('name'),
                clientId,
                projectId,
                validDays: formData.get('validDays'),
                estimateType: selectedEstimateType,
                blockHours: formData.get('blockHours'),
                blockDollars: formData.get('blockDollars')
              });
              
              if (!clientId) {
                toast({
                  title: "Error",
                  description: "Please select a client",
                  variant: "destructive",
                });
                return;
              }
              
              const estimateData: any = {
                name: formData.get('name'),
                clientId,
                projectId: (!projectId || projectId === 'none' || projectId === '') ? null : projectId,
                validDays: parseInt(formData.get('validDays') as string) || 30,
                estimateType: selectedEstimateType,
                pricingType: formData.get('pricingType') || 'hourly',
                estimateDate: formData.get('estimateDate') as string || undefined,
              };
              
              // Add block estimate fields if block type
              if (selectedEstimateType === 'block') {
                const blockHours = formData.get('blockHours') as string;
                const blockDollars = formData.get('blockDollars') as string;
                const blockDescription = formData.get('blockDescription') as string;
                const fixedPrice = formData.get('fixedPrice') as string;
                
                if (blockHours) estimateData.blockHours = parseFloat(blockHours);
                if (blockDollars) estimateData.blockDollars = parseFloat(blockDollars);
                if (blockDescription) estimateData.blockDescription = blockDescription;
                if (fixedPrice) estimateData.fixedPrice = parseFloat(fixedPrice);
              }
              
              createEstimate.mutate(estimateData);
            }}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Estimate Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., Q1 2024 Digital Transformation"
                    required
                    data-testid="input-estimate-name"
                  />
                </div>
                
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="clientId">Client</Label>
                    <Button 
                      type="button"
                      variant="link" 
                      size="sm"
                      onClick={() => setCreateClientDialogOpen(true)}
                      className="h-auto p-0 text-sm"
                      data-testid="button-new-client"
                    >
                      + New Client
                    </Button>
                  </div>
                  <Select name="clientId" required>
                    <SelectTrigger data-testid="select-client">
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(client => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="projectId">Project (Optional)</Label>
                  <Select name="projectId">
                    <SelectTrigger data-testid="select-project">
                      <SelectValue placeholder="Select a project or leave empty for new" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {projects.map(project => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="estimateType">Estimate Type</Label>
                    <Select name="estimateType" defaultValue="detailed" onValueChange={setEstimateType}>
                      <SelectTrigger data-testid="select-estimate-type">
                        <SelectValue placeholder="Select estimate type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="detailed">Detailed (with line items)</SelectItem>
                        <SelectItem value="block">Block (simple hours/dollars)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Block estimates are ideal for retainer projects with fixed hours/dollars
                    </p>
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="pricingType">Pricing Type</Label>
                    <Select name="pricingType" defaultValue="hourly">
                      <SelectTrigger data-testid="select-pricing-type">
                        <SelectValue placeholder="Select pricing type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">Hourly Rate</SelectItem>
                        <SelectItem value="fixed">Fixed Price</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Fixed price for deliverables, hourly for time-based work
                    </p>
                  </div>
                </div>

                {estimateType === 'block' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="blockHours">Total Hours</Label>
                        <Input
                          id="blockHours"
                          name="blockHours"
                          type="number"
                          placeholder="e.g., 100"
                          data-testid="input-block-hours"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="blockDollars">Total Amount ($)</Label>
                        <Input
                          id="blockDollars"
                          name="blockDollars"
                          type="number"
                          placeholder="e.g., 40000"
                          data-testid="input-block-dollars"
                        />
                      </div>
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="fixedPrice">Fixed Price (if applicable)</Label>
                      <Input
                        id="fixedPrice"
                        name="fixedPrice"
                        type="number"
                        placeholder="e.g., 10000 (for fixed-price deliverables)"
                        data-testid="input-fixed-price"
                      />
                      <p className="text-xs text-muted-foreground">
                        For fixed-price projects like workshops or deliverables
                      </p>
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="blockDescription">Description</Label>
                      <textarea
                        id="blockDescription"
                        name="blockDescription"
                        placeholder="Describe the work covered by this block estimate..."
                        className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        data-testid="textarea-block-description"
                      />
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="estimateDate">Estimate Date</Label>
                    <Input
                      id="estimateDate"
                      name="estimateDate"
                      type="date"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      data-testid="input-estimate-date"
                    />
                    <p className="text-xs text-muted-foreground">
                      Date when estimate was created/sent
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="validDays">Valid For (Days)</Label>
                    <Input
                      id="validDays"
                      name="validDays"
                      type="number"
                      defaultValue="30"
                      min="1"
                      max="365"
                      data-testid="input-valid-days"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createEstimate.isPending} data-testid="button-create-estimate">
                  {createEstimate.isPending ? "Creating..." : "Create Estimate"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Create Client Dialog */}
        <Dialog open={createClientDialogOpen} onOpenChange={setCreateClientDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Client</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              createClient.mutate({
                name: formData.get('name'),
                currency: formData.get('currency') || 'USD',
                billingContact: formData.get('billingContact'),
              });
            }}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="clientName">Client Name</Label>
                  <Input
                    id="clientName"
                    name="name"
                    placeholder="e.g., Acme Corporation"
                    required
                    data-testid="input-client-name"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="billingContact">Billing Contact Email</Label>
                  <Input
                    id="billingContact"
                    name="billingContact"
                    type="email"
                    placeholder="billing@acme.com"
                    data-testid="input-billing-contact"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select name="currency" defaultValue="USD">
                    <SelectTrigger data-testid="select-currency">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="CAD">CAD</SelectItem>
                      <SelectItem value="AUD">AUD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateClientDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createClient.isPending} data-testid="button-create-client">
                  {createClient.isPending ? "Creating..." : "Create Client"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Estimate</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the estimate "{estimateToDelete?.name}"? This action cannot be undone. All related data including line items, milestones, epics, and stages will be permanently deleted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setEstimateToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (estimateToDelete) {
                    deleteEstimate.mutate(estimateToDelete.id);
                  }
                }}
                disabled={deleteEstimate.isPending}
                data-testid="confirm-delete-estimate"
              >
                {deleteEstimate.isPending ? "Deleting..." : "Delete Estimate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Copy Estimate Dialog */}
        <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Copy Estimate: {estimateToCopy?.name}</DialogTitle>
            </DialogHeader>
            <Tabs value={copyMode} onValueChange={(v) => setCopyMode(v as 'same' | 'different' | 'new')}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="same" data-testid="tab-same-client">Same Client</TabsTrigger>
                <TabsTrigger value="different" data-testid="tab-different-client">Different Client</TabsTrigger>
                <TabsTrigger value="new" data-testid="tab-new-client">New Client</TabsTrigger>
              </TabsList>

              {/* Same Client Tab */}
              <TabsContent value="same">
                <Form {...copySameForm}>
                  <form onSubmit={copySameForm.handleSubmit((data) => {
                    if (!estimateToCopy) return;
                    copyEstimate.mutate({
                      id: estimateToCopy.id,
                      data: {
                        name: data.name,
                        projectId: data.projectId === 'none' ? null : data.projectId,
                      }
                    });
                  })}>
                    <div className="grid gap-4 py-4">
                      <FormField
                        control={copySameForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estimate Name</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-copy-name" />
                            </FormControl>
                            <FormDescription>
                              Copying to: <strong>{estimateToCopy?.clientName}</strong>
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={copySameForm.control}
                        name="projectId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Project (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || 'none'}>
                              <FormControl>
                                <SelectTrigger data-testid="select-copy-project">
                                  <SelectValue placeholder="Select a project or leave empty" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">No project</SelectItem>
                                {projects.filter(p => p.clientId === estimateToCopy?.clientId).map(project => (
                                  <SelectItem key={project.id} value={project.id}>
                                    {project.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setCopyDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={copyEstimate.isPending} data-testid="button-copy-same">
                        {copyEstimate.isPending ? "Copying..." : "Copy Estimate"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </TabsContent>

              {/* Different Client Tab */}
              <TabsContent value="different">
                <Form {...copyDifferentForm}>
                  <form onSubmit={copyDifferentForm.handleSubmit((data) => {
                    if (!estimateToCopy) return;
                    copyEstimate.mutate({
                      id: estimateToCopy.id,
                      data: {
                        name: data.name,
                        targetClientId: data.targetClientId,
                        projectId: data.projectId === 'none' ? null : data.projectId,
                      }
                    });
                  })}>
                    <div className="grid gap-4 py-4">
                      <FormField
                        control={copyDifferentForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estimate Name</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-diff-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={copyDifferentForm.control}
                        name="targetClientId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Target Client</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-target-client">
                                  <SelectValue placeholder="Select a client" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {clients.filter(c => c.id !== estimateToCopy?.clientId).map(client => (
                                  <SelectItem key={client.id} value={client.id}>
                                    {client.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={copyDifferentForm.control}
                        name="projectId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Project (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || 'none'}>
                              <FormControl>
                                <SelectTrigger data-testid="select-diff-project">
                                  <SelectValue placeholder="Select a project or leave empty" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">No project</SelectItem>
                                {projects.map(project => (
                                  <SelectItem key={project.id} value={project.id}>
                                    {project.name} ({clients.find(c => c.id === project.clientId)?.name})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Make sure the project belongs to the selected client
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setCopyDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={copyEstimate.isPending} data-testid="button-copy-different">
                        {copyEstimate.isPending ? "Copying..." : "Copy Estimate"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </TabsContent>

              {/* New Client Tab */}
              <TabsContent value="new">
                <Form {...copyNewForm}>
                  <form onSubmit={copyNewForm.handleSubmit((data) => {
                    if (!estimateToCopy) return;
                    copyEstimate.mutate({
                      id: estimateToCopy.id,
                      data: {
                        name: data.name,
                        newClient: {
                          name: data.clientName,
                          currency: data.currency,
                          billingContact: data.billingContact || undefined,
                          status: 'pending',
                        }
                      }
                    });
                  })}>
                    <div className="grid gap-4 py-4">
                      <FormField
                        control={copyNewForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estimate Name</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-new-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={copyNewForm.control}
                        name="clientName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>New Client Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g., Acme Corporation" data-testid="input-new-client-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={copyNewForm.control}
                        name="billingContact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Billing Contact Email</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" placeholder="billing@acme.com" data-testid="input-new-billing-contact" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={copyNewForm.control}
                        name="currency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Currency</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-new-currency">
                                  <SelectValue placeholder="Select currency" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="GBP">GBP</SelectItem>
                                <SelectItem value="CAD">CAD</SelectItem>
                                <SelectItem value="AUD">AUD</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setCopyDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={copyEstimate.isPending} data-testid="button-copy-new">
                        {copyEstimate.isPending ? "Creating & Copying..." : "Create Client & Copy"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}