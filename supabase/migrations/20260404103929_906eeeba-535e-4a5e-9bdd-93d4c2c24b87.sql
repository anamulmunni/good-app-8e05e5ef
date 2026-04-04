ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS request_password text,
  ADD COLUMN IF NOT EXISTS locked_target_guest_id text;