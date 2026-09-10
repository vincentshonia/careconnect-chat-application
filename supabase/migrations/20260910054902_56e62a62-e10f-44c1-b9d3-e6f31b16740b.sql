ALTER TYPE public.conversation_status ADD VALUE IF NOT EXISTS 'abandoned';

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS reopened_at timestamptz;