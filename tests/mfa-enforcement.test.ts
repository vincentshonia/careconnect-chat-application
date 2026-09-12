import { describe, it, expect } from "vitest";
import { assertMfaSatisfied, MfaRequiredError } from "@/lib/authz.server";

describe("assertMfaSatisfied", () => {
  it("allows any session when the tenant does not require two-step verification", () => {
    expect(() =>
      assertMfaSatisfied({
        claims: { aal: "aal1" },
        rank: 5,
        requireMfa: false,
        requireMfaForAdmins: false,
      }),
    ).not.toThrow();
  });

  it("rejects an aal1 session when the tenant requires it for everyone", () => {
    expect(() =>
      assertMfaSatisfied({
        claims: { aal: "aal1" },
        rank: 1,
        requireMfa: true,
        requireMfaForAdmins: false,
      }),
    ).toThrow(MfaRequiredError);
  });

  it("rejects an admin-rank aal1 session under the admin-only policy", () => {
    expect(() =>
      assertMfaSatisfied({
        claims: { aal: "aal1" },
        rank: 4,
        requireMfa: false,
        requireMfaForAdmins: true,
      }),
    ).toThrow("Two-step verification required");
  });

  it("allows a non-admin under the admin-only policy", () => {
    expect(() =>
      assertMfaSatisfied({
        claims: { aal: "aal1" },
        rank: 3,
        requireMfa: false,
        requireMfaForAdmins: true,
      }),
    ).not.toThrow();
  });

  it("allows a verified aal2 session under either policy", () => {
    expect(() =>
      assertMfaSatisfied({
        claims: { aal: "aal2" },
        rank: 5,
        requireMfa: true,
        requireMfaForAdmins: true,
      }),
    ).not.toThrow();
  });

  it("rejects a session with no aal claim at all", () => {
    expect(() =>
      assertMfaSatisfied({ claims: null, rank: 1, requireMfa: true, requireMfaForAdmins: false }),
    ).toThrow(MfaRequiredError);
  });
});
