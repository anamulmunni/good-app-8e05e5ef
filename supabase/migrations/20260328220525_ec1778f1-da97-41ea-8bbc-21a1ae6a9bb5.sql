CREATE TABLE IF NOT EXISTS public.message_hidden (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_hidden_user_id ON public.message_hidden(user_id);
CREATE INDEX IF NOT EXISTS idx_message_hidden_message_id ON public.message_hidden(message_id);

ALTER TABLE public.message_hidden ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to message_hidden" ON public.message_hidden;
CREATE POLICY "Allow all access to message_hidden"
ON public.message_hidden
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);