export const ROLES = {
  ADMIN: 'admin',
  BILLING_ADMIN: 'billing-admin',
  PM: 'pm',
  EMPLOYEE: 'employee',
  EXECUTIVE: 'executive',
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

export function getRoleDisplayName(role: UserRole): string {
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

export function canViewPricing(role: UserRole): boolean {
  return [ROLES.ADMIN, ROLES.BILLING_ADMIN].includes(role);
}

export function canManageProjects(role: UserRole): boolean {
  return [ROLES.ADMIN, ROLES.PM].includes(role);
}

export function canManageRates(role: UserRole): boolean {
  return role === ROLES.ADMIN;
}
