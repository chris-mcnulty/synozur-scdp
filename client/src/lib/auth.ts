export const ROLES = {
  ADMIN: 'admin',
  BILLING_ADMIN: 'billing-admin',
  PM: 'pm',
  EMPLOYEE: 'employee',
  EXECUTIVE: 'executive',
  CLIENT: 'client',
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

export function getRoleDisplayName(role: string | UserRole): string {
  switch (role) {
    case ROLES.ADMIN:
      return 'Admin';
    case ROLES.BILLING_ADMIN:
      return 'Billing Admin';
    case ROLES.PM:
      return 'Project Manager';
    case ROLES.EMPLOYEE:
      return 'Employee';
    case ROLES.EXECUTIVE:
      return 'Executive';
    case ROLES.CLIENT:
      return 'Client Stakeholder';
    default:
      return role;
  }
}

// Roles that can view basic pricing information (rates, totals)
const PRICING_ROLES: ReadonlySet<UserRole> = new Set([ROLES.ADMIN, ROLES.BILLING_ADMIN, ROLES.EXECUTIVE]);
// Roles that can view cost information and profit margins
const COST_MARGIN_ROLES: ReadonlySet<UserRole> = new Set([ROLES.ADMIN, ROLES.BILLING_ADMIN, ROLES.EXECUTIVE]);
const PROJECT_MANAGEMENT_ROLES: ReadonlySet<UserRole> = new Set([ROLES.ADMIN, ROLES.PM, ROLES.EXECUTIVE]);
// Roles that can manage most operations (executive has broad access)
const MANAGEMENT_ROLES: ReadonlySet<UserRole> = new Set([ROLES.ADMIN, ROLES.BILLING_ADMIN, ROLES.EXECUTIVE]);
// Roles that can create/manage roles
const ROLE_MANAGEMENT_ROLES: ReadonlySet<UserRole> = new Set([ROLES.ADMIN, ROLES.EXECUTIVE]);

export function canViewPricing(role: UserRole): boolean {
  return PRICING_ROLES.has(role);
}

export function canViewCostMargins(role: UserRole): boolean {
  return COST_MARGIN_ROLES.has(role);
}

export function canManageProjects(role: UserRole): boolean {
  return PROJECT_MANAGEMENT_ROLES.has(role);
}

export function canManageRates(role: UserRole): boolean {
  return MANAGEMENT_ROLES.has(role);
}

export function canManageRoles(role: UserRole): boolean {
  return ROLE_MANAGEMENT_ROLES.has(role);
}

export function canManageUsers(role: UserRole): boolean {
  return role === ROLES.ADMIN;
}

export function canManageSystemSettings(role: UserRole): boolean {
  return role === ROLES.ADMIN;
}

export function canCreateInvoices(role: UserRole): boolean {
  return MANAGEMENT_ROLES.has(role) || role === ROLES.PM;
}

export function canViewReports(role: UserRole): boolean {
  return role !== ROLES.EMPLOYEE;
}
