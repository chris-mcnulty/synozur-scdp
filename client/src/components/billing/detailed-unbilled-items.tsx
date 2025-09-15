import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Filter,
  Download,
  AlertTriangle,
  Clock,
  DollarSign,
  User as UserIcon,
  Building,
  Calendar,
  Search,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import type { UnbilledItemsResponse, UnbilledItemsFilters, User, Project, Client } from "@shared/schema";

interface UnbilledItemsDetailProps {
  initialFilters?: UnbilledItemsFilters;
}

export function DetailedUnbilledItems({ initialFilters }: UnbilledItemsDetailProps) {
  const [filters, setFilters] = useState<UnbilledItemsFilters>(initialFilters || {});
  const [showFilters, setShowFilters] = useState(false);

  // Fetch unbilled items data
  const { data: unbilledData, isLoading, refetch } = useQuery<UnbilledItemsResponse>({
    queryKey: ["/api/billing/unbilled-items", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      
      return await apiRequest(`/api/billing/unbilled-items?${params.toString()}`);
    },
  });

  // Fetch reference data for filters
  const { data: projects = [] } = useQuery<(Project & { client: Client })[]>({ queryKey: ["/api/projects"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });

  const handleFilterChange = (key: keyof UnbilledItemsFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatHours = (hours: number) => {
    return `${hours.toFixed(2)}h`;
  };

  if (isLoading) {
    return (
      <Card data-testid="detailed-unbilled-items-loading">
        <CardHeader>
          <CardTitle>Detailed Unbilled Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="detailed-unbilled-items">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Detailed Unbilled Items
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              data-testid="button-refresh-unbilled-items"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Filters Section */}
        {showFilters && (
          <div className="bg-muted/30 p-4 rounded-lg space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Person</label>
                <Select value={filters.personId || ''} onValueChange={(value) => handleFilterChange('personId', value)}>
                  <SelectTrigger data-testid="select-person-filter">
                    <SelectValue placeholder="All people" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All people</SelectItem>
                    {(users as any[]).map((user: any) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Project</label>
                <Select value={filters.projectId || ''} onValueChange={(value) => handleFilterChange('projectId', value)}>
                  <SelectTrigger data-testid="select-project-filter">
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All projects</SelectItem>
                    {(projects as any[]).map((project: any) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Client</label>
                <Select value={filters.clientId || ''} onValueChange={(value) => handleFilterChange('clientId', value)}>
                  <SelectTrigger data-testid="select-client-filter">
                    <SelectValue placeholder="All clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All clients</SelectItem>
                    {(clients as any[]).map((client: any) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Start Date</label>
                <Input
                  type="date"
                  value={filters.startDate || ''}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  data-testid="input-start-date-filter"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">End Date</label>
                <Input
                  type="date"
                  value={filters.endDate || ''}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  data-testid="input-end-date-filter"
                />
              </div>
            </div>
            
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {unbilledData && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Hours</p>
                    <p className="text-2xl font-semibold">{formatHours(unbilledData.totals.timeHours)}</p>
                  </div>
                  <Clock className="w-8 h-8 text-primary" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Time Amount</p>
                    <p className="text-2xl font-semibold">{formatCurrency(unbilledData.totals.timeAmount)}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-primary" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Expenses</p>
                    <p className="text-2xl font-semibold">{formatCurrency(unbilledData.totals.expenseAmount)}</p>
                  </div>
                  <Building className="w-8 h-8 text-primary" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Unbilled</p>
                    <p className="text-2xl font-semibold">{formatCurrency(unbilledData.totals.totalAmount)}</p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-warning" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Rate Validation Alerts */}
        {unbilledData?.rateValidation?.issues && unbilledData.rateValidation.issues.length > 0 && (
          <Alert className="border-warning bg-warning/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">Rate Validation Issues Found:</p>
                <p>{unbilledData?.rateValidation?.entriesWithMissingRates} entries with missing rates</p>
                <p>{unbilledData?.rateValidation?.entriesWithNullRates} entries with null rates</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm">View Details</summary>
                  <ul className="mt-2 space-y-1 text-sm">
                    {unbilledData?.rateValidation?.issues?.map((issue: string, index: number) => (
                      <li key={index} className="text-muted-foreground">• {issue}</li>
                    ))}
                  </ul>
                </details>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Time Entries Table */}
        {unbilledData && unbilledData.timeEntries && unbilledData.timeEntries.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Unbilled Time Entries ({unbilledData?.timeEntries?.length})</h3>
            
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Person</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unbilledData?.timeEntries?.map((entry: any) => (
                    <TableRow key={entry.id} data-testid={`time-entry-${entry.id}`}>
                      <TableCell>{format(new Date(entry.date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4" />
                          {entry.person.name}
                        </div>
                      </TableCell>
                      <TableCell>{entry.project.name}</TableCell>
                      <TableCell>{entry.project.client.name}</TableCell>
                      <TableCell className="max-w-xs truncate" title={entry.description || 'No description'}>
                        {entry.description || <em className="text-muted-foreground">No description</em>}
                      </TableCell>
                      <TableCell className="text-right">{formatHours(Number(entry.hours))}</TableCell>
                      <TableCell className="text-right">
                        {entry.billingRate ? formatCurrency(Number(entry.billingRate)) : 
                         <span className="text-warning">No Rate</span>}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(entry.calculatedAmount)}
                      </TableCell>
                      <TableCell>
                        {entry.rateIssues && entry.rateIssues.length > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Rate Issues
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Expenses Table */}
        {unbilledData && unbilledData.expenses && unbilledData.expenses.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Unbilled Expenses ({unbilledData?.expenses?.length})</h3>
            
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Person</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unbilledData?.expenses?.map((expense: any) => (
                    <TableRow key={expense.id} data-testid={`expense-${expense.id}`}>
                      <TableCell>{format(new Date(expense.date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4" />
                          {expense.person.name}
                        </div>
                      </TableCell>
                      <TableCell>{expense.project.name}</TableCell>
                      <TableCell>{expense.project.client.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{expense.category}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate" title={expense.description || 'No description'}>
                        {expense.description || <em className="text-muted-foreground">No description</em>}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(Number(expense.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {unbilledData && (!unbilledData?.timeEntries?.length && !unbilledData?.expenses?.length) && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-4" />
            <p className="text-lg">No unbilled items found</p>
            <p className="text-sm">Try adjusting your filters to see more results</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}