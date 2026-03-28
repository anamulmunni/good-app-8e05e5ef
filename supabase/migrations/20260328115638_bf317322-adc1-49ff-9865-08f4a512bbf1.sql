
CREATE TABLE public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id integer NOT NULL,
  receiver_id integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(sender_id, receiver_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to friend_requests"
ON public.friend_requests
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);
