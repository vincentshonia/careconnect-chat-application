UPDATE public.departments d
SET name = 'Member Engagement'
FROM public.organizations o
WHERE d.organization_id = o.id
  AND o.name = 'Pacific Health Group'
  AND d.name = 'Member Engagaement';

CREATE UNIQUE INDEX IF NOT EXISTS departments_org_lower_name_key
  ON public.departments (organization_id, lower(name));

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS maps_url text;