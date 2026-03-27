
-- Conversations table
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1 integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  participant_2 integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_message text,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(participant_1, participant_2)
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to conversations" ON public.conversations
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Messages table
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content text,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'voice')),
  media_url text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to messages" ON public.messages
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_conversations_participant1 ON public.conversations(participant_1);
CREATE INDEX idx_conversations_participant2 ON public.conversations(participant_2);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Storage bucket for chat media
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true);

CREATE POLICY "Anyone can upload chat media" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Anyone can view chat media" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'chat-media');
