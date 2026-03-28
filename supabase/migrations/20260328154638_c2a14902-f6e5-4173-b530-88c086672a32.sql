
-- Add parent_comment_id for replies
ALTER TABLE public.post_comments ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.post_comments(id) ON DELETE CASCADE;

-- Comment likes table
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id integer NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to comment_likes" ON public.comment_likes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE UNIQUE INDEX IF NOT EXISTS comment_likes_unique ON public.comment_likes(comment_id, user_id);

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL,
  from_user_id integer,
  type text NOT NULL DEFAULT 'mention',
  reference_id text,
  content text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to notifications" ON public.notifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Track last seen reels timestamp per user
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_reels_seen_at timestamptz;
