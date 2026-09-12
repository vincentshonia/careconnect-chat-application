alter table public.visitors add column if not exists is_preview boolean not null default false;
alter table public.conversations add column if not exists is_preview boolean not null default false;

create index if not exists idx_conversations_preview on public.conversations (organization_id) where is_preview;

-- Reporting sees a filtered view of conversations: preview traffic never counts.
create schema if not exists rpt;
grant usage on schema rpt to service_role, authenticated, anon;

create or replace view rpt.conversations as
  select * from public.conversations where is_preview = false;

grant select on rpt.conversations to service_role, authenticated, anon;

alter function public.dashboard_metrics(uuid, uuid, uuid[], text, timestamptz, timestamptz, timestamptz, timestamptz, integer, text) set search_path = rpt, public;
alter function public.dashboard_staff_performance(uuid, uuid, timestamptz, timestamptz, integer) set search_path = rpt, public;
alter function public.report_ai(uuid, timestamptz, timestamptz, uuid[], uuid) set search_path = rpt, public;
alter function public.report_conv(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text) set search_path = rpt, public;
alter function public.report_department_backlog(uuid, uuid[], integer) set search_path = rpt, public;
alter function public.report_overview(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer) set search_path = rpt, public;
alter function public.report_sla(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer, text) set search_path = rpt, public;
alter function public.report_staff(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer) set search_path = rpt, public;
alter function public.report_staff_workload(uuid, uuid[]) set search_path = rpt, public;
alter function public.report_transfers(uuid, timestamptz, timestamptz, uuid[], integer, integer) set search_path = rpt, public;
alter function public.report_volume(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, text) set search_path = rpt, public;