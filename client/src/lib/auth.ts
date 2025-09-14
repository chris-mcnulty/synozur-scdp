export const ROLES = {
  ADMIN: 'admin',
  BILLING_ADMIN: 'billing-admin',
  PM: 'pm',
  EMPLOYEE: 'employee',
  EXECUTIVE: 'executive',
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
    default:
      return role;
  }
}

const PRICING_ROLES: ReadonlySet<UserRole> = new Set([ROLES.ADMIN, ROLES.BILLING_ADMIN]);
const PROJECT_MANAGEMENT_ROLES: ReadonlySet<UserRole> = new Set([ROLES.ADMIN, ROLES.PM]);

export function canViewPricing(role: UserRole): boolean {
  return PRICING_ROLES.has(role);
}

export function canManageProjects(role: UserRole): boolean {
  return PROJECT_MANAGEMENT_ROLES.has(role);
}

export function canManageRates(role: UserRole): boolean {
  return role === ROLES.ADMIN;
}
