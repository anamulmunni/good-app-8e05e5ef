-- Story reactions table (emoji reactions on stories)
CREATE TABLE IF NOT EXISTS public.story_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL DEFAULT 'love',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(story_id, user_id, reaction_type)
);

ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert story reactions" ON public.story_reactions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can read story reactions" ON public.story_reactions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users can delete own reactions" ON public.story_reactions FOR DELETE TO anon, authenticated USING (true);