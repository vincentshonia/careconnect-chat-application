-- Visitor satisfaction ratings
CREATE TABLE public.conversation_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  website_id uuid,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment text,
  source text NOT NULL DEFAULT 'visitor',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX conversation_ratings_conversation_uidx ON public.conversation_ratings(conversation_id);
CREATE INDEX conversation_ratings_org_idx ON public.conversation_ratings(organization_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_ratings TO authenticated;
GRANT ALL ON public.conversation_ratings TO service_role;
ALTER TABLE public.conversation_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read org ratings" ON public.conversation_ratings
  FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY "Staff manage org ratings" ON public.conversation_ratings
  FOR ALL TO authenticated
  USING (public.can_access_org(organization_id))
  WITH CHECK (public.can_access_org(organization_id));

-- Staff QA reviews of conversations
CREATE TABLE public.qa_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  reviewer_id uuid,
  reviewer_name text,
  agent_id uuid,
  accuracy_score integer NOT NULL CHECK (accuracy_score BETWEEN 1 AND 5),
  tone_score integer NOT NULL CHECK (tone_score BETWEEN 1 AND 5),
  compliance_score integer NOT NULL CHECK (compliance_score BETWEEN 1 AND 5),
  resolution_score integer NOT NULL CHECK (resolution_score BETWEEN 1 AND 5),
  overall_score numeric GENERATED ALWAYS AS (
    (accuracy_score + tone_score + compliance_score + resolution_score)::numeric / 4
  ) STORED,
  coaching_notes text,
  flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qa_reviews_org_idx ON public.qa_reviews(organization_id, created_at DESC);
CREATE INDEX qa_reviews_conversation_idx ON public.qa_reviews(conversation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_reviews TO authenticated;
GRANT ALL ON public.qa_reviews TO service_role;
ALTER TABLE public.qa_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read org qa reviews" ON public.qa_reviews
  FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY "Staff manage org qa reviews" ON public.qa_reviews
  FOR ALL TO authenticated
  USING (public.can_access_org(organization_id))
  WITH CHECK (public.can_access_org(organization_id));

CREATE TRIGGER qa_reviews_updated_at BEFORE UPDATE ON public.qa_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Staff notification feed
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  link text,
  record_type text,
  record_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Staff create org notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (public.can_access_org(organization_id));

-- Per-user notification preferences
CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY,
  organization_id uuid,
  inapp_escalations boolean NOT NULL DEFAULT true,
  inapp_new_intake boolean NOT NULL DEFAULT true,
  inapp_sla_breach boolean NOT NULL DEFAULT true,
  inapp_low_rating boolean NOT NULL DEFAULT true,
  email_escalations boolean NOT NULL DEFAULT true,
  email_new_intake boolean NOT NULL DEFAULT false,
  email_sla_breach boolean NOT NULL DEFAULT false,
  email_low_rating boolean NOT NULL DEFAULT false,
  sla_first_response_minutes integer NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification preferences" ON public.notification_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;