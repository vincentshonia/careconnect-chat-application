REVOKE ALL ON FUNCTION public.stamp_audit_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_audit_immutable() FROM PUBLIC, anon, authenticated;