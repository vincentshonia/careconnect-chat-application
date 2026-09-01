ALTER TABLE public.websites
  ADD COLUMN IF NOT EXISTS home_greeting text NOT NULL DEFAULT 'Hi there.',
  ADD COLUMN IF NOT EXISTS home_headline text NOT NULL DEFAULT 'How can we help?',
  ADD COLUMN IF NOT EXISTS home_subtitle text NOT NULL DEFAULT 'CareConnect AI is available anytime.',
  ADD COLUMN IF NOT EXISTS home_cta_title text NOT NULL DEFAULT 'Send us a message',
  ADD COLUMN IF NOT EXISTS home_cta_subtitle text NOT NULL DEFAULT 'CareConnect AI can help now, or leave a message',
  ADD COLUMN IF NOT EXISTS help_title text NOT NULL DEFAULT 'Search for help',
  ADD COLUMN IF NOT EXISTS privacy_footer_text text NOT NULL DEFAULT 'Your privacy matters to us.',
  ADD COLUMN IF NOT EXISTS show_home_tab boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_help_tab boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_services_tab boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_requests_tab boolean NOT NULL DEFAULT true;