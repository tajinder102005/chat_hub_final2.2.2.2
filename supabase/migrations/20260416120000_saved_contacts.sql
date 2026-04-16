-- saved_contacts: lets users save other users by phone/email with optional nickname
CREATE TABLE IF NOT EXISTS public.saved_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, contact_user_id)
);

ALTER TABLE public.saved_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved contacts"
  ON public.saved_contacts FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own saved contacts"
  ON public.saved_contacts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own saved contacts"
  ON public.saved_contacts FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own saved contacts"
  ON public.saved_contacts FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);
