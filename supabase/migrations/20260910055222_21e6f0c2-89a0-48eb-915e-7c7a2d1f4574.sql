DO $mig$
DECLARE
  d text; original text; n text; i int;
  pairs text[][] := ARRAY[
    ARRAY[
      'status::text IN (''new'',''waiting'',''escalated'',''follow_up'') AND assigned_to IS NULL',
      'escalation_requested AND assigned_to IS NULL AND status::text IN (''waiting'',''escalated'',''follow_up'')'],
    ARRAY[
      'assigned_to IS NULL' || chr(10) || '        AND status::text IN (''new'',''waiting'',''escalated'',''follow_up'')',
      'assigned_to IS NULL AND escalation_requested' || chr(10) || '        AND status::text IN (''waiting'',''escalated'',''follow_up'')']
  ];
BEGIN
  FOR n IN
    SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname='public' AND p.proname IN ('report_overview','report_sla')
  LOOP
    d := pg_get_functiondef(n::regprocedure);
    original := d;
    FOR i IN 1 .. array_length(pairs,1) LOOP
      d := replace(d, pairs[i][1], pairs[i][2]);
    END LOOP;
    IF d <> original THEN EXECUTE d; END IF;
  END LOOP;
END
$mig$;