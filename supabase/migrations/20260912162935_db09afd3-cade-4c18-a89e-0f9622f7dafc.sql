ALTER TABLE public.websites ALTER COLUMN home_cta_title SET DEFAULT 'Speak to a live agent';
ALTER TABLE public.websites ALTER COLUMN home_cta_subtitle SET DEFAULT 'Talk with a member engagement specialist';
UPDATE public.websites SET home_cta_title = 'Speak to a live agent' WHERE home_cta_title = 'Send us a message';
UPDATE public.websites SET home_cta_subtitle = 'Talk with a member engagement specialist' WHERE home_cta_subtitle = 'CareConnect AI can help now, or leave a message';
ALTER TABLE public.intake_requests ADD COLUMN IF NOT EXISTS after_hours boolean NOT NULL DEFAULT false;