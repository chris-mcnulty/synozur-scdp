import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Role {
  id: string;
  name: string;
  defaultRackRate: string;
}

interface StaffMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  initials: string;
  role: string; // Legacy field
  roleId?: string;
  customRole?: string;
  standardRole?: Role;
  defaultChargeRate: string;
  defaultCostRate?: string;
  isActive: boolean;
}

export default function Staff() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [roleType, setRoleType] = useState<'standard' | 'custom'>('standard');
  const [editRoleType, setEditRoleType] = useState<'standard' | 'custom'>('standard');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [editSelectedRoleId, setEditSelectedRoleId] = useState<string>('');
  const { toast } = useToast();

  const { data: staff = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

  const { data: user } = useQuery<{ role: string }>({
    queryKey: ["/api/auth/user"],
  });

  const isAuthorized = user?.role === 'admin' || user?.role === 'executive';

  const createMutation = useMutation({
    mutationFn: (data: Partial<StaffMember>) => apiRequest("/api/staff", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setCreateDialogOpen(false);
      toast({ title: "Staff member created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create staff member", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<StaffMember> & { id: string }) => 
      apiRequest(`/api/staff/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setEditDialogOpen(false);
      setSelectedStaff(null);
      toast({ title: "Staff member updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update staff member", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/staff/${id}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setDeleteDialogOpen(false);
      setSelectedStaff(null);
      toast({ title: "Staff member deactivated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete staff member", variant: "destructive" });
    },
  });

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    
    const data: any = {
      email: formData.get("email") as string,
      firstName: firstName,
      lastName: lastName,
      name: `${firstName} ${lastName}`,
      initials: formData.get("initials") as string,
      defaultChargeRate: formData.get("defaultChargeRate") as string,
      defaultCostRate: formData.get("defaultCostRate") as string,
    };
    
    if (roleType === 'standard' && selectedRoleId) {
      data.roleId = selectedRoleId;
      // Find the selected role to get its name
      const selectedRole = roles.find(r => r.id === selectedRoleId);
      data.role = selectedRole?.name || ''; // Keep legacy field for compatibility
    } else {
      data.customRole = formData.get("customRole") as string;
      data.role = data.customRole; // Keep legacy field for compatibility
    }
    
    createMutation.mutate(data);
  };

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedStaff) return;
    
    const formData = new FormData(e.currentTarget);
    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    
    const data: any = {
      id: selectedStaff.id,
      email: formData.get("email") as string,
      firstName: firstName,
      lastName: lastName,
      name: `${firstName} ${lastName}`,
      initials: formData.get("initials") as string,
      defaultChargeRate: formData.get("defaultChargeRate") as string,
      defaultCostRate: formData.get("defaultCostRate") as string,
    };
    
    if (editRoleType === 'standard' && editSelectedRoleId) {
      data.roleId = editSelectedRoleId;
      const selectedRole = roles.find(r => r.id === editSelectedRoleId);
      data.role = selectedRole?.name || '';
      data.customRole = null;
    } else {
      data.customRole = formData.get("customRole") as string;
      data.role = data.customRole;
      data.roleId = null;
    }
    
    updateMutation.mutate(data);
  };

  return (
    <div className="p-8">
      {/* Navigation Breadcrumb */}
      <div className="mb-6 flex items-center space-x-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors" data-testid="link-dashboard">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-foreground">Staff Management</span>
      </div>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-2xl font-bold">Staff Management</CardTitle>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-add-staff">
            <Plus className="mr-2 h-4 w-4" />
            Add Staff Member
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading staff members...</div>
          ) : staff.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No staff members yet. Add your first staff member to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Initials</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Charge Rate</TableHead>
                  {isAuthorized && <TableHead>Cost Rate</TableHead>}
                  {user?.role === 'admin' && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((member) => (
                  <TableRow key={member.id} data-testid={`staff-row-${member.id}`}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{member.initials}</TableCell>
                    <TableCell>{member.standardRole?.name || member.customRole || member.role}</TableCell>
                    <TableCell>${member.defaultChargeRate}/hr</TableCell>
                    {isAuthorized && (
                      <TableCell>${member.defaultCostRate}/hr</TableCell>
                    )}
                    {user?.role === 'admin' && (
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            data-testid={`button-edit-${member.id}`}
                            onClick={() => {
                              setSelectedStaff(member);
                              // Set initial values for edit form
                              if (member.roleId) {
                                setEditRoleType('standard');
                                setEditSelectedRoleId(member.roleId);
                              } else {
                                setEditRoleType('custom');
                                setEditSelectedRoleId('');
                              }
                              setEditDialogOpen(true);
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-delete-${member.id}`}
                            onClick={() => {
                              setSelectedStaff(member);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                data-testid="input-email"
              />
            </div>
            <div>
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                name="firstName"
                required
                data-testid="input-first-name"
              />
            </div>
            <div>
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                name="lastName"
                required
                data-testid="input-last-name"
              />
            </div>
            <div>
              <Label htmlFor="initials">Initials</Label>
              <Input
                id="initials"
                name="initials"
                required
                maxLength={5}
                data-testid="input-initials"
              />
            </div>
            <div>
              <Label>Role Assignment</Label>
              <RadioGroup 
                value={roleType} 
                onValueChange={(value: 'standard' | 'custom') => {
                  setRoleType(value);
                  setSelectedRoleId('');
                }}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="standard" id="standard" />
                  <Label htmlFor="standard">Standard Role</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="custom" />
                  <Label htmlFor="custom">Custom Role</Label>
                </div>
              </RadioGroup>
              
              {roleType === 'standard' ? (
                <Select 
                  value={selectedRoleId} 
                  onValueChange={(value) => {
                    setSelectedRoleId(value);
                    // Pre-fill charge rate from selected role
                    const role = roles.find(r => r.id === value);
                    if (role) {
                      const chargeInput = document.getElementById('defaultChargeRate') as HTMLInputElement;
                      if (chargeInput) {
                        chargeInput.value = role.defaultRackRate;
                      }
                    }
                  }}
                >
                  <SelectTrigger className="mt-2" data-testid="select-standard-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map(role => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name} (Default: ${role.defaultRackRate}/hr)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="mt-2"
                  name="customRole"
                  placeholder="e.g., Technical Architect"
                  required={roleType === 'custom'}
                  data-testid="input-custom-role"
                />
              )}
            </div>
            <div>
              <Label htmlFor="defaultChargeRate">Default Charge Rate ($/hr)</Label>
              <Input
                id="defaultChargeRate"
                name="defaultChargeRate"
                type="number"
                step="0.01"
                required
                data-testid="input-charge-rate"
              />
            </div>
            <div>
              <Label htmlFor="defaultCostRate">Default Cost Rate ($/hr)</Label>
              <Input
                id="defaultCostRate"
                name="defaultCostRate"
                type="number"
                step="0.01"
                required
                data-testid="input-cost-rate"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-create">
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
          </DialogHeader>
          {selectedStaff && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  name="email"
                  type="email"
                  defaultValue={selectedStaff.email}
                  required
                  data-testid="input-edit-email"
                />
              </div>
              <div>
                <Label htmlFor="edit-firstName">First Name</Label>
                <Input
                  id="edit-firstName"
                  name="firstName"
                  defaultValue={selectedStaff.firstName}
                  required
                  data-testid="input-edit-first-name"
                />
              </div>
              <div>
                <Label htmlFor="edit-lastName">Last Name</Label>
                <Input
                  id="edit-lastName"
                  name="lastName"
                  defaultValue={selectedStaff.lastName}
                  required
                  data-testid="input-edit-last-name"
                />
              </div>
              <div>
                <Label htmlFor="edit-initials">Initials</Label>
                <Input
                  id="edit-initials"
                  name="initials"
                  defaultValue={selectedStaff.initials}
                  required
                  maxLength={5}
                  data-testid="input-edit-initials"
                />
              </div>
              <div>
                <Label>Role Assignment</Label>
                <RadioGroup 
                  value={editRoleType} 
                  onValueChange={(value: 'standard' | 'custom') => {
                    setEditRoleType(value);
                    setEditSelectedRoleId('');
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="standard" id="edit-standard" />
                    <Label htmlFor="edit-standard">Standard Role</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="custom" id="edit-custom" />
                    <Label htmlFor="edit-custom">Custom Role</Label>
                  </div>
                </RadioGroup>
                
                {editRoleType === 'standard' ? (
                  <Select 
                    value={editSelectedRoleId} 
                    onValueChange={(value) => {
                      setEditSelectedRoleId(value);
                      // Pre-fill charge rate from selected role
                      const role = roles.find(r => r.id === value);
                      if (role) {
                        const chargeInput = document.getElementById('edit-defaultChargeRate') as HTMLInputElement;
                        if (chargeInput) {
                          chargeInput.value = role.defaultRackRate;
                        }
                      }
                    }}
                  >
                    <SelectTrigger className="mt-2" data-testid="edit-select-standard-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map(role => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name} (Default: ${role.defaultRackRate}/hr)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="mt-2"
                    name="customRole"
                    defaultValue={selectedStaff.customRole || selectedStaff.role}
                    placeholder="e.g., Technical Architect"
                    required={editRoleType === 'custom'}
                    data-testid="input-edit-custom-role"
                  />
                )}
              </div>
              <div>
                <Label htmlFor="edit-defaultChargeRate">Default Charge Rate ($/hr)</Label>
                <Input
                  id="edit-defaultChargeRate"
                  name="defaultChargeRate"
                  type="number"
                  step="0.01"
                  defaultValue={selectedStaff.defaultChargeRate}
                  required
                  data-testid="input-edit-charge-rate"
                />
              </div>
              <div>
                <Label htmlFor="edit-defaultCostRate">Default Cost Rate ($/hr)</Label>
                <Input
                  id="edit-defaultCostRate"
                  name="defaultCostRate"
                  type="number"
                  step="0.01"
                  defaultValue={selectedStaff.defaultCostRate}
                  required
                  data-testid="input-edit-cost-rate"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-submit-edit">
                  {updateMutation.isPending ? "Updating..." : "Update"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {selectedStaff?.name}? They will no longer appear in active staff lists but their data will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedStaff && deleteMutation.mutate(selectedStaff.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}