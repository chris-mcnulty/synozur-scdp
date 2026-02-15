import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Shield, Users, Search, Crown, Briefcase, User, Building, Plus, Trash2, UserPlus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PlatformUser {
  id: string;
  email: string | null;
  name: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  platformRole: string | null;
  primaryTenantId: string | null;
  tenantName: string;
  canLogin: boolean;
  isActive: boolean;
  createdAt: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface TenantMembership {
  id: string;
  tenantId: string;
  role: string;
  status: string;
  clientId: string | null;
  createdAt: string;
  tenantName: string;
  tenantSlug: string;
}

const PLATFORM_ROLES = [
  { value: "user", label: "User", description: "Regular tenant-scoped user" },
  { value: "constellation_consultant", label: "Consultant", description: "Cross-tenant consultant access" },
  { value: "constellation_admin", label: "Platform Admin", description: "Manage tenants and service plans" },
  { value: "global_admin", label: "Global Admin", description: "Full platform control" },
];

const TENANT_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "billing-admin", label: "Billing Admin" },
  { value: "pm", label: "Project Manager" },
  { value: "employee", label: "Employee" },
  { value: "executive", label: "Executive" },
  { value: "client", label: "Client" },
];

function getPlatformRoleBadge(role: string | null) {
  switch (role) {
    case "global_admin":
      return <Badge className="bg-red-500 hover:bg-red-600"><Crown className="w-3 h-3 mr-1" />Global Admin</Badge>;
    case "constellation_admin":
      return <Badge className="bg-purple-500 hover:bg-purple-600"><Shield className="w-3 h-3 mr-1" />Platform Admin</Badge>;
    case "constellation_consultant":
      return <Badge className="bg-blue-500 hover:bg-blue-600"><Briefcase className="w-3 h-3 mr-1" />Consultant</Badge>;
    default:
      return <Badge variant="secondary"><User className="w-3 h-3 mr-1" />User</Badge>;
  }
}

export default function PlatformUsers() {
  const { toast } = useToast();
  const { isGlobalAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [addMembershipOpen, setAddMembershipOpen] = useState(false);
  const [newMembershipTenantId, setNewMembershipTenantId] = useState("");
  const [newMembershipRole, setNewMembershipRole] = useState("employee");
  const [removeMembershipId, setRemoveMembershipId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery<PlatformUser[]>({
    queryKey: ["/api/platform/users"],
  });

  const { data: allTenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/platform/tenants"],
  });

  const { data: memberships = [], isLoading: membershipsLoading } = useQuery<TenantMembership[]>({
    queryKey: ["/api/platform/users", selectedUser?.id, "memberships"],
    enabled: !!selectedUser && editDialogOpen,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, platformRole }: { userId: string; platformRole: string }) => {
      return apiRequest(`/api/platform/users/${userId}/platform-role`, {
        method: "PATCH",
        body: JSON.stringify({ platformRole }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/users"] });
      toast({ title: "Platform role updated", description: "User's platform role has been changed." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update role", 
        description: error.message || "Please try again.", 
        variant: "destructive" 
      });
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: async ({ userId, primaryTenantId }: { userId: string; primaryTenantId: string | null }) => {
      return apiRequest(`/api/platform/users/${userId}/tenant`, {
        method: "PATCH",
        body: JSON.stringify({ primaryTenantId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/users"] });
      toast({ title: "Primary tenant updated", description: "User's primary tenant has been changed." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update tenant", 
        description: error.message || "Please try again.", 
        variant: "destructive" 
      });
    },
  });

  const addMembershipMutation = useMutation({
    mutationFn: async ({ userId, tenantId, role }: { userId: string; tenantId: string; role: string }) => {
      return apiRequest(`/api/platform/users/${userId}/memberships`, {
        method: "POST",
        body: JSON.stringify({ tenantId, role }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/users", selectedUser?.id, "memberships"] });
      toast({ title: "Membership added", description: "User has been added to the organization." });
      setAddMembershipOpen(false);
      setNewMembershipTenantId("");
      setNewMembershipRole("employee");
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to add membership", 
        description: error.message || "Please try again.", 
        variant: "destructive" 
      });
    },
  });

  const removeMembershipMutation = useMutation({
    mutationFn: async ({ userId, membershipId }: { userId: string; membershipId: string }) => {
      return apiRequest(`/api/platform/users/${userId}/memberships/${membershipId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/users", selectedUser?.id, "memberships"] });
      toast({ title: "Membership removed", description: "User has been removed from the organization." });
      setRemoveMembershipId(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to remove membership", 
        description: error.message || "Please try again.", 
        variant: "destructive" 
      });
    },
  });

  const updateMembershipRoleMutation = useMutation({
    mutationFn: async ({ userId, membershipId, role }: { userId: string; membershipId: string; role: string }) => {
      return apiRequest(`/api/platform/users/${userId}/memberships/${membershipId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/users", selectedUser?.id, "memberships"] });
      toast({ title: "Role updated", description: "Membership role has been changed." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update role", 
        description: error.message || "Please try again.", 
        variant: "destructive" 
      });
    },
  });

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.name.toLowerCase().includes(searchLower) ||
      (user.email?.toLowerCase().includes(searchLower) ?? false) ||
      user.tenantName.toLowerCase().includes(searchLower)
    );
  });

  const handleEditUser = (user: PlatformUser) => {
    setSelectedUser(user);
    setSelectedRole(user.platformRole || "user");
    setSelectedTenant(user.primaryTenantId || "");
    setEditDialogOpen(true);
  };

  const handleSaveChanges = () => {
    if (!selectedUser) return;

    let changed = false;
    if (selectedRole !== (selectedUser.platformRole || "user")) {
      updateRoleMutation.mutate({ userId: selectedUser.id, platformRole: selectedRole });
      changed = true;
    }
    
    if (selectedTenant !== (selectedUser.primaryTenantId || "")) {
      updateTenantMutation.mutate({ 
        userId: selectedUser.id, 
        primaryTenantId: selectedTenant || null 
      });
      changed = true;
    }

    if (!changed) {
      setEditDialogOpen(false);
    }
  };

  const availableTenants = allTenants.filter(
    t => !memberships.some(m => m.tenantId === t.id)
  );

  return (
    <Layout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="w-8 h-8" />
              Platform Users
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage users across all tenants and assign platform roles
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>All Users</CardTitle>
                <CardDescription>
                  {users.length} users across all tenants
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading users...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Primary Tenant</TableHead>
                    <TableHead>Tenant Role</TableHead>
                    <TableHead>Platform Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Building className="w-3 h-3 text-muted-foreground" />
                          {user.tenantName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.role}</Badge>
                      </TableCell>
                      <TableCell>{getPlatformRoleBadge(user.platformRole)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {user.isActive ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-500">Inactive</Badge>
                          )}
                          {user.canLogin && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Can Login</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => handleEditUser(user)}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setSelectedUser(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Manage platform role, primary tenant, and organization memberships for {selectedUser?.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Platform Role</Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORM_ROLES.map((role) => (
                        <SelectItem 
                          key={role.value} 
                          value={role.value}
                          disabled={role.value === "global_admin" && !isGlobalAdmin}
                        >
                          <div className="flex flex-col">
                            <span>{role.label}</span>
                            <span className="text-xs text-muted-foreground">{role.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isGlobalAdmin && (
                    <p className="text-xs text-muted-foreground">
                      Only Global Admins can assign the Global Admin role
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Primary Tenant</Label>
                  <Select value={selectedTenant || "__no_tenant__"} onValueChange={(v) => setSelectedTenant(v === "__no_tenant__" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__no_tenant__">No Tenant</SelectItem>
                      {allTenants.map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.id}>
                          {tenant.name} ({tenant.slug})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-sm">Organization Memberships</h3>
                    <p className="text-xs text-muted-foreground">
                      Manage which organizations this user belongs to and their role in each
                    </p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setAddMembershipOpen(true)}
                    disabled={availableTenants.length === 0}
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Add to Organization
                  </Button>
                </div>

                {membershipsLoading ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">Loading memberships...</div>
                ) : memberships.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm border rounded-md">
                    No organization memberships. Add this user to an organization to get started.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organization</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {memberships.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Building className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="font-medium text-sm">{m.tenantName}</span>
                              <span className="text-xs text-muted-foreground">({m.tenantSlug})</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={m.role}
                              onValueChange={(role) => {
                                if (selectedUser) {
                                  updateMembershipRoleMutation.mutate({ userId: selectedUser.id, membershipId: m.id, role });
                                }
                              }}
                            >
                              <SelectTrigger className="w-[140px] h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TENANT_ROLES.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Badge variant={m.status === 'active' ? 'outline' : 'secondary'} className={m.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : ''}>
                              {m.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setRemoveMembershipId(m.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveChanges}
                disabled={updateRoleMutation.isPending || updateTenantMutation.isPending}
              >
                {(updateRoleMutation.isPending || updateTenantMutation.isPending) ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addMembershipOpen} onOpenChange={setAddMembershipOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to Organization</DialogTitle>
              <DialogDescription>
                Add {selectedUser?.name} to an organization with a specific role
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Organization</Label>
                <Select value={newMembershipTenantId} onValueChange={setNewMembershipTenantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTenants.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={newMembershipRole} onValueChange={setNewMembershipRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TENANT_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddMembershipOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedUser && newMembershipTenantId) {
                    addMembershipMutation.mutate({
                      userId: selectedUser.id,
                      tenantId: newMembershipTenantId,
                      role: newMembershipRole,
                    });
                  }
                }}
                disabled={!newMembershipTenantId || addMembershipMutation.isPending}
              >
                {addMembershipMutation.isPending ? "Adding..." : "Add Membership"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!removeMembershipId} onOpenChange={(open) => { if (!open) setRemoveMembershipId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Membership</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove this user from this organization? They will lose access to all data in that organization.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (selectedUser && removeMembershipId) {
                    removeMembershipMutation.mutate({ userId: selectedUser.id, membershipId: removeMembershipId });
                  }
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
