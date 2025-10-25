import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/layout/layout";
import { Loader2, CheckCircle, XCircle, AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export function AdminSharePoint() {
  const [testResult, setTestResult] = useState<any>(null);
  const { hasAnyRole, user, isLoading: authLoading } = useAuth();

  // Check if user is admin
  const isAdmin = hasAnyRole(['admin']);

  // Get SharePoint configuration
  const { data: config, isLoading: configLoading } = useQuery<any>({
    queryKey: ['/api/sharepoint/config'],
  });

  // Check container registration status
  const { data: regStatus, isLoading: regLoading, refetch: refetchRegStatus } = useQuery<any>({
    queryKey: ['/api/admin/container-registration-status'],
    retry: false,
    enabled: isAdmin // Only query if user is admin
  });

  // Register container type mutation
  const registerMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/admin/register-container-type', {
        method: 'POST',
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message || "Container type registered successfully"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/container-registration-status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to register container type",
        variant: "destructive"
      });
    }
  });

  // Test file upload mutation
  const testUploadMutation = useMutation({
    mutationFn: async () => {
      // Create a small test file
      const testContent = `Test file created at ${new Date().toISOString()}`;
      const blob = new Blob([testContent], { type: 'text/plain' });
      const file = new File([blob], 'test-file.txt', { type: 'text/plain' });
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folderPath', '/test');
      
      const response = await fetch('/api/sharepoint/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          'x-session-id': localStorage.getItem('sessionId') || ''
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setTestResult({ success: true, data });
      toast({
        title: "Success",
        description: "Test file uploaded successfully to SharePoint"
      });
    },
    onError: (error: any) => {
      setTestResult({ success: false, error: error.message });
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const getStatusIcon = (isRegistered: boolean) => {
    if (isRegistered) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    return <XCircle className="w-5 h-5 text-red-500" />;
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  // Show access denied if not admin
  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <ShieldAlert className="w-16 h-16 text-destructive" />
          <h2 className="text-2xl font-bold">Access Denied</h2>
          <p className="text-muted-foreground">You need administrator privileges to access this page.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">SharePoint Embedded Diagnostics</h1>
          <p className="text-muted-foreground">
            Check and manage SharePoint Embedded container configuration
          </p>
        </div>

        {/* Configuration Info */}
        <Card>
          <CardHeader>
            <CardTitle>Container Configuration</CardTitle>
            <CardDescription>Current SharePoint Embedded container settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {configLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading configuration...</span>
              </div>
            ) : config ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="font-semibold">Environment:</div>
                  <div>{config.environment}</div>
                  
                  <div className="font-semibold">Container ID:</div>
                  <div className="font-mono text-sm break-all">{config.containerId || 'Not configured'}</div>
                  
                  <div className="font-semibold">Container Type ID:</div>
                  <div className="font-mono text-sm break-all">{config.containerTypeId}</div>
                  
                  <div className="font-semibold">Container Name:</div>
                  <div>{config.containerName}</div>
                  
                  <div className="font-semibold">Configured:</div>
                  <div>
                    {config.configured ? (
                      <Badge variant="default">Yes</Badge>
                    ) : (
                      <Badge variant="destructive">No</Badge>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">Failed to load configuration</div>
            )}
          </CardContent>
        </Card>

        {/* Registration Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Container Type Registration</CardTitle>
                <CardDescription>
                  Your app must be registered with the container type
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchRegStatus()}
                disabled={regLoading}
                data-testid="button-refresh-status"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${regLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {regLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Checking registration status...</span>
              </div>
            ) : regStatus ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {getStatusIcon(regStatus.isRegistered)}
                  <div>
                    <div className="font-semibold">
                      {regStatus.isRegistered ? 'Registered' : 'Not Registered'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {regStatus.message}
                    </div>
                  </div>
                </div>

                {regStatus.details && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Technical Details
                    </summary>
                    <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto">
                      {JSON.stringify(regStatus.details, null, 2)}
                    </pre>
                  </details>
                )}

                {!regStatus.isRegistered && (
                  <Button
                    onClick={() => registerMutation.mutate()}
                    disabled={registerMutation.isPending}
                    data-testid="button-register-container-type"
                  >
                    {registerMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Register Container Type
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-yellow-600">
                <AlertTriangle className="w-5 h-5" />
                <span>Unable to check registration status</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Connection Test */}
        <Card>
          <CardHeader>
            <CardTitle>Connection Test</CardTitle>
            <CardDescription>
              Test file upload to verify SharePoint Embedded is working
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => testUploadMutation.mutate()}
              disabled={testUploadMutation.isPending || !config?.configured}
              data-testid="button-test-upload"
            >
              {testUploadMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Test File Upload
            </Button>

            {testResult && (
              <div className={`p-4 rounded-lg border ${
                testResult.success 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-start gap-3">
                  {testResult.success ? (
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="font-semibold mb-1">
                      {testResult.success ? 'Upload Successful' : 'Upload Failed'}
                    </div>
                    <div className="text-sm">
                      {testResult.success ? (
                        <div>
                          <div>File ID: {testResult.data.id}</div>
                          <div>File: {testResult.data.fileName}</div>
                        </div>
                      ) : (
                        <div className="text-red-700">{testResult.error}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Help */}
        <Card>
          <CardHeader>
            <CardTitle>Troubleshooting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>If upload fails:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Verify the container ID secrets are updated with the new container IDs</li>
              <li>Ensure container type is registered (use button above)</li>
              <li>Check that Azure AD app has Container.Selected permissions</li>
              <li>Verify the container type is PAYGO (standard), not trial</li>
              <li>Restart the application after updating secrets</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
