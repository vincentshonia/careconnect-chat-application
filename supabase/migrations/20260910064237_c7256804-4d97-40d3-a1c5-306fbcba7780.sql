create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.purge_old_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where created_at < now() - interval '1 day';
$$;

revoke all on function public.purge_old_rate_limits() from public, anon, authenticated;

select cron.unschedule('purge-old-rate-limits')
where exists (select 1 from cron.job where jobname = 'purge-old-rate-limits');

select cron.schedule(
  'purge-old-rate-limits',
  '17 3 * * *',
  $$select public.purge_old_rate_limits();$$
);