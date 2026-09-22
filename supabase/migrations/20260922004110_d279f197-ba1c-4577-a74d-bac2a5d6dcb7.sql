-- A1: no platform-wide admins in production; org roles are org-scoped.
DELETE FROM public.platform_admins WHERE user_id IS NOT NULL;

-- A3: drop the legacy role store and its helper (organization_memberships.role is authoritative).
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP TABLE IF EXISTS public.user_roles;

-- A2: remove the org-agnostic super-admin helper (unused; org scoping only via is_org_member).
DROP FUNCTION IF EXISTS private.is_super_admin();

-- B4: no orphan rows when an organization is deleted.
DELETE FROM public.notification_preferences np
WHERE np.organization_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = np.organization_id);

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_organization_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_organization_id_fkey;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_organization_id_fkey;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.conversation_ratings DROP CONSTRAINT IF EXISTS conversation_ratings_organization_id_fkey;
ALTER TABLE public.conversation_ratings
  ADD CONSTRAINT conversation_ratings_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.qa_reviews DROP CONSTRAINT IF EXISTS qa_reviews_organization_id_fkey;
ALTER TABLE public.qa_reviews
  ADD CONSTRAINT qa_reviews_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;