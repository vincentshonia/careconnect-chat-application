/**
 * CareConnect authorization catalog.
 *
 * `organization_memberships.role` is the single authoritative source of truth
 * for tenant roles. Roles resolve into explicit permission bundles that mirror
 * the `role_permissions` / `platform_role_permissions` tables in the database,
 * so the UI, the server functions and RLS all agree. Custom roles can later be
 * added by inserting rows in those tables without changing the architecture.
 */

export type OrgRole = "agent" | "team_lead" | "manager" | "administrator" | "super_admin";
export type PlatformRole =
  | "platform_owner"
  | "platform_admin"
  | "platform_support"
  | "platform_billing"
  | "platform_read_only";

export const ORG_ROLES: OrgRole[] = [
  "agent",
  "team_lead",
  "manager",
  "administrator",
  "super_admin",
];

/** Customer-facing labels. The enum keeps `agent` internally. */
export const ROLE_LABEL: Record<OrgRole, string> = {
  agent: "Standard User",
  team_lead: "Team Lead",
  manager: "Manager",
  administrator: "Administrator",
  super_admin: "Super Admin",
};

export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  platform_owner: "Platform Owner",
  platform_admin: "Platform Admin",
  platform_support: "Platform Support",
  platform_billing: "Platform Billing",
  platform_read_only: "Platform Read Only",
};

export const ROLE_RANK: Record<OrgRole, number> = {
  agent: 1,
  team_lead: 2,
  manager: 3,
  administrator: 4,
  super_admin: 5,
};

export type Permission =
  // conversations — visibility, ownership, response and supervision are distinct
  | "conversation.view_assigned"
  | "conversation.view_department"
  | "conversation.view_all"
  | "conversation.claim"
  | "conversation.reply"
  | "conversation.reply_assigned"
  | "conversation.assign"
  | "conversation.reassign"
  | "conversation.transfer"
  | "conversation.close"
  // workflows / tasks
  | "workflow.view_assigned"
  | "workflow.view_team"
  | "workflow.view_all"
  | "workflow.manage"
  | "task.view_assigned"
  | "task.manage_team"
  // contacts
  | "contact.view_related"
  | "contact.view_department"
  | "contact.view_all"
  | "contact.edit"
  // knowledge
  | "knowledge.read"
  | "knowledge.create"
  | "knowledge.edit"
  | "knowledge.publish"
  | "knowledge.delete"
  // staff
  | "staff.view"
  | "staff.create"
  | "staff.edit"
  | "staff.disable"
  | "staff.remove"
  | "role.manage"
  | "role.manage_admins"
  // administration
  | "website.manage"
  | "department.manage"
  | "routing.manage"
  | "settings.manage"
  | "security.manage"
  | "audit.view"
  | "organization.manage"
  | "integration.manage"
  // reporting
  | "reports.self"
  | "reports.team"
  | "reports.organization"
  | "reports.platform";

export type PlatformPermission =
  | "platform.manage"
  | "platform.tenant_admin"
  | "platform.support_access"
  | "platform.billing"
  | "platform.roles_manage"
  | "reports.platform";

const AGENT: Permission[] = [
  "conversation.view_assigned",
  "conversation.reply",
  "conversation.close",
  "workflow.view_assigned",
  "task.view_assigned",
  "contact.view_related",
  "knowledge.read",
  "reports.self",
];

const TEAM_LEAD: Permission[] = [
  ...AGENT,
  "conversation.view_department",
  "conversation.assign",
  "conversation.transfer",
  "workflow.view_team",
  "task.manage_team",
  "contact.view_department",
  "reports.team",
  "staff.view",
];

const MANAGER: Permission[] = [
  ...TEAM_LEAD,
  "workflow.manage",
  "contact.edit",
  "knowledge.create",
  "knowledge.edit",
  "knowledge.publish",
];

const ADMINISTRATOR: Permission[] = [
  ...MANAGER,
  "conversation.view_all",
  "workflow.view_all",
  "contact.view_all",
  "knowledge.delete",
  "staff.create",
  "staff.edit",
  "staff.disable",
  "staff.remove",
  "role.manage",
  "website.manage",
  "department.manage",
  "routing.manage",
  "settings.manage",
  "audit.view",
  "integration.manage",
  "reports.organization",
];

const SUPER_ADMIN: Permission[] = [
  ...ADMINISTRATOR,
  "role.manage_admins",
  "security.manage",
  "organization.manage",
];

export const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  agent: AGENT,
  team_lead: TEAM_LEAD,
  manager: MANAGER,
  administrator: ADMINISTRATOR,
  super_admin: SUPER_ADMIN,
};

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  platform_owner: [
    "platform.manage",
    "platform.tenant_admin",
    "platform.support_access",
    "platform.billing",
    "platform.roles_manage",
    "reports.platform",
  ],
  platform_admin: [
    "platform.tenant_admin",
    "platform.support_access",
    "platform.roles_manage",
    "reports.platform",
  ],
  platform_support: ["platform.support_access", "reports.platform"],
  platform_billing: ["platform.billing", "reports.platform"],
  platform_read_only: ["reports.platform"],
};

/** Permissions granted to a tenant role, plus any platform override. */
export function permissionsFor(
  role: OrgRole | null,
  platformRole: PlatformRole | null,
): Set<string> {
  const set = new Set<string>(role ? ROLE_PERMISSIONS[role] : []);
  const platform = platformRole ? PLATFORM_ROLE_PERMISSIONS[platformRole] : [];
  for (const p of platform) set.add(p);
  // Only owner/admin platform roles get tenant administration reach.
  if (platform.includes("platform.tenant_admin")) {
    for (const p of SUPER_ADMIN) set.add(p);
  }
  return set;
}

export function can(permissions: Set<string> | undefined, permission: Permission | string) {
  return Boolean(permissions?.has(permission));
}

/**
 * Whether `actorRole` may set `targetCurrentRole` -> `targetNewRole`.
 * Returns an error message when the transition is not allowed.
 */
export function roleTransitionError(input: {
  actorRole: OrgRole | null;
  actorIsSelf: boolean;
  actorIsPlatformAdmin: boolean;
  targetCurrentRole: OrgRole | null;
  targetNewRole: OrgRole;
}): string | null {
  const { actorRole, actorIsSelf, actorIsPlatformAdmin, targetCurrentRole, targetNewRole } = input;

  if (actorIsPlatformAdmin) return null;
  if (!actorRole) return "You are not a member of this organization";

  const actorRank = ROLE_RANK[actorRole];
  if (actorRank < ROLE_RANK.administrator) {
    return "You do not have permission to change roles";
  }
  if (actorIsSelf) return "You cannot change your own role";

  // Administrators may never grant or modify Super Admin.
  if (actorRank < ROLE_RANK.super_admin) {
    if (targetNewRole === "super_admin") {
      return "Only a Super Admin can grant the Super Admin role";
    }
    if (targetCurrentRole === "super_admin") {
      return "Only a Super Admin can change another Super Admin";
    }
  }
  if (ROLE_RANK[targetNewRole] > actorRank) {
    return "You cannot assign a role above your own authority";
  }
  return null;
}
