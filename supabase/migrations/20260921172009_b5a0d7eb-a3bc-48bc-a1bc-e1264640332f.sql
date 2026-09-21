ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS ringcentral_chat_id text;

ALTER TABLE public.notification_preferences ALTER COLUMN email_escalations SET DEFAULT true;
ALTER TABLE public.notification_preferences ALTER COLUMN email_new_intake SET DEFAULT true;

CREATE OR REPLACE FUNCTION public.eligible_notification_recipients(
  _org uuid,
  _department uuid,
  _pref text
)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT om.user_id
  FROM public.organization_memberships om
  JOIN public.profiles p ON p.id = om.user_id
  LEFT JOIN public.notification_preferences np ON np.user_id = om.user_id
  WHERE om.organization_id = _org
    AND om.status = 'active'
    AND p.status = 'active'
    AND (
      _department IS NULL
      OR EXISTS (
        SELECT 1 FROM public.department_members dm
        WHERE dm.user_id = om.user_id AND dm.department_id = _department
      )
    )
    AND CASE _pref
      WHEN 'inapp_escalations' THEN COALESCE(np.inapp_escalations, true)
      WHEN 'inapp_new_intake'  THEN COALESCE(np.inapp_new_intake, true)
      WHEN 'inapp_sla_breach'  THEN COALESCE(np.inapp_sla_breach, true)
      WHEN 'inapp_low_rating'  THEN COALESCE(np.inapp_low_rating, true)
      WHEN 'email_escalations' THEN COALESCE(np.email_escalations, true)
      WHEN 'email_new_intake'  THEN COALESCE(np.email_new_intake, true)
      WHEN 'email_sla_breach'  THEN COALESCE(np.email_sla_breach, false)
      WHEN 'email_low_rating'  THEN COALESCE(np.email_low_rating, false)
      ELSE true
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.eligible_notification_recipients(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eligible_notification_recipients(uuid, uuid, text) TO service_role;