import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Users, TrendingUp, UserX, Briefcase, AlertCircle, Upload, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

export default function CapacityPlanning() {
  const { toast } = useToast();
  const today = new Date().toISOString().split('T')[0];
  const defaultEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [showBulkImport, setShowBulkImport] = useState<'capabilities' | 'capacity' | null>(null);
  const [bulkData, setBulkData] = useState("");

  const { data: capacitySummary, isLoading } = useQuery<any>({
    queryKey: ["/api/resource-planning/capacity-summary", startDate, endDate],
    queryFn: () => apiRequest(`/api/resource-planning/capacity-summary?startDate=${startDate}&endDate=${endDate}`),
  });

  const { data: bench = [], isLoading: benchLoading } = useQuery<any[]>({
    queryKey: ["/api/resource-planning/bench", startDate, endDate],
    queryFn: () => apiRequest(`/api/resource-planning/bench?startDate=${startDate}&endDate=${endDate}`),
  });

  const bulkImportCapabilities = useMutation({
    mutationFn: (data: any) => apiRequest("/api/resource-planning/bulk-import-capabilities", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/resource-planning"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Import Complete",
        description: `${result.success} of ${result.total} rows imported successfully. ${result.errors} errors.`,
      });
      setShowBulkImport(null);
      setBulkData("");
    },
    onError: (err: any) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  const bulkImportCapacity = useMutation({
    mutationFn: (data: any) => apiRequest("/api/resource-planning/bulk-import-capacity", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/resource-planning"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Import Complete",
        description: `${result.success} of ${result.total} rows imported successfully. ${result.errors} errors.`,
      });
      setShowBulkImport(null);
      setBulkData("");
    },
    onError: (err: any) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  const kpis = capacitySummary?.kpis || {};
  const demandSupply = capacitySummary?.demandSupply || [];

  // Prepare chart data
  const demandSupplyChartData = demandSupply.map((d: any) => ({
    name: d.roleName,
    demand: d.demandHours,
    supply: d.supplyCount,
  }));

  const utilizationPieData = [
    { name: 'Allocated', value: kpis.totalAllocatedHours || 0 },
    { name: 'Available', value: Math.max(0, (kpis.totalCapacityHours || 0) - (kpis.totalAllocatedHours || 0)) },
  ];

  function handleBulkImport() {
    try {
      const lines = bulkData.trim().split('\n');
      if (lines.length < 2) {
        toast({ title: "Error", description: "Need at least a header row and one data row", variant: "destructive" });
        return;
      }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const obj: any = {};
        headers.forEach((h, i) => {
          if (h === 'email' || h === 'useremail') obj.userEmail = values[i];
          else if (h === 'role' || h === 'rolename') obj.roleName = values[i];
          else if (h === 'proficiency' || h === 'proficiencylevel') obj.proficiencyLevel = values[i] || 'secondary';
          else if (h === 'costrate' || h === 'customcostrate') obj.customCostRate = values[i] || null;
          else if (h === 'billingrate' || h === 'custombillingrate') obj.customBillingRate = values[i] || null;
          else if (h === 'notes') obj.notes = values[i] || null;
          else if (h === 'weeklyhours' || h === 'weeklycapacityhours') obj.weeklyCapacityHours = values[i];
          else if (h === 'capacitynotes') obj.capacityNotes = values[i] || null;
          else if (h === 'effectivedate' || h === 'capacityeffectivedate') obj.capacityEffectiveDate = values[i] || null;
        });
        return obj;
      }).filter(r => r.userEmail);

      if (showBulkImport === 'capabilities') {
        bulkImportCapabilities.mutate({ rows });
      } else {
        bulkImportCapacity.mutate({ rows });
      }
    } catch {
      toast({ title: "Error", description: "Failed to parse CSV data", variant: "destructive" });
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Capacity Planning</h2>
            <p className="text-muted-foreground">Analytics, bench visibility, and demand vs supply</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowBulkImport('capabilities'); setBulkData(''); }}>
              <Upload className="w-4 h-4 mr-1" /> Import Capabilities
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setShowBulkImport('capacity'); setBulkData(''); }}>
              <Upload className="w-4 h-4 mr-1" /> Import Capacity
            </Button>
          </div>
        </div>

        {/* Date filters */}
        <div className="flex gap-4 items-end">
          <div>
            <Label className="text-xs">Start Date</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">End Date</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> Team Utilization
              </div>
              <div className="text-2xl font-bold">{kpis.teamUtilizationRate || 0}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Total People
              </div>
              <div className="text-2xl font-bold">{kpis.totalPeople || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <UserX className="w-3.5 h-3.5" /> On Bench
              </div>
              <div className="text-2xl font-bold">{kpis.benchCount || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5" /> Open Roles
              </div>
              <div className="text-2xl font-bold">{kpis.openRoles || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Capacity (hrs)</div>
              <div className="text-2xl font-bold">{Math.round(kpis.totalAllocatedHours || 0)} / {kpis.totalCapacityHours || 0}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="demand">Demand vs Supply</TabsTrigger>
            <TabsTrigger value="bench">Bench List ({bench.length})</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Utilization Pie */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Team Capacity Utilization</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={utilizationPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${Math.round(value)}h`}
                      >
                        <Cell fill="#3b82f6" />
                        <Cell fill="#e5e7eb" />
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Demand by Role */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Unfilled Role Demand (Hours)</CardTitle>
                </CardHeader>
                <CardContent>
                  {demandSupplyChartData.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No unfilled role demand</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={demandSupplyChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis />
                        <RechartsTooltip />
                        <Legend />
                        <Bar dataKey="demand" fill="#ef4444" name="Demand (hrs)" />
                        <Bar dataKey="supply" fill="#10b981" name="Supply (people)" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Demand vs Supply Tab */}
          <TabsContent value="demand">
            <Card>
              <CardHeader>
                <CardTitle>Role Demand vs Supply</CardTitle>
                <CardDescription>Unfilled generic-role allocations aggregated by role (demand) vs available capable people (supply)</CardDescription>
              </CardHeader>
              <CardContent>
                {demandSupply.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No unfilled role demand in this period</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Role</TableHead>
                        <TableHead>Demand (Hours)</TableHead>
                        <TableHead>Supply (People)</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {demandSupply.map((d: any) => (
                        <TableRow key={d.roleId}>
                          <TableCell className="font-medium">{d.roleName}</TableCell>
                          <TableCell>{d.demandHours}h</TableCell>
                          <TableCell>{d.supplyCount} people</TableCell>
                          <TableCell>
                            {d.gap === 'no_supply' ? (
                              <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                                <AlertCircle className="w-3 h-3" /> No Supply
                              </Badge>
                            ) : d.supplyCount < 2 ? (
                              <Badge className="bg-amber-500">Low Supply</Badge>
                            ) : (
                              <Badge className="bg-green-600">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bench List Tab */}
          <TabsContent value="bench">
            <Card>
              <CardHeader>
                <CardTitle>Bench List</CardTitle>
                <CardDescription>People with less than 20% utilization in the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                {benchLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Loading...</p>
                ) : bench.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No underutilized resources</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Person</TableHead>
                        <TableHead>Weekly Hrs</TableHead>
                        <TableHead>Allocated</TableHead>
                        <TableHead>Available</TableHead>
                        <TableHead>Utilization</TableHead>
                        <TableHead>Role Capabilities</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bench.map((b: any) => (
                        <TableRow key={b.userId}>
                          <TableCell>
                            <div className="font-medium">{b.userName}</div>
                            <div className="text-xs text-muted-foreground">{b.userEmail}</div>
                          </TableCell>
                          <TableCell>{b.weeklyCapacityHours}</TableCell>
                          <TableCell>{b.allocatedHours}h</TableCell>
                          <TableCell className="text-green-600 font-medium">{b.availableHours}h</TableCell>
                          <TableCell>{b.utilizationPct}%</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {b.roleCapabilities.length === 0 ? (
                                <span className="text-xs text-muted-foreground">-</span>
                              ) : (
                                b.roleCapabilities.map((cap: any, i: number) => (
                                  <Badge
                                    key={i}
                                    variant={cap.proficiencyLevel === 'primary' ? 'default' : cap.proficiencyLevel === 'secondary' ? 'secondary' : 'outline'}
                                    className="text-xs"
                                  >
                                    {cap.roleName}
                                  </Badge>
                                ))
                              )}
                            </div>
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

        {/* Bulk Import Dialog */}
        {showBulkImport && (
          <Dialog open onOpenChange={() => setShowBulkImport(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  Bulk Import {showBulkImport === 'capabilities' ? 'Role Capabilities' : 'Capacity Profiles'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Paste CSV data below. {showBulkImport === 'capabilities'
                    ? 'Required columns: email, role. Optional: proficiency, costRate, billingRate, notes.'
                    : 'Required columns: email, weeklyHours. Optional: capacityNotes, effectiveDate.'}
                </p>
                <div className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono">
                  {showBulkImport === 'capabilities'
                    ? 'email,role,proficiency,costRate,billingRate,notes\njohn@example.com,Senior Consultant,primary,90,,PMP Certified'
                    : 'email,weeklyHours,capacityNotes,effectiveDate\njohn@example.com,32,Not available Wednesdays,2026-04-01'}
                </div>
                <Textarea
                  value={bulkData}
                  onChange={e => setBulkData(e.target.value)}
                  placeholder="Paste CSV data here..."
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowBulkImport(null)}>Cancel</Button>
                <Button
                  onClick={handleBulkImport}
                  disabled={!bulkData.trim() || bulkImportCapabilities.isPending || bulkImportCapacity.isPending}
                >
                  {(bulkImportCapabilities.isPending || bulkImportCapacity.isPending) ? "Importing..." : "Import"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </Layout>
  );
}
