CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> NEW.id THEN
    RETURN NEW;
  END IF;

  IF public.has_perm(OLD.organization_id, 'staff.edit') THEN
    RETURN NEW;
  END IF;

  NEW.organization_id := OLD.organization_id;
  NEW.status := OLD.status;
  NEW.max_concurrent_chats := OLD.max_concurrent_chats;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_self_update ON public.profiles;
CREATE TRIGGER guard_profile_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();