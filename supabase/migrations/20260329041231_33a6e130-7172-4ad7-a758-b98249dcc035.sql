-- Add verified badge flag to users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_verified_badge boolean NOT NULL DEFAULT false;

-- Channel subscriptions (YouTube-style subscribe)
CREATE TABLE IF NOT EXISTS public.channel_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_user_id integer NOT NULL,
  channel_user_id integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT channel_subscriptions_unique UNIQUE (subscriber_user_id, channel_user_id),
  CONSTRAINT channel_subscriptions_no_self CHECK (subscriber_user_id <> channel_user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_subscriptions_channel_user_id
  ON public.channel_subscriptions (channel_user_id);

CREATE INDEX IF NOT EXISTS idx_channel_subscriptions_subscriber_user_id
  ON public.channel_subscriptions (subscriber_user_id);

ALTER TABLE public.channel_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read channel subscriptions" ON public.channel_subscriptions;
CREATE POLICY "Public read channel subscriptions"
ON public.channel_subscriptions
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated insert own subscription" ON public.channel_subscriptions;
CREATE POLICY "Authenticated insert own subscription"
ON public.channel_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  subscriber_user_id <> channel_user_id
  AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = channel_subscriptions.subscriber_user_id
      AND u.auth_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authenticated delete own subscription" ON public.channel_subscriptions;
CREATE POLICY "Authenticated delete own subscription"
ON public.channel_subscriptions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = channel_subscriptions.subscriber_user_id
      AND u.auth_id = auth.uid()
  )
);