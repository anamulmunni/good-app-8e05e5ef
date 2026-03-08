
-- Users table (guest login based, no auth.users dependency)
CREATE TABLE public.users (
  id SERIAL PRIMARY KEY,
  guest_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  key_count INTEGER NOT NULL DEFAULT 0,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  payment_status TEXT NOT NULL DEFAULT 'none',
  payment_scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Settings table
CREATE TABLE public.settings (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL
);

-- Verification pool table
CREATE TABLE public.verification_pool (
  id SERIAL PRIMARY KEY,
  private_key TEXT NOT NULL,
  verify_url TEXT NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT false,
  added_by TEXT NOT NULL DEFAULT 'Unknown',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Submitted numbers table
CREATE TABLE public.submitted_numbers (
  id SERIAL PRIMARY KEY,
  phone_number TEXT NOT NULL,
  verified_count INTEGER NOT NULL DEFAULT 0,
  submitted_by TEXT NOT NULL DEFAULT 'Unknown',
  payment_number TEXT,
  payment_method TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- Reset history table
CREATE TABLE public.reset_history (
  id SERIAL PRIMARY KEY,
  phone_number TEXT NOT NULL,
  verified_count INTEGER NOT NULL DEFAULT 0,
  submitted_by TEXT NOT NULL DEFAULT 'Unknown',
  payment_number TEXT,
  payment_method TEXT,
  reset_at TIMESTAMPTZ DEFAULT now()
);

-- Transactions table
CREATE TABLE public.transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submitted_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reset_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Since this app uses guest login (no Supabase auth), we use service role in edge functions
-- and permissive anon policies for read access
CREATE POLICY "Allow all access to users" ON public.users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to settings" ON public.settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to verification_pool" ON public.verification_pool FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to submitted_numbers" ON public.submitted_numbers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to reset_history" ON public.reset_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to transactions" ON public.transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Insert default settings
INSERT INTO public.settings (key, value) VALUES ('rewardRate', '40');
INSERT INTO public.settings (key, value) VALUES ('buyStatus', 'on');
INSERT INTO public.settings (key, value) VALUES ('bonusStatus', 'off');
INSERT INTO public.settings (key, value) VALUES ('bonusTarget', '10');
INSERT INTO public.settings (key, value) VALUES ('customNotice', '');
