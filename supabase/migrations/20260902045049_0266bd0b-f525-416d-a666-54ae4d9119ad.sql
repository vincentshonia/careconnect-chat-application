-- Training Center: per-user progress and per-organization content review flags.
CREATE TABLE IF NOT EXISTS public.training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guide_role text NOT NULL,
  section_id text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, guide_role, section_id)
);

COMMENT ON TABLE public.training_progress IS
  'One row per completed training section, per staff member, per role guide. Private to the staff member.';

CREATE INDEX IF NOT EXISTS training_progress_user_guide_idx
  ON public.training_progress (user_id, guide_role);

GRANT SELECT, INSERT, DELETE ON public.training_progress TO authenticated;
GRANT ALL ON public.training_progress TO service_role;

ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read their own training progress" ON public.training_progress;
CREATE POLICY "Staff read their own training progress"
  ON public.training_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff record their own training progress" ON public.training_progress;
CREATE POLICY "Staff record their own training progress"
  ON public.training_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Staff clear their own training progress" ON public.training_progress;
CREATE POLICY "Staff clear their own training progress"
  ON public.training_progress FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.training_review_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  guide_role text NOT NULL,
  status text NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review', 'reviewed')),
  note text,
  guide_version text,
  flagged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  flagged_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, guide_role)
);

COMMENT ON TABLE public.training_review_flags IS
  'Per-organization state of each training guide: when an administrator last reviewed it, and whether it is flagged as out of date.';

GRANT SELECT ON public.training_review_flags TO authenticated;
GRANT INSERT, UPDATE ON public.training_review_flags TO authenticated;
GRANT ALL ON public.training_review_flags TO service_role;

ALTER TABLE public.training_review_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read training review state" ON public.training_review_flags;
CREATE POLICY "Members read training review state"
  ON public.training_review_flags FOR SELECT TO authenticated
  USING (public.can_access_org(organization_id));

DROP POLICY IF EXISTS "Admins flag training content" ON public.training_review_flags;
CREATE POLICY "Admins flag training content"
  ON public.training_review_flags FOR INSERT TO authenticated
  WITH CHECK (public.has_perm(organization_id, 'settings.manage'));

DROP POLICY IF EXISTS "Admins update training review state" ON public.training_review_flags;
CREATE POLICY "Admins update training review state"
  ON public.training_review_flags FOR UPDATE TO authenticated
  USING (public.has_perm(organization_id, 'settings.manage'))
  WITH CHECK (public.has_perm(organization_id, 'settings.manage'));

DROP TRIGGER IF EXISTS training_review_flags_touch ON public.training_review_flags;
CREATE TRIGGER training_review_flags_touch
  BEFORE UPDATE ON public.training_review_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();