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
import { Shield, Users, Search, Crown, Briefcase, User, Building } from "lucide-react";

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

const PLATFORM_ROLES = [
  { value: "user", label: "User", description: "Regular tenant-scoped user" },
  { value: "constellation_consultant", label: "Consultant", description: "Cross-tenant consultant access" },
  { value: "constellation_admin", label: "Platform Admin", description: "Manage tenants and service plans" },
  { value: "global_admin", label: "Global Admin", description: "Full platform control" },
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

  const { data: users = [], isLoading } = useQuery<PlatformUser[]>({
    queryKey: ["/api/platform/users"],
  });

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/platform/tenants"],
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
      setEditDialogOpen(false);
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
      toast({ title: "Tenant updated", description: "User's primary tenant has been changed." });
      setEditDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update tenant", 
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

    if (selectedRole !== (selectedUser.platformRole || "user")) {
      updateRoleMutation.mutate({ userId: selectedUser.id, platformRole: selectedRole });
    }
    
    if (selectedTenant !== (selectedUser.primaryTenantId || "")) {
      updateTenantMutation.mutate({ 
        userId: selectedUser.id, 
        primaryTenantId: selectedTenant || null 
      });
    }

    if (selectedRole === (selectedUser.platformRole || "user") && 
        selectedTenant === (selectedUser.primaryTenantId || "")) {
      setEditDialogOpen(false);
    }
  };

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
                    <TableHead>Tenant</TableHead>
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

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update platform role and tenant assignment for {selectedUser?.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
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
                <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Tenant</SelectItem>
                    {tenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
      </div>
    </Layout>
  );
}
