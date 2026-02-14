import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient, getSessionId } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Plus, Edit2, Trash2, Upload, FileText, Brain } from "lucide-react";
import type { GroundingDocument, GroundingDocCategory } from "@shared/schema";
import { GROUNDING_DOC_CATEGORY_LABELS, groundingDocCategoryEnum } from "@shared/schema";

const groundingDocFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: groundingDocCategoryEnum,
  content: z.string().min(1, "Content is required"),
  priority: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
  isTenantBackground: z.boolean().default(false),
});

type GroundingDocFormData = z.infer<typeof groundingDocFormSchema>;

export default function PlatformGroundingDocs() {
  const { isPlatformAdmin } = useAuth();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<GroundingDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: documents, isLoading } = useQuery<GroundingDocument[]>({
    queryKey: ["/api/grounding-documents", "?scope=platform"],
  });

  const form = useForm<GroundingDocFormData>({
    resolver: zodResolver(groundingDocFormSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "general",
      content: "",
      priority: 0,
      isActive: true,
      isTenantBackground: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: GroundingDocFormData) => {
      const payload = { ...data, tenantId: null };
      return apiRequest("/api/grounding-documents", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grounding-documents"] });
      setIsCreateOpen(false);
      form.reset();
      toast({ title: "Grounding document created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create document", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: GroundingDocFormData & { id: string }) => {
      const { id, ...rest } = data;
      return apiRequest(`/api/grounding-documents/${id}`, { method: "PATCH", body: JSON.stringify(rest) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grounding-documents"] });
      setEditingDoc(null);
      form.reset();
      toast({ title: "Grounding document updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update document", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/grounding-documents/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grounding-documents"] });
      toast({ title: "Grounding document deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete document", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest(`/api/grounding-documents/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grounding-documents"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to toggle document status", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: GroundingDocFormData) => {
    if (editingDoc) {
      updateMutation.mutate({ ...data, id: editingDoc.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditDialog = (doc: GroundingDocument) => {
    setEditingDoc(doc);
    form.reset({
      title: doc.title,
      description: doc.description || "",
      category: doc.category as GroundingDocCategory,
      content: doc.content,
      priority: doc.priority ?? 0,
      isActive: doc.isActive ?? true,
      isTenantBackground: doc.isTenantBackground ?? false,
    });
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const endpoint = file.name.endsWith(".pdf") ? "/api/ai/parse-pdf" : "/api/ai/parse-docx";
      const headers: Record<string, string> = {};
      const sid = getSessionId();
      if (sid) headers['x-session-id'] = sid;
      const response = await fetch(endpoint, { method: "POST", body: formData, credentials: "include", headers });
      const data = await response.json();
      if (data.text) {
        form.setValue("content", data.text);
        toast({ title: "File parsed successfully", description: `Extracted ${data.text.length} characters` });
      }
    } catch (error: any) {
      toast({ title: "Failed to parse file", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const contentValue = form.watch("content");

  const renderForm = (isEdit: boolean) => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Document title" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Optional description..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.entries(GROUNDING_DOC_CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Priority</FormLabel>
              <FormControl>
                <Input type="number" placeholder="0" {...field} />
              </FormControl>
              <FormDescription>Higher values are included first in AI prompts</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Active</FormLabel>
                <FormDescription>Include this document in AI context</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isTenantBackground"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Tenant Background</FormLabel>
                <FormDescription>Auto-include in all tenant AI conversations</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Content</FormLabel>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".pdf,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isUploading ? "Parsing..." : "Upload PDF or DOCX"}
                </Button>
              </div>
              <FormControl>
                <Textarea className="min-h-[200px]" placeholder="Paste or type document content..." {...field} />
              </FormControl>
              <div className="text-xs text-muted-foreground mt-1">
                {contentValue ? `${contentValue.length} characters · ${contentValue.split(/\s+/).filter(Boolean).length} words` : "0 characters · 0 words"}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => isEdit ? setEditingDoc(null) : setIsCreateOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
            {isEdit
              ? (updateMutation.isPending ? "Updating..." : "Update Document")
              : (createMutation.isPending ? "Creating..." : "Create Document")}
          </Button>
        </div>
      </form>
    </Form>
  );

  if (!isPlatformAdmin) {
    return (
      <Layout>
        <div className="p-6">
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">You do not have permission to access this page.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Brain className="h-8 w-8" />
              AI Grounding Documents
            </h1>
            <p className="text-muted-foreground mt-1">Manage platform-wide knowledge documents that enhance AI-generated content across all tenants.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { form.reset(); setEditingDoc(null); }}>
                <Plus className="h-4 w-4 mr-2" />
                New Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Grounding Document</DialogTitle>
                <DialogDescription>Add a new knowledge document for AI context</DialogDescription>
              </DialogHeader>
              {renderForm(false)}
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              All Documents
            </CardTitle>
            <CardDescription>
              {documents?.length || 0} document{(documents?.length || 0) !== 1 ? "s" : ""} configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 flex-1" />
                  </div>
                ))}
              </div>
            ) : !documents?.length ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">No grounding documents</h3>
                <p className="text-muted-foreground mb-4">Create your first document to enhance AI-generated content.</p>
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Document
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Background</TableHead>
                    <TableHead>Content Preview</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">{doc.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {GROUNDING_DOC_CATEGORY_LABELS[doc.category as GroundingDocCategory] || doc.category}
                        </Badge>
                      </TableCell>
                      <TableCell>{doc.priority ?? 0}</TableCell>
                      <TableCell>
                        <Switch
                          checked={doc.isActive ?? true}
                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: doc.id, isActive: checked })}
                        />
                      </TableCell>
                      <TableCell>
                        {doc.isTenantBackground ? (
                          <Badge variant="secondary">Yes</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">No</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span className="text-sm text-muted-foreground truncate block">
                          {doc.content.length > 150 ? doc.content.substring(0, 150) + "..." : doc.content}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Dialog open={editingDoc?.id === doc.id} onOpenChange={(open) => !open && setEditingDoc(null)}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => openEditDialog(doc)}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>Edit Grounding Document</DialogTitle>
                                <DialogDescription>Update document settings and content</DialogDescription>
                              </DialogHeader>
                              {renderForm(true)}
                            </DialogContent>
                          </Dialog>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Document</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{doc.title}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(doc.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
