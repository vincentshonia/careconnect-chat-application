DO $$
DECLARE
  c_ids uuid[];
  contact uuid;
BEGIN
  SELECT id INTO contact FROM public.contacts WHERE full_name = 'CareConnect E2E Test' AND email = 'e2e-test@mypacifichealth.com' LIMIT 1;
  IF contact IS NULL THEN RETURN; END IF;

  SELECT array_agg(id) INTO c_ids FROM public.conversations WHERE contact_id = contact;

  DELETE FROM public.intake_events WHERE intake_id IN (SELECT id FROM public.intake_requests WHERE contact_id = contact);
  DELETE FROM public.intake_requests WHERE contact_id = contact;

  IF c_ids IS NOT NULL THEN
    DELETE FROM public.notifications WHERE record_id = ANY(c_ids);
    DELETE FROM public.ai_responses WHERE conversation_id = ANY(c_ids);
    DELETE FROM public.conversation_ratings WHERE conversation_id = ANY(c_ids);
    DELETE FROM public.internal_notes WHERE conversation_id = ANY(c_ids);
    DELETE FROM public.conversation_events WHERE conversation_id = ANY(c_ids);
    DELETE FROM public.messages WHERE conversation_id = ANY(c_ids);
    DELETE FROM public.conversations WHERE id = ANY(c_ids);
  END IF;

  DELETE FROM public.contacts WHERE id = contact;
END $$;