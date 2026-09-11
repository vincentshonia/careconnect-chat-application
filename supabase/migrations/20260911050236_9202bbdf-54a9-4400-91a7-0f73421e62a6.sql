create or replace function public.seed_default_dispositions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.conversation_dispositions (organization_id, label, is_active)
  select new.id, label, true
  from unnest(array[
    'Enrolled / referral submitted',
    'Information provided',
    'Callback scheduled',
    'Transferred to plan',
    'Not eligible',
    'Spam / test',
    'No response from visitor'
  ]) as label
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.seed_default_dispositions() from public, anon, authenticated;

drop trigger if exists organizations_seed_dispositions on public.organizations;
create trigger organizations_seed_dispositions
after insert on public.organizations
for each row execute function public.seed_default_dispositions();

insert into public.conversation_dispositions (organization_id, label, is_active)
select o.id, d.label, true
from public.organizations o
cross join unnest(array[
  'Enrolled / referral submitted',
  'Information provided',
  'Callback scheduled',
  'Transferred to plan',
  'Not eligible',
  'Spam / test',
  'No response from visitor'
]) as d(label)
where not exists (
  select 1 from public.conversation_dispositions c
  where c.organization_id = o.id and c.label = d.label
);