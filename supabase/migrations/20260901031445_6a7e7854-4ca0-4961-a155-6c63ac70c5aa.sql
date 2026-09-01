CREATE OR REPLACE FUNCTION public.busy_conversation_statuses()
RETURNS conversation_status[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY['assigned','active','pending_visitor','pending_internal','escalated']::conversation_status[]
$$;

CREATE OR REPLACE FUNCTION public.claimable_conversation_statuses()
RETURNS conversation_status[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY['new','waiting','escalated','follow_up']::conversation_status[]
$$;