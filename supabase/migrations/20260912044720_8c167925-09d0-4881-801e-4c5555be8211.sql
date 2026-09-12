CREATE OR REPLACE FUNCTION public.guard_conversation_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.lifecycle_write', true) = 'on'
     OR COALESCE(auth.role(), current_user) IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.claimed_at IS DISTINCT FROM OLD.claimed_at
     OR NEW.requested_agent_at IS DISTINCT FROM OLD.requested_agent_at
     OR NEW.first_response_at IS DISTINCT FROM OLD.first_response_at
     OR NEW.first_agent_response_at IS DISTINCT FROM OLD.first_agent_response_at
     OR NEW.first_human_requested_at IS DISTINCT FROM OLD.first_human_requested_at
     OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
     OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
     OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
     OR NEW.closed_by IS DISTINCT FROM OLD.closed_by
     OR NEW.reopened_at IS DISTINCT FROM OLD.reopened_at
     OR NEW.reopened_count IS DISTINCT FROM OLD.reopened_count
     OR NEW.transfer_count IS DISTINCT FROM OLD.transfer_count
     OR NEW.escalation_requested IS DISTINCT FROM OLD.escalation_requested THEN
    RAISE EXCEPTION 'Conversation status and ownership can only be changed through the lifecycle workflow.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_on_assignee_removed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.assigned_to IS NOT NULL
     AND NEW.assigned_to IS NULL
     AND NEW.status = OLD.status
     AND OLD.status IN ('active', 'assigned') THEN
    NEW.status := 'waiting';
    NEW.escalation_requested := true;
    NEW.requested_agent_at := COALESCE(NEW.requested_agent_at, now());
    NEW.updated_at := now();

    INSERT INTO public.conversation_events (
      conversation_id, organization_id, actor_id, event_type, detail,
      previous_value, new_value
    ) VALUES (
      NEW.id, NEW.organization_id, NULL, 'released', 'assignee removed',
      OLD.status::text, 'waiting'
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zz_release_on_assignee_removed ON public.conversations;
CREATE TRIGGER zz_release_on_assignee_removed
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.release_on_assignee_removed();