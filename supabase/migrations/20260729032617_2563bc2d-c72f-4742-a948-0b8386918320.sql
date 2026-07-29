ALTER TABLE public.department_members
  ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS department_members_rr_idx
  ON public.department_members (department_id, last_assigned_at NULLS FIRST);