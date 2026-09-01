ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_in_widget_team boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.show_in_widget_team IS
  'Explicit opt-in: when true the staff member''s name and photo may be shown to anonymous website visitors in the chat widget. Default false so no photo is ever public by accident.';

CREATE INDEX IF NOT EXISTS profiles_widget_team_idx
  ON public.profiles (organization_id)
  WHERE show_in_widget_team AND avatar_url IS NOT NULL;