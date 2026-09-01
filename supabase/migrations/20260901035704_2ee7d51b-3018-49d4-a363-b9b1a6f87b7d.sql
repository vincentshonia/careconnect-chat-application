CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  auth_email text;
BEGIN
  -- Identity is never editable.
  NEW.id := OLD.id;

  -- profiles.email mirrors the authentication email; it may never diverge.
  SELECT u.email INTO auth_email FROM auth.users u WHERE u.id = NEW.id;
  NEW.email := COALESCE(auth_email, OLD.email);

  IF auth.uid() IS NULL OR auth.uid() <> NEW.id THEN
    RETURN NEW;
  END IF;

  -- Self-service edits may never touch tenancy, authority or capacity.
  -- This holds regardless of the actor's administrative role: administrative
  -- authority over staff is exercised against OTHER employees through the
  -- authorized staff-management paths, never against one's own record.
  NEW.organization_id := OLD.organization_id;
  NEW.status := OLD.status;
  NEW.max_concurrent_chats := OLD.max_concurrent_chats;
  RETURN NEW;
END;
$function$;