DROP POLICY IF EXISTS "Staff create org notifications" ON public.notifications;

DROP POLICY IF EXISTS "Platform staff read platform admins" ON public.platform_admins;
CREATE POLICY "Platform staff read platform admins" ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());