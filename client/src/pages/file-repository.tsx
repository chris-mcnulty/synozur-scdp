import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, Trash2, FileText, Settings, FolderOpen, Search, Filter, Plus, Edit, Check, X, Eye, Database, FileType, AlertTriangle, CheckCircle } from "lucide-react";
import { Layout } from "@/components/layout/layout";
import type { User } from "@shared/schema";

// Document type options
const DOCUMENT_TYPES = [
  { value: "receipt", label: "Receipt" },
  { value: "invoice", label: "Invoice" },
  { value: "contract", label: "Contract" },
  { value: "statementOfWork", label: "Statement of Work" },
  { value: "estimate", label: "Estimate" },
  { value: "changeOrder", label: "Change Order" },
  { value: "report", label: "Report" }
];

// File interface
interface StoredFile {
  id: string;
  fileName: string;
  originalName: string;
  size: number;
  contentType: string;
  metadata: {
    documentType: string;
    clientId?: string;
    clientName?: string;
    projectId?: string;
    projectCode?: string;
    effectiveDate?: string;
    amount?: number;
    tags?: string;
    createdByUserId: string;
    metadataVersion: number;
  };
  uploadedAt: string;
  uploadedBy: string;
}

// Metadata template interface
interface MetadataTemplate {
  id: string;
  name: string;
  documentType: string;
  fields: {
    name: string;
    type: string;
    required: boolean;
    options?: string[];
  }[];
}

export default function FileRepository() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMetadata, setUploadMetadata] = useState({
    documentType: "receipt",
    projectId: "",
    amount: "",
    tags: ""
  });
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Fetch current user
  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"]
  });

  // Fetch files
  const { data: files = [], isLoading: filesLoading } = useQuery<StoredFile[]>({
    queryKey: ["/api/files", searchQuery, selectedType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (selectedType && selectedType !== "all") params.append("type", selectedType);
      return apiRequest(`/api/files?${params.toString()}`);
    }
  });

  // Fetch storage stats
  const { data: stats } = useQuery({
    queryKey: ["/api/files/stats"],
    queryFn: () => apiRequest("/api/files/stats")
  });

  // Fetch projects for metadata (with client data for display)
  const { data: allProjects = [] } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: () => apiRequest("/api/projects")
  });

  // Filter to active projects and sort by "[Client] - [Project]" alphabetically
  const sortedActiveProjects = useMemo(() => {
    return allProjects
      .filter((p: any) => p.status === 'active')
      .sort((a: any, b: any) => {
        const aDisplay = `${a.client?.name || 'Unknown'} - ${a.name}`;
        const bDisplay = `${b.client?.name || 'Unknown'} - ${b.name}`;
        return aDisplay.localeCompare(bDisplay);
      });
  }, [allProjects]);

  // Upload file mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        headers: {
          "x-session-id": localStorage.getItem("sessionId") || ""
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "File uploaded",
        description: "The file has been uploaded successfully"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files/stats"] });
      setIsUploadDialogOpen(false);
      setUploadFile(null);
      setUploadMetadata({
        documentType: "receipt",
        projectId: "",
        amount: "",
        tags: ""
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Download file mutation
  const downloadMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch(`/api/files/${fileId}/download`, {
        headers: {
          "x-session-id": localStorage.getItem("sessionId") || ""
        }
      });
      
      if (!response.ok) {
        throw new Error("Failed to download file");
      }
      
      const blob = await response.blob();
      const filename = response.headers.get("content-disposition")?.split("filename=")[1]?.replace(/"/g, "") || "download";
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onError: () => {
      toast({
        title: "Download failed",
        description: "Could not download the file",
        variant: "destructive"
      });
    }
  });

  // Delete file mutation
  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => apiRequest(`/api/files/${fileId}`, {
      method: "DELETE"
    }),
    onSuccess: () => {
      toast({
        title: "File deleted",
        description: "The file has been deleted successfully"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files/stats"] });
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Could not delete the file",
        variant: "destructive"
      });
    }
  });

  // Validate files mutation
  const validateMutation = useMutation({
    mutationFn: () => apiRequest("/api/files/validate", {
      method: "POST"
    }),
    onSuccess: (result) => {
      toast({
        title: "Validation complete",
        description: `Validated ${result.totalFiles} files. ${result.issues} issues found.`
      });
    }
  });

  // Get client ID from selected project
  const selectedProject = useMemo(() => {
    return sortedActiveProjects.find((p: any) => p.id === uploadMetadata.projectId);
  }, [sortedActiveProjects, uploadMetadata.projectId]);

  // Handle file upload
  const handleUpload = () => {
    if (!uploadFile || !user) return;

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("documentType", uploadMetadata.documentType);
    // Client is implied by project selection
    if (selectedProject?.clientId) {
      formData.append("clientId", selectedProject.clientId);
    }
    formData.append("projectId", uploadMetadata.projectId);
    if (uploadMetadata.amount) {
      formData.append("amount", uploadMetadata.amount);
    }
    if (uploadMetadata.tags) {
      formData.append("tags", uploadMetadata.tags);
    }

    uploadMutation.mutate(formData);
  };

  // Handle bulk delete
  const handleBulkDelete = () => {
    selectedFiles.forEach(fileId => {
      deleteMutation.mutate(fileId);
    });
    setSelectedFiles([]);
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setUploadFile(files[0]);
      setIsUploadDialogOpen(true);
    }
  };

  return (
    <Layout>
      <div 
        className={`container mx-auto py-6 space-y-6 min-h-screen ${isDragging ? 'bg-accent/20' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag and drop overlay */}
        {isDragging && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="border-2 border-dashed border-primary rounded-lg p-8 bg-card">
              <Upload className="w-16 h-16 mx-auto mb-4 text-primary" />
              <p className="text-lg font-semibold">Drop file here to upload</p>
            </div>
          </div>
        )}
        
        <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">File Repository</h1>
            <p className="text-muted-foreground">Manage documents and attachments</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => validateMutation.mutate()}
              variant="outline"
              disabled={validateMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Validate Files
            </Button>
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-upload-file">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload File
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload File</DialogTitle>
                  <DialogDescription>
                    Upload a new file to the repository with metadata
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="file">File</Label>
                    <Input
                      id="file"
                      type="file"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      data-testid="input-file"
                    />
                  </div>
                  <div>
                    <Label htmlFor="documentType">Document Type</Label>
                    <Select
                      value={uploadMetadata.documentType}
                      onValueChange={(value) => setUploadMetadata({ ...uploadMetadata, documentType: value })}
                    >
                      <SelectTrigger data-testid="select-document-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="project">Project (Client is auto-tagged)</Label>
                    <Select
                      value={uploadMetadata.projectId}
                      onValueChange={(value) => setUploadMetadata({ ...uploadMetadata, projectId: value })}
                    >
                      <SelectTrigger data-testid="select-project">
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedActiveProjects.map((project: any) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.client?.name || 'Unknown'} - {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedProject && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Client: {selectedProject.client?.name || 'Unknown'}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="amount">Amount (optional)</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={uploadMetadata.amount}
                      onChange={(e) => setUploadMetadata({ ...uploadMetadata, amount: e.target.value })}
                      data-testid="input-amount"
                    />
                  </div>
                  <div>
                    <Label htmlFor="tags">Tags (optional)</Label>
                    <Input
                      id="tags"
                      placeholder="Comma-separated tags"
                      value={uploadMetadata.tags}
                      onChange={(e) => setUploadMetadata({ ...uploadMetadata, tags: e.target.value })}
                      data-testid="input-tags"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleUpload}
                    disabled={!uploadFile || uploadMutation.isPending}
                    data-testid="button-confirm-upload"
                  >
                    {uploadMutation.isPending ? "Uploading..." : "Upload"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Files</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalFiles}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Size</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatFileSize(stats.totalSize)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Receipts</CardTitle>
                <FileType className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.byType?.receipt || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Invoices</CardTitle>
                <FileType className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.byType?.invoice || 0}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
              </div>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[200px]" data-testid="select-filter-type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {DOCUMENT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFiles.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" data-testid="button-bulk-delete">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Selected ({selectedFiles.length})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Files</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete {selectedFiles.length} selected files? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBulkDelete} data-testid="button-confirm-bulk-delete">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Files Table */}
        <Card>
          <CardHeader>
            <CardTitle>Files</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedFiles.length === files.length && files.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedFiles(files.map(f => f.id));
                          } else {
                            setSelectedFiles([]);
                          }
                        }}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filesLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center">Loading...</TableCell>
                    </TableRow>
                  ) : files.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center">No files found</TableCell>
                    </TableRow>
                  ) : (
                    files.map((file) => {
                      const project = sortedActiveProjects.find((p: any) => p.id === file.metadata.projectId);
                      return (
                        <TableRow key={file.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedFiles.includes(file.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedFiles([...selectedFiles, file.id]);
                                } else {
                                  setSelectedFiles(selectedFiles.filter(id => id !== file.id));
                                }
                              }}
                              data-testid={`checkbox-file-${file.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              {file.fileName}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {DOCUMENT_TYPES.find(t => t.value === file.metadata.documentType)?.label || file.metadata.documentType}
                            </Badge>
                          </TableCell>
                          <TableCell>{project?.name || "-"}</TableCell>
                          <TableCell>{formatFileSize(file.size)}</TableCell>
                          <TableCell>{formatDate(file.uploadedAt)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => downloadMutation.mutate(file.id)}
                                data-testid={`button-download-${file.id}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="ghost" data-testid={`button-delete-${file.id}`}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete File</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{file.fileName}"? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => deleteMutation.mutate(file.id)}
                                      data-testid={`button-confirm-delete-${file.id}`}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
        </div>
      </div>
    </Layout>
  );
}