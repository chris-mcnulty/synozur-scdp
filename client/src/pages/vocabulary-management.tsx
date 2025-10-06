import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { VocabularyTerms } from "@shared/schema";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Languages, Building2, FolderOpen, Save, Edit, X, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AllVocabularies {
  organization: VocabularyTerms;
  clients: Array<{ id: string; name: string; vocabulary: VocabularyTerms }>;
  projects: Array<{ id: string; name: string; code: string; clientId: string; clientName: string; vocabulary: VocabularyTerms }>;
}

const vocabularySchema = z.object({
  epic: z.string().min(1).max(50).optional(),
  stage: z.string().min(1).max(50).optional(),
  activity: z.string().min(1).max(50).optional(),
  workstream: z.string().min(1).max(50).optional(),
});

type VocabularyData = z.infer<typeof vocabularySchema>;

export default function VocabularyManagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("organization");
  const [editingClient, setEditingClient] = useState<{ id: string; name: string; vocabulary: VocabularyTerms } | null>(null);
  const [editingProject, setEditingProject] = useState<{ id: string; name: string; code: string; clientId: string; clientName: string; vocabulary: VocabularyTerms } | null>(null);

  const { data: vocabularies, isLoading } = useQuery<AllVocabularies>({
    queryKey: ["/api/vocabulary/all"],
  });

  const orgForm = useForm<VocabularyData>({
    resolver: zodResolver(vocabularySchema),
    defaultValues: {
      epic: vocabularies?.organization?.epic || "Epic",
      stage: vocabularies?.organization?.stage || "Stage",
      activity: vocabularies?.organization?.activity || "Activity",
      workstream: vocabularies?.organization?.workstream || "Workstream",
    },
    values: {
      epic: vocabularies?.organization?.epic || "Epic",
      stage: vocabularies?.organization?.stage || "Stage",
      activity: vocabularies?.organization?.activity || "Activity",
      workstream: vocabularies?.organization?.workstream || "Workstream",
    },
  });

  const clientForm = useForm<VocabularyData>({
    resolver: zodResolver(vocabularySchema),
    defaultValues: {
      epic: "",
      stage: "",
      activity: "",
      workstream: "",
    },
  });

  const projectForm = useForm<VocabularyData>({
    resolver: zodResolver(vocabularySchema),
    defaultValues: {
      epic: "",
      stage: "",
      activity: "",
      workstream: "",
    },
  });

  const updateOrgMutation = useMutation({
    mutationFn: async (data: VocabularyData) => {
      await apiRequest("/api/vocabulary/organization", {
        method: "PUT",
        body: JSON.stringify(data),
      });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/organization"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/context"] });
      orgForm.reset(data);
      toast({
        title: "Organization defaults updated",
        description: "Vocabulary defaults have been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update organization defaults",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async ({ id, vocabulary }: { id: string; vocabulary: VocabularyData }) => {
      await apiRequest(`/api/clients/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          vocabularyOverrides: JSON.stringify(vocabulary),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/context"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setEditingClient(null);
      toast({
        title: "Client vocabulary updated",
        description: "Client-specific vocabulary has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update client vocabulary",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, vocabulary }: { id: string; vocabulary: VocabularyData }) => {
      await apiRequest(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          vocabularyOverrides: JSON.stringify(vocabulary),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/context"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditingProject(null);
      toast({
        title: "Project vocabulary updated",
        description: "Project-specific vocabulary has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update project vocabulary",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteClientVocabularyMutation = useMutation({
    mutationFn: async (clientId: string) => {
      await apiRequest(`/api/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify({
          vocabularyOverrides: null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/context"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({
        title: "Client vocabulary removed",
        description: "Client will now use organization defaults.",
      });
    },
  });

  const deleteProjectVocabularyMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await apiRequest(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          vocabularyOverrides: null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vocabulary/context"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project vocabulary removed",
        description: "Project will now use client or organization defaults.",
      });
    },
  });

  const handleOrgSubmit = (data: VocabularyData) => {
    updateOrgMutation.mutate(data);
  };

  const handleEditClient = (client: { id: string; name: string; vocabulary: VocabularyTerms }) => {
    setEditingClient(client);
    clientForm.reset({
      epic: client.vocabulary.epic || "",
      stage: client.vocabulary.stage || "",
      activity: client.vocabulary.activity || "",
      workstream: client.vocabulary.workstream || "",
    });
  };

  const handleEditProject = (project: { id: string; name: string; code: string; clientId: string; clientName: string; vocabulary: VocabularyTerms }) => {
    setEditingProject(project);
    projectForm.reset({
      epic: project.vocabulary.epic || "",
      stage: project.vocabulary.stage || "",
      activity: project.vocabulary.activity || "",
      workstream: project.vocabulary.workstream || "",
    });
  };

  const handleClientSubmit = (data: VocabularyData) => {
    if (editingClient) {
      updateClientMutation.mutate({ id: editingClient.id, vocabulary: data });
    }
  };

  const handleProjectSubmit = (data: VocabularyData) => {
    if (editingProject) {
      updateProjectMutation.mutate({ id: editingProject.id, vocabulary: data });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading vocabulary settings...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Vocabulary Management</h1>
            <p className="text-muted-foreground">
              Define organizational defaults and manage client and project-specific terminology
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            <Languages className="w-3 h-3 mr-1" />
            Admin Only
          </Badge>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Cascading Priority:</strong> Project-specific → Client-specific → Organization defaults → System defaults
          </AlertDescription>
        </Alert>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="organization" className="flex items-center space-x-2">
              <Languages className="w-4 h-4" />
              <span>Organization Defaults</span>
            </TabsTrigger>
            <TabsTrigger value="clients" className="flex items-center space-x-2">
              <Building2 className="w-4 h-4" />
              <span>Client Overrides ({vocabularies?.clients.length || 0})</span>
            </TabsTrigger>
            <TabsTrigger value="projects" className="flex items-center space-x-2">
              <FolderOpen className="w-4 h-4" />
              <span>Project Overrides ({vocabularies?.projects.length || 0})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="organization" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Languages className="h-5 w-5" />
                  Organization-Wide Vocabulary Defaults
                </CardTitle>
                <CardDescription>
                  These terms are used across the entire organization unless overridden at the client or project level
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...orgForm}>
                  <form onSubmit={orgForm.handleSubmit(handleOrgSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={orgForm.control}
                        name="epic"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Epic Term</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Epic" data-testid="input-org-epic" />
                            </FormControl>
                            <FormDescription>Large unit of work (e.g., Initiative, Program)</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={orgForm.control}
                        name="stage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Stage Term</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Stage" data-testid="input-org-stage" />
                            </FormControl>
                            <FormDescription>Phase or iteration (e.g., Sprint, Wave)</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={orgForm.control}
                        name="activity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Activity Term</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Activity" data-testid="input-org-activity" />
                            </FormControl>
                            <FormDescription>Task or deliverable (e.g., Task, Milestone)</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={orgForm.control}
                        name="workstream"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Workstream Term</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Workstream" data-testid="input-org-workstream" />
                            </FormControl>
                            <FormDescription>Track or stream (e.g., Track, Stream)</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end pt-4">
                      <Button 
                        type="submit" 
                        disabled={updateOrgMutation.isPending}
                        data-testid="button-save-org-vocabulary"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {updateOrgMutation.isPending ? "Saving..." : "Save Organization Defaults"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="clients" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Client-Specific Vocabulary Overrides
                </CardTitle>
                <CardDescription>
                  Clients with custom vocabulary that overrides organization defaults
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!vocabularies?.clients.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No clients have vocabulary overrides. All clients use organization defaults.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client Name</TableHead>
                        <TableHead>Epic Term</TableHead>
                        <TableHead>Stage Term</TableHead>
                        <TableHead>Activity Term</TableHead>
                        <TableHead>Workstream Term</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vocabularies.clients.map((client) => (
                        <TableRow key={client.id} data-testid={`row-client-${client.id}`}>
                          <TableCell className="font-medium">{client.name}</TableCell>
                          <TableCell>{client.vocabulary.epic || <span className="text-muted-foreground italic">-</span>}</TableCell>
                          <TableCell>{client.vocabulary.stage || <span className="text-muted-foreground italic">-</span>}</TableCell>
                          <TableCell>{client.vocabulary.activity || <span className="text-muted-foreground italic">-</span>}</TableCell>
                          <TableCell>{client.vocabulary.workstream || <span className="text-muted-foreground italic">-</span>}</TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditClient(client)}
                              data-testid={`button-edit-client-${client.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteClientVocabularyMutation.mutate(client.id)}
                              data-testid={`button-delete-client-${client.id}`}
                            >
                              <X className="w-4 h-4" />
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

          <TabsContent value="projects" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5" />
                  Project-Specific Vocabulary Overrides
                </CardTitle>
                <CardDescription>
                  Projects with custom vocabulary that overrides client and organization defaults
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!vocabularies?.projects.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No projects have vocabulary overrides. All projects use client or organization defaults.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project Name</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Epic Term</TableHead>
                        <TableHead>Stage Term</TableHead>
                        <TableHead>Activity Term</TableHead>
                        <TableHead>Workstream Term</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vocabularies.projects.map((project) => (
                        <TableRow key={project.id} data-testid={`row-project-${project.id}`}>
                          <TableCell className="font-medium">{project.name}</TableCell>
                          <TableCell>{project.code}</TableCell>
                          <TableCell>{project.clientName}</TableCell>
                          <TableCell>{project.vocabulary.epic || <span className="text-muted-foreground italic">-</span>}</TableCell>
                          <TableCell>{project.vocabulary.stage || <span className="text-muted-foreground italic">-</span>}</TableCell>
                          <TableCell>{project.vocabulary.activity || <span className="text-muted-foreground italic">-</span>}</TableCell>
                          <TableCell>{project.vocabulary.workstream || <span className="text-muted-foreground italic">-</span>}</TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditProject(project)}
                              data-testid={`button-edit-project-${project.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteProjectVocabularyMutation.mutate(project.id)}
                              data-testid={`button-delete-project-${project.id}`}
                            >
                              <X className="w-4 h-4" />
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

        {/* Client Edit Dialog */}
        <Dialog open={!!editingClient} onOpenChange={(open) => !open && setEditingClient(null)}>
          <DialogContent data-testid="dialog-edit-client-vocabulary">
            <DialogHeader>
              <DialogTitle>Edit Client Vocabulary</DialogTitle>
              <DialogDescription>
                Customize vocabulary terms for {editingClient?.name}
              </DialogDescription>
            </DialogHeader>
            <Form {...clientForm}>
              <form onSubmit={clientForm.handleSubmit(handleClientSubmit)} className="space-y-4">
                <FormField
                  control={clientForm.control}
                  name="epic"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Epic Term</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Leave empty to use organization default" data-testid="input-client-epic" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={clientForm.control}
                  name="stage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stage Term</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Leave empty to use organization default" data-testid="input-client-stage" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={clientForm.control}
                  name="activity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Activity Term</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Leave empty to use organization default" data-testid="input-client-activity" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={clientForm.control}
                  name="workstream"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workstream Term</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Leave empty to use organization default" data-testid="input-client-workstream" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingClient(null)}
                    data-testid="button-cancel-client-edit"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={updateClientMutation.isPending}
                    data-testid="button-save-client-vocabulary"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {updateClientMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Project Edit Dialog */}
        <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
          <DialogContent data-testid="dialog-edit-project-vocabulary">
            <DialogHeader>
              <DialogTitle>Edit Project Vocabulary</DialogTitle>
              <DialogDescription>
                Customize vocabulary terms for {editingProject?.name} ({editingProject?.code})
              </DialogDescription>
            </DialogHeader>
            <Form {...projectForm}>
              <form onSubmit={projectForm.handleSubmit(handleProjectSubmit)} className="space-y-4">
                <FormField
                  control={projectForm.control}
                  name="epic"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Epic Term</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Leave empty to use client or organization default" data-testid="input-project-epic" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={projectForm.control}
                  name="stage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stage Term</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Leave empty to use client or organization default" data-testid="input-project-stage" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={projectForm.control}
                  name="activity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Activity Term</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Leave empty to use client or organization default" data-testid="input-project-activity" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={projectForm.control}
                  name="workstream"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workstream Term</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Leave empty to use client or organization default" data-testid="input-project-workstream" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingProject(null)}
                    data-testid="button-cancel-project-edit"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={updateProjectMutation.isPending}
                    data-testid="button-save-project-vocabulary"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {updateProjectMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
