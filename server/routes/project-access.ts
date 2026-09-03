export interface ProjectAccessUser {
  id?: string | null;
  role?: string | null;
}

export interface ProjectAccessTarget {
  pm?: string | null;
}

export interface ProjectAccessDenial {
  status: 403;
  body: { message: string };
}

const TENANT_WIDE_PROJECT_ROLES = new Set(["admin", "portfolio-manager", "executive"]);

export function getM365RetryAccessDenial(
  user: ProjectAccessUser | null | undefined,
  project: ProjectAccessTarget,
): ProjectAccessDenial | null {
  if (user?.role && TENANT_WIDE_PROJECT_ROLES.has(user.role)) {
    return null;
  }
  if (user?.role === "pm" && user.id && project.pm === user.id) {
    return null;
  }
  return {
    status: 403,
    body: { message: "You can only retry Microsoft setup for projects you manage." },
  };
}