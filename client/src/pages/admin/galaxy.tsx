import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Trash2, RotateCw, Plus, ExternalLink, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { GALAXY_SCOPES } from "@shared/schema";
import { Layout } from "@/components/layout/layout";

interface GalaxyApp {
  id: string;
  name: string;
  description: string | null;
  redirectUris: string[];
  webhookUrl: string | null;
  allowedScopes: string[];
  originAllowList: string[];
  rateLimitPerMin: number;
  tokenRateLimitPerMin: number;
  createdAt: string;
  disabledAt: string | null;
  rotatedAt: string | null;
  clientId: string | null;
  clientName: string | null;
  clientShortName: string | null;
}

interface ClientOption {
  id: string;
  name: string;
  shortName?: string | null;
}

interface GalaxyGrant {
  id: string;
  appId: string;
  clientUserId: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  clientId: string | null;
  clientName: string | null;
  scopes: string[];
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface GalaxyAudit {
  id: string;
  appId: string | null;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  errorCode: string | null;
  scopeMissing: string | null;
  ipAddress: string | null;
  origin: string | null;
  createdAt: string;
}

interface GalaxyWebhook {
  id: string;
  appId: string;
  event: string;
  status: string;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

function CopySecret({ value }: { value: string }) {
  const { toast } = useToast();
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2 font-mono text-sm">
      <span className="break-all flex-1">{value}</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast({ title: "Copied to clipboard" });
        }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

function RegisterAppDialog() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ clientId: string; clientSecret: string; webhookSecret: string } | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [redirectUris, setRedirectUris] = useState("");
  const [webhookUrl, setWhUrl] = useState("");
  const [origins, setOrigins] = useState("");
  const [scopes, setScopes] = useState<string[]>([...GALAXY_SCOPES]);
  const [scopedClientId, setScopedClientId] = useState<string>("__none__");

  const { toast } = useToast();

  const clientsQuery = useQuery<ClientOption[]>({
    queryKey: ["/api/clients"],
    enabled: open && !created,
  });

  const create = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        description: description || undefined,
        redirectUris: redirectUris.split(/\s+/).filter(Boolean),
        webhookUrl: webhookUrl || undefined,
        originAllowList: origins.split(/\s+/).filter(Boolean),
        allowedScopes: scopes,
        clientId: scopedClientId === "__none__" ? null : scopedClientId,
      };
      return apiRequest("/api/admin/galaxy/apps", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (data) => {
      setCreated({ clientId: data.clientId, clientSecret: data.clientSecret, webhookSecret: data.webhookSecret });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/galaxy/apps"] });
    },
    onError: (e: any) => toast({ title: "Failed to register app", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCreated(null); setName(""); setDescription(""); setRedirectUris(""); setWhUrl(""); setOrigins(""); setScopedClientId("__none__"); } }}>
      <DialogTrigger asChild>
        <Button data-testid="btn-register-app"><Plus className="h-4 w-4 mr-2" />Register app</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{created ? "App registered" : "Register Galaxy app"}</DialogTitle>
        </DialogHeader>
        {created ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Save these credentials now — the secret will not be shown again.
            </p>
            <div>
              <Label>Client ID</Label>
              <CopySecret value={created.clientId} />
            </div>
            <div>
              <Label>Client secret</Label>
              <CopySecret value={created.clientSecret} />
            </div>
            <div>
              <Label>Webhook signing secret</Label>
              <CopySecret value={created.webhookSecret} />
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-app-name" /></div>
            <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div>
              <Label>Restrict to client (optional)</Label>
              <Select value={scopedClientId} onValueChange={setScopedClientId}>
                <SelectTrigger data-testid="select-app-client"><SelectValue placeholder="Tenant-wide (any client)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Tenant-wide (any client)</SelectItem>
                  {clientsQuery.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.shortName ? `${c.shortName} — ${c.name}` : c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                When set, tokens issued by this app may only act on behalf of portal users belonging to the selected client. Other clients' portal users will be rejected at consent time.
              </p>
            </div>
            <div><Label>Redirect URIs (whitespace separated)</Label><Textarea value={redirectUris} onChange={(e) => setRedirectUris(e.target.value)} placeholder="https://portal.example.com/oauth/callback" /></div>
            <div><Label>Webhook URL (optional)</Label><Input value={webhookUrl} onChange={(e) => setWhUrl(e.target.value)} placeholder="https://example.com/webhook" /></div>
            <div><Label>Allowed origins (whitespace separated)</Label><Input value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder="https://portal.example.com" /></div>
            <div>
              <Label>Scopes</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {GALAXY_SCOPES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={scopes.includes(s)}
                      onCheckedChange={(v) => setScopes(v ? [...scopes, s] : scopes.filter((x) => x !== s))}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !name || !redirectUris.trim() || scopes.length === 0}>
                {create.isPending ? "Registering..." : "Register"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GrantConsentDialog({ app, clients }: { app: GalaxyApp; clients: ClientOption[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string>(app.clientId ?? "__none__");
  const [scopes, setScopes] = useState<string[]>(app.allowedScopes);

  const grant = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/galaxy/apps/${app.id}/grants`, {
        method: "POST",
        body: JSON.stringify({ clientId, scopes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/galaxy/apps", app.id, "grants"] });
      toast({ title: "Consent granted", description: "The client can now obtain client_credentials tokens." });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Failed to grant consent", description: e.message, variant: "destructive" }),
  });

  const eligibleClients = app.clientId
    ? clients.filter((c) => c.id === app.clientId)
    : clients;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!!app.disabledAt}>
          <ShieldCheck className="h-3 w-3 mr-1" />Grant consent
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant client consent — {app.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Creates a pre-authorized consent record so this app can obtain <code className="bg-muted px-1 rounded text-xs">client_credentials</code> tokens for the selected client without requiring a portal user to complete the OAuth flow first.
          </p>
          <div>
            <Label>Client</Label>
            <Select
              value={clientId}
              onValueChange={setClientId}
              disabled={!!app.clientId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a client…" />
              </SelectTrigger>
              <SelectContent>
                {!app.clientId && <SelectItem value="__none__">— Select a client —</SelectItem>}
                {eligibleClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.shortName ? `${c.shortName} — ${c.name}` : c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {app.clientId && (
              <p className="text-xs text-muted-foreground mt-1">This app is scoped to one client and cannot be changed.</p>
            )}
          </div>
          <div>
            <Label>Scopes to grant</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {app.allowedScopes.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={scopes.includes(s)}
                    onCheckedChange={(v) => setScopes(v ? [...scopes, s] : scopes.filter((x) => x !== s))}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => grant.mutate()}
            disabled={grant.isPending || !clientId || clientId === "__none__" || scopes.length === 0}
          >
            {grant.isPending ? "Granting…" : "Grant consent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AppRow({ a, clients }: { a: GalaxyApp; clients: ClientOption[] }) {
  const { toast } = useToast();
  const [secret, setSecret] = useState<string | null>(null);
  const [showGrants, setShowGrants] = useState(false);

  const grants = useQuery<GalaxyGrant[]>({
    queryKey: ["/api/admin/galaxy/apps", a.id, "grants"],
    queryFn: () => apiRequest(`/api/admin/galaxy/apps/${a.id}/grants`),
    enabled: showGrants,
  });

  const rotate = useMutation({
    mutationFn: async () => apiRequest(`/api/admin/galaxy/apps/${a.id}/rotate-secret`, { method: "POST" }),
    onSuccess: (data) => setSecret(data.clientSecret),
  });
  const disable = useMutation({
    mutationFn: async () => apiRequest(`/api/admin/galaxy/apps/${a.id}/disable`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/galaxy/apps"] });
      toast({ title: "App disabled" });
    },
  });
  const revokeGrant = useMutation({
    mutationFn: (grantId: string) =>
      apiRequest(`/api/admin/galaxy/apps/${a.id}/grants/${grantId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/galaxy/apps", a.id, "grants"] });
      toast({ title: "Consent revoked" });
    },
    onError: (e: any) => toast({ title: "Failed to revoke", description: e.message, variant: "destructive" }),
  });

  return (
    <Card data-testid={`card-app-${a.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {a.name}
              {a.clientId ? (
                <Badge variant="secondary" data-testid={`badge-client-${a.id}`}>
                  Client: {a.clientShortName || a.clientName || a.clientId.slice(0, 8)}
                </Badge>
              ) : (
                <Badge variant="outline">Tenant-wide</Badge>
              )}
              {a.disabledAt && <Badge variant="destructive">Disabled</Badge>}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{a.id}</p>
            {a.description && <p className="text-sm mt-2">{a.description}</p>}
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <GrantConsentDialog app={a} clients={clients} />
            <Button size="sm" variant="outline" onClick={() => rotate.mutate()} disabled={!!a.disabledAt || rotate.isPending}>
              <RotateCw className="h-3 w-3 mr-1" />Rotate secret
            </Button>
            {!a.disabledAt && (
              <Button size="sm" variant="destructive" onClick={() => disable.mutate()} disabled={disable.isPending}>
                <Trash2 className="h-3 w-3 mr-1" />Disable
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {secret && (
          <div className="rounded-md border bg-yellow-50 dark:bg-yellow-950 p-3">
            <p className="font-medium mb-2">New client secret (saved once):</p>
            <CopySecret value={secret} />
          </div>
        )}
        <div><span className="text-muted-foreground">Redirect URIs:</span> {a.redirectUris.join(", ") || "—"}</div>
        <div><span className="text-muted-foreground">Webhook:</span> {a.webhookUrl ?? "—"}</div>
        <div><span className="text-muted-foreground">Origins:</span> {a.originAllowList.join(", ") || "any"}</div>
        <div><span className="text-muted-foreground">Scopes:</span> {a.allowedScopes.join(", ")}</div>
        <div><span className="text-muted-foreground">Rate limits:</span> {a.rateLimitPerMin}/min app · {a.tokenRateLimitPerMin}/min token</div>

        {/* Client consents section */}
        <div className="pt-2 border-t">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground text-muted-foreground"
            onClick={() => setShowGrants((v) => !v)}
          >
            <ShieldCheck className="h-4 w-4" />
            Client consents
            {showGrants ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showGrants && (
            <div className="mt-2">
              {grants.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
              {grants.data?.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No consents yet. Use "Grant consent" to pre-authorize a client for <code className="bg-muted px-1 rounded">client_credentials</code> tokens.
                </p>
              )}
              {grants.data && grants.data.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Client</TableHead>
                      <TableHead className="text-xs">Granted by</TableHead>
                      <TableHead className="text-xs">Scopes</TableHead>
                      <TableHead className="text-xs">Last used</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grants.data.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="text-xs">{g.clientName ?? g.clientId?.slice(0, 8) ?? "—"}</TableCell>
                        <TableCell className="text-xs">{g.userEmail ?? g.clientUserId.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs">{g.scopes.join(", ")}</TableCell>
                        <TableCell className="text-xs">{g.lastUsedAt ? new Date(g.lastUsedAt).toLocaleDateString() : "Never"}</TableCell>
                        <TableCell>
                          <Badge variant={g.revokedAt ? "destructive" : "default"} className="text-xs">
                            {g.revokedAt ? "Revoked" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {!g.revokedAt && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-destructive hover:text-destructive"
                              onClick={() => revokeGrant.mutate(g.id)}
                              disabled={revokeGrant.isPending}
                            >
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function GalaxyAdminPage() {
  const apps = useQuery<GalaxyApp[]>({ queryKey: ["/api/admin/galaxy/apps"] });
  const audit = useQuery<GalaxyAudit[]>({ queryKey: ["/api/admin/galaxy/audit"] });
  const webhooks = useQuery<GalaxyWebhook[]>({ queryKey: ["/api/admin/galaxy/webhooks"] });
  const clientsQuery = useQuery<ClientOption[]>({ queryKey: ["/api/clients"] });

  return (
    <Layout>
      <div className="container py-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Galaxy client portal API</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage external apps that consume the Galaxy API on behalf of your client portal users.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/api/galaxy/v1/docs" target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />API reference
            </a>
          </Button>
          <RegisterAppDialog />
        </div>
      </div>

      <Tabs defaultValue="apps">
        <TabsList>
          <TabsTrigger value="apps" data-testid="tab-apps">Apps</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit log</TabsTrigger>
          <TabsTrigger value="webhooks" data-testid="tab-webhooks">Webhooks</TabsTrigger>
        </TabsList>

        <TabsContent value="apps" className="space-y-3 mt-4">
          {apps.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {apps.data?.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              No apps registered yet.
            </CardContent></Card>
          )}
          {apps.data?.map((a) => <AppRow key={a.id} a={a} clients={clientsQuery.data ?? []} />)}
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.data?.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{new Date(a.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-mono">{a.appId?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{a.method}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{a.route}</TableCell>
                    <TableCell>
                      <Badge variant={a.status >= 400 ? "destructive" : "outline"}>{a.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{a.durationMs}ms</TableCell>
                    <TableCell className="text-xs">
                      {a.errorCode || "—"}
                      {a.scopeMissing && <div className="text-muted-foreground">missing: {a.scopeMissing}</div>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="webhooks" className="mt-4">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Last code</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.data?.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="text-xs">{new Date(w.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-mono">{w.appId.slice(0, 8)}</TableCell>
                    <TableCell><Badge variant="outline">{w.event}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={w.status === "failed" ? "destructive" : w.status === "succeeded" ? "default" : "outline"}>
                        {w.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{w.attempts}</TableCell>
                    <TableCell className="text-xs">{w.lastStatusCode ?? "—"}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate" title={w.lastError ?? ""}>{w.lastError ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
      </div>
    </Layout>
  );
}
