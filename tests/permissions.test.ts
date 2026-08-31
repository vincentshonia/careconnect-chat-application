import { describe, expect, it } from "vitest";
import {
  ROLE_PERMISSIONS,
  permissionsFor,
  roleTransitionError,
} from "../src/lib/permissions";

describe("role permission bundles", () => {
  it("standard users only reach their own conversations", () => {
    const p = new Set(ROLE_PERMISSIONS.agent);
    expect(p.has("conversation.view_assigned")).toBe(true);
    expect(p.has("conversation.view_all")).toBe(false);
    expect(p.has("staff.create")).toBe(false);
    expect(p.has("role.manage")).toBe(false);
  });

  it("team leads see their department but cannot administer", () => {
    const p = new Set(ROLE_PERMISSIONS.team_lead);
    expect(p.has("conversation.view_department")).toBe(true);
    expect(p.has("conversation.view_all")).toBe(false);
    expect(p.has("settings.manage")).toBe(false);
  });

  it("only super admins manage security and organizations", () => {
    expect(new Set(ROLE_PERMISSIONS.administrator).has("security.manage")).toBe(false);
    expect(new Set(ROLE_PERMISSIONS.super_admin).has("security.manage")).toBe(true);
    expect(new Set(ROLE_PERMISSIONS.super_admin).has("organization.manage")).toBe(true);
  });

  it("platform billing and support never gain tenant administration", () => {
    const billing = permissionsFor(null, "platform_billing");
    expect(billing.has("platform.billing")).toBe(true);
    expect(billing.has("conversation.view_all")).toBe(false);
    expect(billing.has("staff.create")).toBe(false);

    const support = permissionsFor(null, "platform_support");
    expect(support.has("staff.create")).toBe(false);

    const admin = permissionsFor(null, "platform_admin");
    expect(admin.has("staff.create")).toBe(true);
  });
});

describe("privilege escalation guards", () => {
  it("blocks self role changes", () => {
    expect(
      roleTransitionError({
        actorRole: "administrator",
        actorIsSelf: true,
        actorIsPlatformAdmin: false,
        targetCurrentRole: "administrator",
        targetNewRole: "super_admin",
      }),
    ).toBeTruthy();
  });

  it("stops administrators granting or editing super admin", () => {
    expect(
      roleTransitionError({
        actorRole: "administrator",
        actorIsSelf: false,
        actorIsPlatformAdmin: false,
        targetCurrentRole: "manager",
        targetNewRole: "super_admin",
      }),
    ).toBeTruthy();
    expect(
      roleTransitionError({
        actorRole: "administrator",
        actorIsSelf: false,
        actorIsPlatformAdmin: false,
        targetCurrentRole: "super_admin",
        targetNewRole: "agent",
      }),
    ).toBeTruthy();
  });

  it("stops managers and team leads changing roles at all", () => {
    for (const actorRole of ["agent", "team_lead", "manager"] as const) {
      expect(
        roleTransitionError({
          actorRole,
          actorIsSelf: false,
          actorIsPlatformAdmin: false,
          targetCurrentRole: "agent",
          targetNewRole: "team_lead",
        }),
      ).toBeTruthy();
    }
  });

  it("allows an administrator to promote up to their own level", () => {
    expect(
      roleTransitionError({
        actorRole: "administrator",
        actorIsSelf: false,
        actorIsPlatformAdmin: false,
        targetCurrentRole: "agent",
        targetNewRole: "administrator",
      }),
    ).toBeNull();
  });

  it("allows a super admin to grant super admin", () => {
    expect(
      roleTransitionError({
        actorRole: "super_admin",
        actorIsSelf: false,
        actorIsPlatformAdmin: false,
        targetCurrentRole: "administrator",
        targetNewRole: "super_admin",
      }),
    ).toBeNull();
  });
});
