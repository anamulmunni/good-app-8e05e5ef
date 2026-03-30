
CREATE TABLE public.tiktok_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url text NOT NULL,
  video_id text NOT NULL,
  caption text,
  added_by text NOT NULL DEFAULT 'admin',
  category text NOT NULL DEFAULT 'mixed',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tiktok_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read tiktok_videos" ON public.tiktok_videos
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admin insert tiktok_videos" ON public.tiktok_videos
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Admin update tiktok_videos" ON public.tiktok_videos
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin delete tiktok_videos" ON public.tiktok_videos
  FOR DELETE TO anon, authenticated USING (true);
