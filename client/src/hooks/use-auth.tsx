import { useQuery } from "@tanstack/react-query";
import { type User } from "@shared/schema";
import { canViewPricing, canViewCostMargins, canManageRoles, canManageUsers, canManageSystemSettings, canCreateInvoices, canViewReports, type UserRole } from "@/lib/auth";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    hasRole: (role: string) => user?.role === role,
    hasAnyRole: (roles: string[]) => user ? roles.includes(user.role) : false,
    canViewPricing: user ? canViewPricing(user.role as UserRole) : false,
    canViewCostMargins: user ? canViewCostMargins(user.role as UserRole) : false,
    canManageRoles: user ? canManageRoles(user.role as UserRole) : false,
    canManageUsers: user ? canManageUsers(user.role as UserRole) : false,
    canManageSystemSettings: user ? canManageSystemSettings(user.role as UserRole) : false,
    canCreateInvoices: user ? canCreateInvoices(user.role as UserRole) : false,
    canViewReports: user ? canViewReports(user.role as UserRole) : false,
    error,
  };
}
