import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { 
  Settings, 
  Save, 
  Eye, 
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Hash,
  Calendar,
  Type
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { BatchSettings, BatchIdPreviewRequest, BatchIdPreviewResponse } from "@shared/schema";

interface BatchSettingsUpdate {
  prefix: string;
  useSequential: boolean;
  includeDate: boolean;
  dateFormat: string;
  sequencePadding: number;
  resetSequence?: boolean;
}

export function BatchSettings() {
  const { toast } = useToast();
  const [previewDates, setPreviewDates] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [previewResult, setPreviewResult] = useState<string>('');
  const [editingGlNumber, setEditingGlNumber] = useState(false);
  const [newGlNumber, setNewGlNumber] = useState<string>('');

  // Fetch current batch settings
  const { data: settings, isLoading } = useQuery<BatchSettings>({
    queryKey: ["/api/billing/batch-settings"],
  });

  // Type-safe settings access with defaults
  const batchSettings: BatchSettings = {
    prefix: settings?.prefix || 'BATCH',
    includeDate: settings?.includeDate ?? true,
    dateFormat: settings?.dateFormat || 'YYYY-MM',
    useSequential: settings?.useSequential ?? false,
    sequencePadding: settings?.sequencePadding || 3,
    currentSequence: settings?.currentSequence
  };

  // Update settings mutation
  const updateMutation = useMutation<void, Error, BatchSettingsUpdate>({
    mutationFn: (data: BatchSettingsUpdate) => apiRequest("/api/billing/batch-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/batch-settings"] });
      toast({ 
        title: "Settings updated successfully",
        description: "Batch numbering settings have been saved."
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update settings", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Preview batch ID mutation
  const previewMutation = useMutation<BatchIdPreviewResponse, Error, BatchIdPreviewRequest>({
    mutationFn: (dates: BatchIdPreviewRequest) => 
      apiRequest("/api/billing/batch-id-preview", {
        method: "POST",
        body: JSON.stringify(dates),
      }),
    onSuccess: (data) => {
      setPreviewResult(data.batchId);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Preview failed", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      prefix: formData.get('prefix') as string,
      useSequential: formData.get('useSequential') === 'true',
      includeDate: formData.get('includeDate') === 'true',
      dateFormat: formData.get('dateFormat') as string,
      sequencePadding: parseInt(formData.get('sequencePadding') as string),
      resetSequence: formData.get('resetSequence') === 'true'
    };

    updateMutation.mutate(data);
  };

  const handlePreview = () => {
    previewMutation.mutate(previewDates);
  };

  const { data: glNumberData } = useQuery<{ nextGlInvoiceNumber: number; formatted: string }>({
    queryKey: ["/api/billing/gl-invoice-number"],
  });

  const glNumberMutation = useMutation({
    mutationFn: (nextGlInvoiceNumber: number) => apiRequest("/api/billing/gl-invoice-number", {
      method: "PUT",
      body: JSON.stringify({ nextGlInvoiceNumber }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/gl-invoice-number"] });
      setEditingGlNumber(false);
      toast({ title: "GL invoice number counter updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update counter", description: error.message, variant: "destructive" });
    },
  });

  const handleGlNumberSave = () => {
    const num = parseInt(newGlNumber, 10);
    if (isNaN(num) || num < 0) {
      toast({ title: "Invalid number", description: "Please enter a valid non-negative number.", variant: "destructive" });
      return;
    }
    glNumberMutation.mutate(num);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Batch Numbering Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-6 bg-muted animate-pulse rounded" />
            <div className="h-6 bg-muted animate-pulse rounded" />
            <div className="h-6 bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card data-testid="batch-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Batch Numbering Settings
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure how invoice batch IDs are generated automatically
          </p>
        </CardHeader>
        <CardContent>
          <form name="batch-settings-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Batch Prefix */}
            <div className="space-y-2">
              <Label htmlFor="prefix" className="flex items-center gap-2">
                <Type className="w-4 h-4" />
                Batch Prefix
              </Label>
              <Input
                id="prefix"
                name="prefix"
                defaultValue={batchSettings.prefix}
                placeholder="e.g., BATCH, INV, BILL"
                required
                data-testid="input-batch-prefix"
              />
              <p className="text-xs text-muted-foreground">
                Text that appears at the beginning of every batch ID
              </p>
            </div>

            <Separator />

            {/* Date Configuration */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Include Date
                </Label>
                <Switch
                  name="includeDate"
                  defaultChecked={batchSettings.includeDate}
                  data-testid="switch-include-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dateFormat">Date Format</Label>
                <Select name="dateFormat" defaultValue={batchSettings.dateFormat}>
                  <SelectTrigger data-testid="select-date-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YYYY-MM">YYYY-MM (e.g., 2024-03)</SelectItem>
                    <SelectItem value="YYYYMM">YYYYMM (e.g., 202403)</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (e.g., 2024-03-15)</SelectItem>
                    <SelectItem value="YYYYMMDD">YYYYMMDD (e.g., 20240315)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Sequential Numbering */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Use Sequential Numbering
                </Label>
                <Switch
                  name="useSequential"
                  defaultChecked={batchSettings.useSequential}
                  data-testid="switch-sequential"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sequencePadding">Sequence Padding</Label>
                <Select name="sequencePadding" defaultValue={batchSettings.sequencePadding.toString()}>
                  <SelectTrigger data-testid="select-sequence-padding">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 digit (1, 2, 3...)</SelectItem>
                    <SelectItem value="2">2 digits (01, 02, 03...)</SelectItem>
                    <SelectItem value="3">3 digits (001, 002, 003...)</SelectItem>
                    <SelectItem value="4">4 digits (0001, 0002, 0003...)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {batchSettings.currentSequence !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Current sequence:</span>
                  <Badge variant="outline">{batchSettings.currentSequence}</Badge>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Switch
                  name="resetSequence"
                  data-testid="switch-reset-sequence"
                />
                <Label htmlFor="resetSequence" className="text-sm">
                  Reset sequence counter to 0
                </Label>
              </div>
            </div>

            <Separator />

            {/* Save Button */}
            <div className="flex justify-end">
              <Button 
                type="submit" 
                disabled={updateMutation.isPending}
                data-testid="button-save-settings"
              >
                {updateMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Settings
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Preview Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Preview Batch ID
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Test how batch IDs will look with your current settings
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="previewStartDate">Start Date</Label>
              <Input
                id="previewStartDate"
                type="date"
                value={previewDates.startDate}
                onChange={(e) => setPreviewDates(prev => ({ ...prev, startDate: e.target.value }))}
                data-testid="input-preview-start-date"
              />
            </div>
            <div>
              <Label htmlFor="previewEndDate">End Date</Label>
              <Input
                id="previewEndDate"
                type="date"
                value={previewDates.endDate}
                onChange={(e) => setPreviewDates(prev => ({ ...prev, endDate: e.target.value }))}
                data-testid="input-preview-end-date"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button 
              type="button"
              variant="outline"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              data-testid="button-preview-batch-id"
            >
              {previewMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Eye className="w-4 h-4 mr-2" />
              )}
              Generate Preview
            </Button>

            {previewResult && (
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm text-muted-foreground">Preview:</span>
                <Badge variant="outline" className="font-mono" data-testid="preview-result">
                  {previewResult}
                </Badge>
              </div>
            )}
          </div>

          <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Current format example:</strong> With prefix "{batchSettings.prefix}", 
              {batchSettings.includeDate && ` date format "${batchSettings.dateFormat}",`}
              {batchSettings.useSequential && ` sequential numbering with ${batchSettings.sequencePadding} digits,`}
              {!batchSettings.useSequential && " timestamp-based suffix,"}
              {" "}batch IDs will look like the preview above.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="w-5 h-5" />
            GL Invoice Number Counter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Each new invoice batch is automatically assigned an incrementing GL invoice number. You can view and reset the counter below.
          </p>

          <div className="flex items-center gap-4">
            <div>
              <Label className="text-sm font-medium">Next GL Invoice Number</Label>
              <div className="flex items-center gap-3 mt-1.5">
                {editingGlNumber ? (
                  <>
                    <Input
                      type="number"
                      min={0}
                      value={newGlNumber}
                      onChange={(e) => setNewGlNumber(e.target.value)}
                      className="w-36 font-mono"
                      data-testid="input-gl-number"
                    />
                    <Button size="sm" onClick={handleGlNumberSave} disabled={glNumberMutation.isPending} data-testid="button-save-gl-number">
                      <Save className="w-4 h-4 mr-1" />
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingGlNumber(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="font-mono text-base px-3 py-1" data-testid="gl-number-display">
                      {glNumberData?.formatted || '—'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      (numeric: {glNumberData?.nextGlInvoiceNumber ?? '—'})
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setNewGlNumber(String(glNumberData?.nextGlInvoiceNumber ?? 1000));
                        setEditingGlNumber(true);
                      }}
                      data-testid="button-edit-gl-number"
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Reset Counter
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Numbers starting with <strong>0</strong> (e.g., 01000) indicate development invoices. 
              Production numbers start without a leading zero (e.g., 10066).
              The number auto-increments each time a new invoice batch is created.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}