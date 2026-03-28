DROP POLICY IF EXISTS "Allow all access to message_hidden" ON public.message_hidden;

CREATE POLICY "Users can view hidden markers"
ON public.message_hidden
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = message_hidden.user_id
      AND u.auth_id = auth.uid()
  )
);

CREATE POLICY "Users can hide messages for themselves"
ON public.message_hidden
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.messages m ON m.id = message_hidden.message_id
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE u.id = message_hidden.user_id
      AND u.auth_id = auth.uid()
      AND (c.participant_1 = u.id OR c.participant_2 = u.id)
  )
);

CREATE POLICY "Users can unhide their own markers"
ON public.message_hidden
FOR DELETE
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = message_hidden.user_id
      AND u.auth_id = auth.uid()
  )
);