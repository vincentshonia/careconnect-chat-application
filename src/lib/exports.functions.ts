/**
 * Server-side CSV exports.
 *
 * Exports are generated in the database, page by page, under the caller's own
 * row-level security — the browser never pulls a whole table down to filter it
 * client-side, and an export can never contain a row the person could not see
 * in the list they exported from. Results are capped so one click cannot
 * generate an unbounded response.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActor, requirePermission, requireOrganization, ForbiddenError } from "@/lib/authz.server";
import { toCsv } from "@/lib/csv";

/** Rows fetched per round trip, and the hard ceiling for one export. */
const CHUNK = 1_000;
export const EXPORT_ROW_CAP = 50_000;

export const EXPORT_DATASETS = ["contacts", "intake", "audit", "staff"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

const inputSchema = z.object({
  dataset: z.enum(EXPORT_DATASETS),
  search: z.string().max(120).optional(),
  status: z.string().max(40).nullable().optional(),
  type: z.string().max(40).nullable().optional(),
});

type Filters = z.infer<typeof inputSchema>;

const SELECTS: Record<ExportDataset, string> = {
  contacts:
    "full_name, email, phone, county, zip_code, health_plan, service_interest, preferred_language, preferred_contact_method, visitor_type, lead_status, consent_given, first_contact_at, last_contact_at",
  intake:
    "reference, created_at, request_type, stage, priority, full_name, email, phone, county, zip_code, health_plan, service_interest, preferred_language, source, due_date, submitted_at, closed_at",
  audit: "created_at, actor_name, action, record_type, record_id, ip_address",
  staff: "full_name, email, title, phone, presence, status, max_concurrent_chats, created_at",
};

const ORDER: Record<ExportDataset, { column: string; ascending: boolean }> = {
  contacts: { column: "last_contact_at", ascending: false },
  intake: { column: "created_at", ascending: false },
  audit: { column: "created_at", ascending: false },
  staff: { column: "full_name", ascending: true },
};

const TABLES: Record<ExportDataset, string> = {
  contacts: "contacts",
  intake: "intake_requests",
  audit: "audit_logs",
  staff: "profiles",
};

const PERMISSION: Record<ExportDataset, string> = {
  contacts: "contact.view_department",
  intake: "workflow.view_assigned",
  audit: "audit.view",
  staff: "staff.view",
};

/** Escape a value for a PostgREST `or=` search expression. */
function sanitize(term: string) {
  return term.trim().replace(/[%,()*]/g, "").slice(0, 80);
}

function applyFilters(
  query: { or: (f: string) => unknown; eq: (c: string, v: unknown) => unknown },
  dataset: ExportDataset,
  filters: Filters,
) {
  const term = sanitize(filters.search ?? "");
  if (term) {
    if (dataset === "contacts") {
      query.or(
        `full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,county.ilike.%${term}%,health_plan.ilike.%${term}%,service_interest.ilike.%${term}%`,
      );
    } else if (dataset === "intake") {
      query.or(`full_name.ilike.%${term}%,reference.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
    } else if (dataset === "audit") {
      query.or(`action.ilike.%${term}%,actor_name.ilike.%${term}%,record_type.ilike.%${term}%`);
    } else {
      query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,title.ilike.%${term}%`);
    }
  }
  if (filters.status && filters.status !== "all") {
    if (dataset === "contacts") query.eq("lead_status", filters.status);
    if (dataset === "intake") query.eq("stage", filters.status);
    if (dataset === "staff") query.eq("status", filters.status);
  }
  if (filters.type && filters.type !== "all" && dataset === "intake") {
    query.eq("request_type", filters.type);
  }
}

export const exportCsvFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, PERMISSION[data.dataset] as never, "You can't export that data");
    const organizationId = requireOrganization(actor);
    if (!organizationId) throw new ForbiddenError("Your account is not linked to an organization");

    const rows: Record<string, unknown>[] = [];
    let truncated = false;

    // Chunked reads keep memory flat and the request cancellable.
    for (let offset = 0; offset < EXPORT_ROW_CAP; offset += CHUNK) {
      const query = context.supabase
        .from(TABLES[data.dataset] as never)
        .select(SELECTS[data.dataset]) as unknown as {
        or: (f: string) => unknown;
        eq: (c: string, v: unknown) => unknown;
        order: (c: string, o: { ascending: boolean }) => unknown;
        range: (a: number, b: number) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
      applyFilters(query, data.dataset, data);
      query.order(ORDER[data.dataset].column, { ascending: ORDER[data.dataset].ascending });
      const { data: chunk, error } = await query.range(offset, offset + CHUNK - 1);
      if (error) {
        console.error("[export] failed", data.dataset, error.message);
        throw new Error("Could not build that export");
      }
      const batch = (chunk ?? []) as Record<string, unknown>[];
      rows.push(...batch);
      if (batch.length < CHUNK) break;
      if (rows.length >= EXPORT_ROW_CAP) {
        truncated = true;
        break;
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: actor.userId,
      actor_name: actor.fullName,
      action: "data.exported",
      record_type: data.dataset,
      new_value: { rows: rows.length, search: data.search ?? null, status: data.status ?? null },
    });

    return {
      dataset: data.dataset as string,
      rows: rows.length,
      truncated,
      csv: toCsv(rows),
    };
  });
