import { z } from "zod";

export const ROLE_RANK: Record<string, number> = {
  agent: 1,
  team_lead: 2,
  manager: 3,
  administrator: 4,
  super_admin: 5,
};

export const createStaffInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  role: z.enum(["agent", "team_lead", "manager", "administrator", "super_admin"]),
  title: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  departmentIds: z.array(z.string().uuid()).max(20).optional(),
});

export const staffAccessInput = z.object({
  userId: z.string().uuid(),
  action: z.enum(["disable", "enable", "remove"]),
});

/** Cryptographically random temporary password shown once to the administrator. */
export function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `Ph!${body}9`;
}
