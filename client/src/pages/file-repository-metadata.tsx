import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Settings, Tag, Calendar, DollarSign, User, FileType, Hash, List, Check, X } from "lucide-react";

// Field types for metadata
const FIELD_TYPES = [
  { value: "text", label: "Text", icon: FileType },
  { value: "number", label: "Number", icon: Hash },
  { value: "date", label: "Date", icon: Calendar },
  { value: "currency", label: "Currency", icon: DollarSign },
  { value: "select", label: "Select", icon: List },
  { value: "multiselect", label: "Multi-Select", icon: List },
  { value: "user", label: "User", icon: User },
  { value: "boolean", label: "Yes/No", icon: Check },
  { value: "tags", label: "Tags", icon: Tag }
];

interface MetadataField {
  id: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
  defaultValue?: any;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  showInList?: boolean;
  searchable?: boolean;
}

interface MetadataTemplate {
  id: string;
  name: string;
  documentType: string;
  fields: MetadataField[];
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function FileRepositoryMetadata() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<MetadataTemplate | null>(null);
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
  const [isEditFieldOpen, setIsEditFieldOpen] = useState(false);
  const [editingField, setEditingField] = useState<MetadataField | null>(null);
  
  // Template form state
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    documentType: "receipt",
    isDefault: false
  });
  
  // Field form state
  const [newField, setNewField] = useState<Partial<MetadataField>>({
    name: "",
    label: "",
    type: "text",
    required: false,
    showInList: true,
    searchable: true,
    options: []
  });

  // Mock data for templates - in production this would come from API
  const templates: MetadataTemplate[] = [
    {
      id: "1",
      name: "Standard Receipt",
      documentType: "receipt",
      isDefault: true,
      fields: [
        {
          id: "1",
          name: "vendor",
          label: "Vendor",
          type: "text",
          required: true,
          showInList: true,
          searchable: true
        },
        {
          id: "2",
          name: "amount",
          label: "Amount",
          type: "currency",
          required: true,
          showInList: true,
          searchable: false
        },
        {
          id: "3",
          name: "receiptDate",
          label: "Receipt Date",
          type: "date",
          required: true,
          showInList: true,
          searchable: false
        },
        {
          id: "4",
          name: "category",
          label: "Category",
          type: "select",
          required: false,
          options: ["Travel", "Meals", "Supplies", "Equipment", "Services", "Other"],
          showInList: true,
          searchable: true
        },
        {
          id: "5",
          name: "isReimbursable",
          label: "Reimbursable",
          type: "boolean",
          required: false,
          defaultValue: true,
          showInList: false,
          searchable: false
        }
      ],
      createdAt: "2024-01-15T10:00:00Z",
      updatedAt: "2024-01-15T10:00:00Z"
    },
    {
      id: "2",
      name: "Contract Template",
      documentType: "contract",
      isDefault: true,
      fields: [
        {
          id: "6",
          name: "contractNumber",
          label: "Contract Number",
          type: "text",
          required: true,
          showInList: true,
          searchable: true
        },
        {
          id: "7",
          name: "effectiveDate",
          label: "Effective Date",
          type: "date",
          required: true,
          showInList: true,
          searchable: false
        },
        {
          id: "8",
          name: "expirationDate",
          label: "Expiration Date",
          type: "date",
          required: false,
          showInList: true,
          searchable: false
        },
        {
          id: "9",
          name: "totalValue",
          label: "Total Contract Value",
          type: "currency",
          required: false,
          showInList: true,
          searchable: false
        },
        {
          id: "10",
          name: "status",
          label: "Status",
          type: "select",
          required: true,
          options: ["Draft", "Active", "Expired", "Terminated"],
          defaultValue: "Draft",
          showInList: true,
          searchable: true
        }
      ],
      createdAt: "2024-01-20T14:00:00Z",
      updatedAt: "2024-01-20T14:00:00Z"
    }
  ];

  // Create new template
  const handleCreateTemplate = () => {
    if (!newTemplate.name) {
      toast({
        title: "Error",
        description: "Template name is required",
        variant: "destructive"
      });
      return;
    }

    // In production, this would be an API call
    toast({
      title: "Template Created",
      description: `Template "${newTemplate.name}" has been created successfully`
    });
    
    setIsCreateTemplateOpen(false);
    setNewTemplate({ name: "", documentType: "receipt", isDefault: false });
  };

  // Add field to template
  const handleAddField = () => {
    if (!newField.name || !newField.label) {
      toast({
        title: "Error",
        description: "Field name and label are required",
        variant: "destructive"
      });
      return;
    }

    // In production, this would be an API call
    toast({
      title: "Field Added",
      description: `Field "${newField.label}" has been added to the template`
    });
    
    setIsEditFieldOpen(false);
    setNewField({
      name: "",
      label: "",
      type: "text",
      required: false,
      showInList: true,
      searchable: true,
      options: []
    });
  };

  // Delete field from template
  const handleDeleteField = (fieldId: string) => {
    // In production, this would be an API call
    toast({
      title: "Field Deleted",
      description: "The field has been removed from the template"
    });
  };

  // Format field name for display
  const formatFieldName = (name: string) => {
    return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Metadata Templates</h2>
          <p className="text-muted-foreground">Configure custom metadata fields for different document types</p>
        </div>
        <Dialog open={isCreateTemplateOpen} onOpenChange={setIsCreateTemplateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-template">
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Metadata Template</DialogTitle>
              <DialogDescription>
                Create a new metadata template for organizing document fields
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  placeholder="e.g., Standard Invoice"
                  data-testid="input-template-name"
                />
              </div>
              <div>
                <Label htmlFor="document-type">Document Type</Label>
                <Select
                  value={newTemplate.documentType}
                  onValueChange={(value) => setNewTemplate({ ...newTemplate, documentType: value })}
                >
                  <SelectTrigger data-testid="select-document-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receipt">Receipt</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="statementOfWork">Statement of Work</SelectItem>
                    <SelectItem value="estimate">Estimate</SelectItem>
                    <SelectItem value="changeOrder">Change Order</SelectItem>
                    <SelectItem value="report">Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is-default"
                  checked={newTemplate.isDefault}
                  onCheckedChange={(checked) => setNewTemplate({ ...newTemplate, isDefault: checked })}
                />
                <Label htmlFor="is-default">Set as default template for this document type</Label>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreateTemplate} data-testid="button-confirm-create-template">
                Create Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Template List */}
        <div className="col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedTemplate?.id === template.id
                        ? "bg-accent border-accent-foreground"
                        : "hover:bg-accent/50"
                    }`}
                    data-testid={`template-${template.id}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{template.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatFieldName(template.documentType)}
                        </div>
                      </div>
                      {template.isDefault && (
                        <Badge variant="secondary" className="text-xs">Default</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {template.fields.length} fields
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Template Details */}
        <div className="col-span-2">
          {selectedTemplate ? (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>{selectedTemplate.name}</CardTitle>
                  <div className="flex gap-2">
                    <Dialog open={isEditFieldOpen} onOpenChange={setIsEditFieldOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" data-testid="button-add-field">
                          <Plus className="w-4 h-4 mr-2" />
                          Add Field
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>
                            {editingField ? "Edit Field" : "Add New Field"}
                          </DialogTitle>
                          <DialogDescription>
                            Configure the metadata field properties
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-4 py-4">
                          <div>
                            <Label htmlFor="field-name">Field Name (Internal)</Label>
                            <Input
                              id="field-name"
                              value={newField.name}
                              onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                              placeholder="e.g., vendorName"
                              data-testid="input-field-name"
                            />
                          </div>
                          <div>
                            <Label htmlFor="field-label">Display Label</Label>
                            <Input
                              id="field-label"
                              value={newField.label}
                              onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                              placeholder="e.g., Vendor Name"
                              data-testid="input-field-label"
                            />
                          </div>
                          <div>
                            <Label htmlFor="field-type">Field Type</Label>
                            <Select
                              value={newField.type}
                              onValueChange={(value) => setNewField({ ...newField, type: value })}
                            >
                              <SelectTrigger data-testid="select-field-type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FIELD_TYPES.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>
                                    <div className="flex items-center gap-2">
                                      <type.icon className="w-4 h-4" />
                                      {type.label}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {(newField.type === "select" || newField.type === "multiselect") && (
                            <div>
                              <Label htmlFor="field-options">Options (comma-separated)</Label>
                              <Input
                                id="field-options"
                                value={newField.options?.join(", ")}
                                onChange={(e) => setNewField({ 
                                  ...newField, 
                                  options: e.target.value.split(",").map(o => o.trim()) 
                                })}
                                placeholder="Option 1, Option 2, Option 3"
                                data-testid="input-field-options"
                              />
                            </div>
                          )}
                          <div className="col-span-2 space-y-3">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="field-required"
                                checked={newField.required}
                                onCheckedChange={(checked) => setNewField({ ...newField, required: !!checked })}
                              />
                              <Label htmlFor="field-required">Required field</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="field-show-list"
                                checked={newField.showInList}
                                onCheckedChange={(checked) => setNewField({ ...newField, showInList: !!checked })}
                              />
                              <Label htmlFor="field-show-list">Show in file list</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="field-searchable"
                                checked={newField.searchable}
                                onCheckedChange={(checked) => setNewField({ ...newField, searchable: !!checked })}
                              />
                              <Label htmlFor="field-searchable">Make searchable</Label>
                            </div>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleAddField} data-testid="button-confirm-add-field">
                            {editingField ? "Update Field" : "Add Field"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="outline">
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Template
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Required</TableHead>
                      <TableHead>List</TableHead>
                      <TableHead>Searchable</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedTemplate.fields.map((field) => {
                      const fieldType = FIELD_TYPES.find(t => t.value === field.type);
                      const FieldIcon = fieldType?.icon || FileType;
                      
                      return (
                        <TableRow key={field.id}>
                          <TableCell className="font-medium">{field.label}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FieldIcon className="w-4 h-4 text-muted-foreground" />
                              {fieldType?.label || field.type}
                            </div>
                          </TableCell>
                          <TableCell>
                            {field.required ? (
                              <Badge variant="secondary">Required</Badge>
                            ) : (
                              <span className="text-muted-foreground">Optional</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {field.showInList ? <Check className="w-4 h-4" /> : <X className="w-4 h-4 text-muted-foreground" />}
                          </TableCell>
                          <TableCell>
                            {field.searchable ? <Check className="w-4 h-4" /> : <X className="w-4 h-4 text-muted-foreground" />}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingField(field);
                                  setNewField(field);
                                  setIsEditFieldOpen(true);
                                }}
                                data-testid={`button-edit-field-${field.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="ghost" data-testid={`button-delete-field-${field.id}`}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Field</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete the field "{field.label}"? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => handleDeleteField(field.id)}
                                      data-testid={`button-confirm-delete-field-${field.id}`}
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
                    })}
                  </TableBody>
                </Table>
                
                {field.type === "select" || field.type === "multiselect" ? (
                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    <Label className="text-sm font-medium">Options</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedTemplate.fields.find(f => f.type === "select" || f.type === "multiselect")?.options?.map((option, i) => (
                        <Badge key={i} variant="secondary">{option}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-96">
                <Settings className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Select a template to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}