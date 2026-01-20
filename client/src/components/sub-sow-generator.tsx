import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileText, Download, Sparkles, User, Clock, DollarSign, AlertCircle, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SubSOWResource {
  userId: string;
  userName: string;
  roleName: string;
  isSalaried: boolean;
  totalHours: number;
  totalCost: number;
  lineItemCount: number;
}

interface SubSOWAssignment {
  estimateId: string;
  estimateName: string;
  epicName?: string;
  stageName?: string;
  description: string;
  hours: number;
  rate: number;
  amount: number;
  comments?: string;
}

interface SubSOWData {
  projectId: string;
  projectName: string;
  clientName: string;
  resourceId: string;
  resourceName: string;
  resourceEmail: string;
  resourceRole: string;
  isSalaried: boolean;
  totalHours: number;
  totalCost: number;
  assignments: SubSOWAssignment[];
  narrative?: string;
  generatedAt?: string;
}

interface SubSOWGeneratorProps {
  projectId: string;
  projectName: string;
}

export function SubSOWGenerator({ projectId, projectName }: SubSOWGeneratorProps) {
  const { toast } = useToast();
  const [selectedResource, setSelectedResource] = useState<SubSOWResource | null>(null);
  const [subSOWData, setSubSOWData] = useState<SubSOWData | null>(null);
  const [narrative, setNarrative] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateWordContent = () => {
    if (!subSOWData || !selectedResource) return '';
    
    const lines: string[] = [];
    lines.push(`SUB-STATEMENT OF WORK`);
    lines.push(`${'='.repeat(50)}`);
    lines.push('');
    lines.push(`Project: ${subSOWData.projectName}`);
    lines.push(`Client: ${subSOWData.clientName}`);
    lines.push(`Resource: ${subSOWData.resourceName}`);
    lines.push(`Role: ${subSOWData.resourceRole}`);
    lines.push(`Type: ${subSOWData.isSalaried ? 'Salaried Employee' : 'Subcontractor'}`);
    lines.push('');
    lines.push(`SUMMARY`);
    lines.push(`${'-'.repeat(30)}`);
    lines.push(`Total Hours: ${subSOWData.totalHours.toFixed(1)}`);
    if (!subSOWData.isSalaried) {
      lines.push(`Total Cost: $${subSOWData.totalCost.toLocaleString()}`);
    }
    lines.push(`Number of Assignments: ${subSOWData.assignments.length}`);
    lines.push('');
    lines.push(`ASSIGNED TASKS`);
    lines.push(`${'-'.repeat(30)}`);
    
    subSOWData.assignments.forEach((a, idx) => {
      lines.push(`${idx + 1}. ${a.description}`);
      if (a.epicName) lines.push(`   Epic: ${a.epicName}`);
      if (a.stageName) lines.push(`   Stage: ${a.stageName}`);
      lines.push(`   Hours: ${a.hours.toFixed(1)}`);
      if (!subSOWData.isSalaried) {
        lines.push(`   Amount: $${a.amount.toFixed(2)}`);
      }
      lines.push('');
    });
    
    lines.push(`NARRATIVE`);
    lines.push(`${'-'.repeat(30)}`);
    lines.push(narrative || '(No narrative provided)');
    lines.push('');
    lines.push(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    
    return lines.join('\n');
  };

  const handleCopyToClipboard = async () => {
    const content = generateWordContent();
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast({
        title: "Copied to Clipboard",
        description: "Sub-SOW content copied. You can now paste it into Word.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  const { data: resourcesData, isLoading: isLoadingResources } = useQuery<{
    projectId: string;
    projectName: string;
    resources: SubSOWResource[];
  }>({
    queryKey: ['/api/projects', projectId, 'sub-sow', 'resources'],
  });

  const generateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest(`/api/projects/${projectId}/sub-sow/${userId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ generateNarrative: true }),
      });
      return response as SubSOWData;
    },
    onSuccess: (data) => {
      setSubSOWData(data);
      setNarrative(data.narrative || "");
      toast({
        title: "Sub-SOW Generated",
        description: "The narrative has been generated. You can now edit it and download the PDF.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const downloadPdfMutation = useMutation({
    mutationFn: async () => {
      if (!selectedResource) throw new Error("No resource selected");
      
      // Get session ID from localStorage for authentication
      const sessionId = localStorage.getItem('sessionId');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionId) {
        headers['x-session-id'] = sessionId;
      }
      
      const response = await fetch(`/api/projects/${projectId}/sub-sow/${selectedResource.userId}/pdf`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ narrative }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sub-SOW_${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedResource.userName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "PDF Downloaded",
        description: "The Sub-SOW PDF has been downloaded.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Download Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSelectResource = (resource: SubSOWResource) => {
    setSelectedResource(resource);
    setSubSOWData(null);
    setNarrative("");
    setShowDialog(true);
    generateMutation.mutate(resource.userId);
  };

  const resources = resourcesData?.resources || [];

  if (isLoadingResources) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading resources...</span>
        </CardContent>
      </Card>
    );
  }

  if (resources.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Sub-SOW Generator
          </CardTitle>
          <CardDescription>
            Generate Sub-Statements of Work for subcontractors and resources
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <AlertCircle className="w-5 h-5" />
            <span>No resources with team assignments found for this project.</span>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            To generate a Sub-SOW, first add team assignments in the Team tab.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Sub-SOW Generator
          </CardTitle>
          <CardDescription>
            Generate Sub-Statements of Work for subcontractors and resources based on their assigned tasks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Tasks</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((resource) => (
                <TableRow key={resource.userId}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      {resource.userName}
                    </div>
                  </TableCell>
                  <TableCell>{resource.roleName}</TableCell>
                  <TableCell>
                    {resource.isSalaried ? (
                      <Badge variant="secondary">Salaried</Badge>
                    ) : (
                      <Badge variant="outline">Subcontractor</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3" />
                      {resource.totalHours.toFixed(1)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {resource.isSalaried ? (
                      <span className="text-muted-foreground">$0</span>
                    ) : (
                      <span className="flex items-center justify-end gap-1">
                        <DollarSign className="w-3 h-3" />
                        {resource.totalCost.toLocaleString()}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{resource.lineItemCount}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => handleSelectResource(resource)}
                    >
                      <Sparkles className="w-4 h-4 mr-1" />
                      Generate
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sub-SOW for {selectedResource?.userName}</DialogTitle>
            <DialogDescription>
              {selectedResource?.roleName} - {selectedResource?.isSalaried ? 'Salaried Employee' : 'Subcontractor'}
            </DialogDescription>
          </DialogHeader>

          {generateMutation.isPending ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mr-3" />
              <span>Generating Sub-SOW with AI...</span>
            </div>
          ) : subSOWData ? (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">Total Hours</div>
                    <div className="text-2xl font-bold">{subSOWData.totalHours.toFixed(1)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">Total Cost</div>
                    <div className="text-2xl font-bold">
                      {subSOWData.isSalaried ? '$0' : `$${subSOWData.totalCost.toLocaleString()}`}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">Assignments</div>
                    <div className="text-2xl font-bold">{subSOWData.assignments.length}</div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Assigned Tasks</h3>
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Epic</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        {!subSOWData.isSalaried && (
                          <TableHead className="text-right">Amount</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subSOWData.assignments.map((assignment, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">{assignment.epicName || '-'}</TableCell>
                          <TableCell className="text-sm">{assignment.stageName || '-'}</TableCell>
                          <TableCell className="text-sm max-w-xs truncate">{assignment.description}</TableCell>
                          <TableCell className="text-right text-sm">{assignment.hours.toFixed(1)}</TableCell>
                          {!subSOWData.isSalaried && (
                            <TableCell className="text-right text-sm">${assignment.amount.toFixed(2)}</TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">AI-Generated Narrative</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Review and edit the narrative before downloading the PDF.
                </p>
                <Textarea
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                  placeholder="Narrative will appear here after generation..."
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={handleCopyToClipboard}
              disabled={!subSOWData}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy for Word
                </>
              )}
            </Button>
            <Button
              onClick={() => downloadPdfMutation.mutate()}
              disabled={!subSOWData || downloadPdfMutation.isPending}
            >
              {downloadPdfMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
