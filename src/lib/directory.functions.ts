/**
 * Paginated staff directory.
 *
 * The team list is read one page at a time straight from Postgres — search,
 * role/department/status filters, ordering and the total count all happen in
 * SQL (`staff_directory`), so a tenant with thousands of staff loads exactly
 * as fast as one with ten.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActor, requirePermission, requireOrganization } from "@/lib/authz.server";

export const STAFF_PAGE_SIZE = 25;

const listSchema = z.object({
  search: z.string().max(120).optional(),
  role: z.string().max(30).nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  status: z.enum(["all", "active", "disabled", "removed"]).default("active"),
  page: z.number().int().min(0).max(10_000).default(0),
  pageSize: z.number().int().min(5).max(100).default(STAFF_PAGE_SIZE),
});

export type StaffRow = {
  user_id: string;
  role: string | null;
  membership_status: string;
  full_name: string | null;
  email: string | null;
  title: string | null;
  phone: string | null;
  presence: string;
  profile_status: string;
  max_concurrent_chats: number;
  departments: { id: string; membership_id: string }[];
};

export const listStaffFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "staff.view", "You don't have access to the team directory");
    const organizationId = requireOrganization(actor);

    const { data: result, error } = await context.supabase.rpc("staff_directory", {
      _org: organizationId,
      _search: data.search?.trim() || null,
      _role: (data.role || null) as never,
      _dept: data.departmentId || null,
      _status: data.status,
      _limit: data.pageSize,
      _offset: data.page * data.pageSize,
    } as never);
    if (error) {
      console.error("[staff] directory failed", error.message);
      throw new Error("Could not load the team directory");
    }

    const payload = (result ?? { total: 0, rows: [] }) as { total: number; rows: StaffRow[] };
    return {
      total: Number(payload.total ?? 0),
      page: data.page,
      pageSize: data.pageSize,
      rows: (payload.rows ?? []) as StaffRow[],
    };
  });
