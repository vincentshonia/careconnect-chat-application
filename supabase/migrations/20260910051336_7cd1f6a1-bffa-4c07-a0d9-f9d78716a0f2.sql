DROP POLICY IF EXISTS audit_insert ON public.audit_logs;

CREATE POLICY audit_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_org(organization_id) AND actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.stamp_audit_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.actor_id := _uid;
  SELECT p.full_name INTO NEW.actor_name FROM public.profiles p WHERE p.id = _uid;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_audit_actor ON public.audit_logs;
CREATE TRIGGER stamp_audit_actor
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_audit_actor();

CREATE OR REPLACE FUNCTION public.guard_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL OR current_user <> 'service_role' THEN
    RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_audit_immutable ON public.audit_logs;
CREATE TRIGGER guard_audit_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_immutable();