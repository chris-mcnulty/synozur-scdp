import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, UserPlus, Edit, Shield, Trash2, Building2, Filter, Clock, Briefcase, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getRoleDisplayName } from "@/lib/auth";

// Proficiency badge styling
function getProficiencyBadge(level: string) {
  switch (level) {
    case 'primary': return { label: 'Primary', variant: 'default' as const };
    case 'secondary': return { label: 'Secondary', variant: 'secondary' as const };
    case 'learning': return { label: 'Learning', variant: 'outline' as const };
    default: return { label: level, variant: 'outline' as const };
  }
}

// Role Capabilities Section (used in edit dialog)
function RoleCapabilitiesSection({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [addingRole, setAddingRole] = useState(false);
  const [newRoleId, setNewRoleId] = useState("");
  const [newProficiency, setNewProficiency] = useState("secondary");

  const { data: capabilities = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/users/${userId}/role-capabilities`],
    enabled: !!userId,
  });

  const { data: allRoles = [] } = useQuery<any[]>({
    queryKey: ["/api/roles"],
  });

  const addCapability = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/users/${userId}/role-capabilities`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/role-capabilities`] });
      queryClient.invalidateQueries({ queryKey: ["/api/users?includeInactive=true&includeStakeholders=true"] });
      setAddingRole(false);
      setNewRoleId("");
      setNewProficiency("secondary");
      toast({ title: "Success", description: "Role capability added" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to add capability", variant: "destructive" });
    },
  });

  const updateCapability = useMutation({
    mutationFn: ({ capId, data }: { capId: string; data: any }) =>
      apiRequest(`/api/users/${userId}/role-capabilities/${capId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/role-capabilities`] });
      queryClient.invalidateQueries({ queryKey: ["/api/users?includeInactive=true&includeStakeholders=true"] });
    },
  });

  const deleteCapability = useMutation({
    mutationFn: (capId: string) =>
      apiRequest(`/api/users/${userId}/role-capabilities/${capId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/role-capabilities`] });
      queryClient.invalidateQueries({ queryKey: ["/api/users?includeInactive=true&includeStakeholders=true"] });
      toast({ title: "Success", description: "Role capability removed" });
    },
  });

  // Filter out already-mapped roles
  const existingRoleIds = new Set(capabilities.map((c: any) => c.roleId));
  const availableRoles = allRoles.filter((r: any) => !existingRoleIds.has(r.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold flex items-center gap-1.5">
          <Briefcase className="w-4 h-4" />
          Role Capabilities
        </Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAddingRole(true)}
          disabled={availableRoles.length === 0}
        >
          <Plus className="w-3 h-3 mr-1" /> Add Role
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading capabilities...</p>
      ) : capabilities.length === 0 && !addingRole ? (
        <p className="text-sm text-muted-foreground">No role capabilities mapped. Add roles this person can fill.</p>
      ) : (
        <div className="space-y-2">
          {capabilities.map((cap: any) => {
            const badge = getProficiencyBadge(cap.proficiencyLevel);
            return (
              <div key={cap.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{cap.roleName || 'Unknown Role'}</span>
                    <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    {cap.customCostRate && <span>Cost: ${cap.customCostRate}/hr</span>}
                    {cap.customBillingRate && <span>Bill: ${cap.customBillingRate}/hr</span>}
                    {cap.notes && <span className="truncate">{cap.notes}</span>}
                  </div>
                </div>
                <Select
                  value={cap.proficiencyLevel}
                  onValueChange={(val) => updateCapability.mutate({ capId: cap.id, data: { proficiencyLevel: val } })}
                >
                  <SelectTrigger className="w-[110px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary</SelectItem>
                    <SelectItem value="secondary">Secondary</SelectItem>
                    <SelectItem value="learning">Learning</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => deleteCapability.mutate(cap.id)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {addingRole && (
        <div className="flex items-end gap-2 rounded-md border p-2 bg-muted/50">
          <div className="flex-1">
            <Label className="text-xs">Role</Label>
            <Select value={newRoleId} onValueChange={setNewRoleId}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select role..." />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[120px]">
            <Label className="text-xs">Proficiency</Label>
            <Select value={newProficiency} onValueChange={setNewProficiency}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="secondary">Secondary</SelectItem>
                <SelectItem value="learning">Learning</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={!newRoleId || addCapability.isPending}
            onClick={() => addCapability.mutate({ roleId: newRoleId, proficiencyLevel: newProficiency })}
          >
            Add
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setAddingRole(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Users() {
  const [searchTerm, setSearchTerm] = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [orgFilter, setOrgFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const { toast } = useToast();
  const { isPlatformAdmin } = useAuth();

  const { data: users = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/users?includeInactive=true&includeStakeholders=true"],
  });

  const createUser = useMutation({
    mutationFn: (data: any) => apiRequest("/api/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users?includeInactive=true&includeStakeholders=true"] });
      setCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "User created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create user",
        variant: "destructive",
      });
    },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest(`/api/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users?includeInactive=true&includeStakeholders=true"] });
      setEditingUser(null);
      toast({
        title: "Success",
        description: "User updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/users/${id}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users?includeInactive=true&includeStakeholders=true"] });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      toast({
        title: "Success",
        description: "User has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Cannot delete user with existing time entries, expenses, or staff assignments",
        variant: "destructive",
      });
    },
  });

  const tenantNames = isPlatformAdmin
    ? Array.from(new Set(users.map((u: any) => u.primaryTenantName).filter(Boolean)))
    : [];

  // Extract unique organization/client names from users' clientNames arrays
  const orgNames = Array.from(new Set(
    users.flatMap((u: any) => u.clientNames || []).filter(Boolean)
  )).sort() as string[];

  // Extract unique roles for the role filter
  const availableRoles = Array.from(new Set(
    users.map((u: any) => u.role).filter(Boolean)
  )).sort() as string[];

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTenant = !isPlatformAdmin || tenantFilter === "all" ||
      (tenantFilter === "unassigned" ? !user.primaryTenantName : user.primaryTenantName === tenantFilter);
    const matchesOrg = orgFilter === "all" ||
      (orgFilter === "internal" ? !(user.clientNames?.length > 0) : (user.clientNames || []).includes(orgFilter));
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesTenant && matchesOrg && matchesRole;
  });

  const getRoleBadgeColor = (role: string) => {
    switch(role) {
      case 'admin': return 'destructive';
      case 'billing-admin': return 'secondary';
      case 'pm': return 'default';
      case 'portfolio-manager': return 'default';
      case 'employee': return 'outline';
      case 'client': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold" data-testid="users-title">User Management</h2>
            <p className="text-muted-foreground" data-testid="users-subtitle">
              Manage user accounts and permissions
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-new-user">
            <UserPlus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center space-x-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search users..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-users"
                />
              </div>
              <Select value={orgFilter} onValueChange={setOrgFilter}>
                <SelectTrigger className="w-[200px]">
                  <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="All Organizations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Organizations</SelectItem>
                  <SelectItem value="internal">Internal Only</SelectItem>
                  {orgNames.map((name: string) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[180px]">
                  <Shield className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {availableRoles.map((role: string) => (
                    <SelectItem key={role} value={role}>{getRoleDisplayName(role)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isPlatformAdmin && tenantNames.length > 0 && (
                <Select value={tenantFilter} onValueChange={setTenantFilter}>
                  <SelectTrigger className="w-[200px]">
                    <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="All Tenants" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tenants</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {tenantNames.map((name: string) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No users found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Organization</TableHead>
                    {isPlatformAdmin && <TableHead>Primary Tenant</TableHead>}
                    <TableHead>Role</TableHead>
                    <TableHead>Can Login</TableHead>
                    <TableHead>Assignable</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Weekly Hrs</TableHead>
                    <TableHead>Charge Rate</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email || <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell>
                        {user.clientNames?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {user.clientNames.map((name: string) => (
                              <Badge key={name} variant="outline" className="font-normal text-xs">
                                <Building2 className="w-3 h-3 mr-1" />
                                {name}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Internal</span>
                        )}
                      </TableCell>
                      {isPlatformAdmin && (
                        <TableCell>
                          {user.primaryTenantName ? (
                            <Badge variant="outline" className="font-normal">
                              <Building2 className="w-3 h-3 mr-1" />
                              {user.primaryTenantName}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">Unassigned</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant={getRoleBadgeColor(user.role)}>
                          <Shield className="w-3 h-3 mr-1" />
                          {getRoleDisplayName(user.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.canLogin ? (
                          <span className="text-green-600">✓ Yes</span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.isAssignable ? (
                          <span className="text-green-600">✓ Yes</span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.roleCapabilities?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {user.roleCapabilities.slice(0, 3).map((cap: any, idx: number) => {
                              const badge = getProficiencyBadge(cap.proficiencyLevel);
                              return (
                                <Badge key={idx} variant={badge.variant} className="text-xs font-normal">
                                  {cap.roleName}
                                </Badge>
                              );
                            })}
                            {user.roleCapabilities.length > 3 && (
                              <Badge variant="outline" className="text-xs font-normal">+{user.roleCapabilities.length - 3}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{user.weeklyCapacityHours ?? '40'}</span>
                        {user.capacityNotes && (
                          <span className="block text-xs text-muted-foreground truncate max-w-[100px]" title={user.capacityNotes}>
                            {user.capacityNotes}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.defaultBillingRate ? `$${user.defaultBillingRate}` : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={user.isActive ? "default" : "destructive"}
                          className={user.isActive ? "" : "opacity-75"}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingUser(user)}
                            data-testid={`button-edit-user-${user.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setUserToDelete(user);
                              setDeleteDialogOpen(true);
                            }}
                            data-testid={`button-delete-user-${user.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create User Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
            </DialogHeader>
            <form name="create-user-form" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const firstName = formData.get('firstName') as string;
              const lastName = formData.get('lastName') as string;
              const email = formData.get('email') as string;
              createUser.mutate({
                name: `${firstName} ${lastName}`,
                firstName,
                lastName,
                initials: formData.get('initials'),
                email: email || null,
                role: formData.get('role'),
                canLogin: formData.get('canLogin') === 'on',
                isAssignable: formData.get('isAssignable') === 'true',
                defaultBillingRate: formData.get('defaultBillingRate'),
                defaultCostRate: formData.get('defaultCostRate'),
                isSalaried: formData.get('isSalaried') === 'on',
                isActive: true,
              });
            }}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      placeholder="John"
                      required
                      data-testid="input-user-firstname"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      placeholder="Doe"
                      required
                      data-testid="input-user-lastname"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email (Optional)</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="john@example.com"
                      data-testid="input-user-email"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="initials">Initials</Label>
                    <Input
                      id="initials"
                      name="initials"
                      placeholder="JD"
                      maxLength={3}
                      data-testid="input-user-initials"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role">System Role</Label>
                  <Select name="role" required>
                    <SelectTrigger data-testid="select-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="billing-admin">Billing Admin</SelectItem>
                      <SelectItem value="pm">Project Manager</SelectItem>
                      <SelectItem value="portfolio-manager">Portfolio Manager</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="canLogin"
                    name="canLogin"
                    defaultChecked={false}
                  />
                  <Label htmlFor="canLogin">Can Login (Enable authentication access)</Label>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="isAssignable">Assignable Resource</Label>
                  <Select name="isAssignable" defaultValue="true">
                    <SelectTrigger data-testid="select-assignable">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes - Can be assigned to projects</SelectItem>
                      <SelectItem value="false">No - Admin/System user only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="defaultBillingRate">Default Billing Rate</Label>
                    <Input
                      id="defaultBillingRate"
                      name="defaultBillingRate"
                      type="number"
                      placeholder="150"
                      min="0"
                      step="0.01"
                      data-testid="input-charge-rate"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="defaultCostRate">Default Cost Rate</Label>
                    <Input
                      id="defaultCostRate"
                      name="defaultCostRate"
                      type="number"
                      placeholder="75"
                      min="0"
                      step="0.01"
                      data-testid="input-cost-rate"
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isSalaried"
                    name="isSalaried"
                    defaultChecked={false}
                  />
                  <Label htmlFor="isSalaried">Salaried (Time not counted as direct project cost)</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createUser.isPending} data-testid="button-create-user">
                  {createUser.isPending ? "Creating..." : "Create User"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        {editingUser && (
          <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit User — {editingUser.name}</DialogTitle>
              </DialogHeader>
              <form name="edit-user-form" onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const firstName = formData.get('firstName') as string;
                const lastName = formData.get('lastName') as string;
                const email = formData.get('email') as string;
                const weeklyCapacityHours = formData.get('weeklyCapacityHours') as string;
                const capacityNotes = formData.get('capacityNotes') as string;
                const capacityEffectiveDate = formData.get('capacityEffectiveDate') as string;
                updateUser.mutate({
                  id: editingUser.id,
                  data: {
                    name: `${firstName} ${lastName}`,
                    firstName,
                    lastName,
                    initials: formData.get('initials'),
                    email: email || null,
                    role: formData.get('role'),
                    canLogin: formData.get('canLogin') === 'on',
                    isAssignable: formData.get('isAssignable') === 'true',
                    defaultBillingRate: formData.get('defaultBillingRate'),
                    defaultCostRate: formData.get('defaultCostRate'),
                    isSalaried: formData.get('isSalaried') === 'on',
                    isActive: formData.get('isActive') === 'on',
                    weeklyCapacityHours: weeklyCapacityHours || "40.00",
                    capacityNotes: capacityNotes || null,
                    capacityEffectiveDate: capacityEffectiveDate || null,
                  }
                });
              }}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-firstName">First Name</Label>
                      <Input
                        id="edit-firstName"
                        name="firstName"
                        defaultValue={editingUser.firstName || editingUser.name?.split(' ')[0]}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-lastName">Last Name</Label>
                      <Input
                        id="edit-lastName"
                        name="lastName"
                        defaultValue={editingUser.lastName || editingUser.name?.split(' ').slice(1).join(' ')}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-email">Email (Optional)</Label>
                      <Input
                        id="edit-email"
                        name="email"
                        type="email"
                        defaultValue={editingUser.email}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-initials">Initials</Label>
                      <Input
                        id="edit-initials"
                        name="initials"
                        defaultValue={editingUser.initials}
                        maxLength={3}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-role">System Role</Label>
                    <Select name="role" defaultValue={editingUser.role}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="billing-admin">Billing Admin</SelectItem>
                        <SelectItem value="pm">Project Manager</SelectItem>
                        <SelectItem value="portfolio-manager">Portfolio Manager</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                        <SelectItem value="executive">Executive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="edit-canLogin"
                      name="canLogin"
                      defaultChecked={editingUser.canLogin}
                    />
                    <Label htmlFor="edit-canLogin">Can Login (Enable authentication access)</Label>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-isAssignable">Assignable Resource</Label>
                    <Select name="isAssignable" defaultValue={editingUser.isAssignable ? "true" : "false"}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes - Can be assigned to projects</SelectItem>
                        <SelectItem value="false">No - Admin/System user only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-defaultBillingRate">Default Billing Rate</Label>
                      <Input
                        id="edit-defaultBillingRate"
                        name="defaultBillingRate"
                        type="number"
                        defaultValue={editingUser.defaultBillingRate}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-defaultCostRate">Default Cost Rate</Label>
                      <Input
                        id="edit-defaultCostRate"
                        name="defaultCostRate"
                        type="number"
                        defaultValue={editingUser.defaultCostRate}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="edit-isSalaried"
                      name="isSalaried"
                      defaultChecked={editingUser.isSalaried}
                    />
                    <Label htmlFor="edit-isSalaried">Salaried (Time not counted as direct project cost)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="edit-active"
                      name="isActive"
                      defaultChecked={editingUser.isActive}
                    />
                    <Label htmlFor="edit-active">Active</Label>
                  </div>

                  {/* Capacity Profile Section */}
                  <div className="border-t pt-4 mt-2">
                    <Label className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                      <Clock className="w-4 h-4" />
                      Capacity Profile
                    </Label>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="edit-weeklyCapacityHours" className="text-xs">Weekly Hours</Label>
                        <Input
                          id="edit-weeklyCapacityHours"
                          name="weeklyCapacityHours"
                          type="number"
                          defaultValue={editingUser.weeklyCapacityHours || "40.00"}
                          min="0"
                          max="168"
                          step="0.5"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="edit-capacityEffectiveDate" className="text-xs">Effective Date</Label>
                        <Input
                          id="edit-capacityEffectiveDate"
                          name="capacityEffectiveDate"
                          type="date"
                          defaultValue={editingUser.capacityEffectiveDate || ""}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="edit-capacityNotes" className="text-xs">Notes</Label>
                        <Input
                          id="edit-capacityNotes"
                          name="capacityNotes"
                          placeholder="e.g., Not available Wednesdays"
                          defaultValue={editingUser.capacityNotes || ""}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Role Capabilities Section */}
                  <div className="border-t pt-4 mt-2">
                    <RoleCapabilitiesSection userId={editingUser.id} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateUser.isPending}>
                    {updateUser.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}

        {/* Delete User Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete User</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete {userToDelete?.name}? This action cannot be undone. Note: Users with existing time entries, expenses, or staff assignments cannot be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => userToDelete && deleteUser.mutate(userToDelete.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-user"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}