
-- Stories table
CREATE TABLE public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to stories" ON public.stories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Post reactions table (replaces simple likes with emoji reactions)
CREATE TABLE public.post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL DEFAULT 'like',
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to post_reactions" ON public.post_reactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Call signals table for WebRTC signaling
CREATE TABLE public.call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id integer NOT NULL REFERENCES public.users(id),
  receiver_id integer NOT NULL REFERENCES public.users(id),
  signal_type text NOT NULL, -- 'offer', 'answer', 'ice-candidate', 'call-request', 'call-accepted', 'call-rejected', 'call-ended'
  signal_data jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to call_signals" ON public.call_signals FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;

-- Create storage bucket for stories
INSERT INTO storage.buckets (id, name, public) VALUES ('stories', 'stories', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public read stories" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'stories');
CREATE POLICY "Allow upload stories" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'stories');
