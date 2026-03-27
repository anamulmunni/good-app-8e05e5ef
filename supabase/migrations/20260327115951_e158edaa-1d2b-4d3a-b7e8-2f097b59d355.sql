-- Add unique constraint on guest_id to prevent duplicate phone accounts
ALTER TABLE public.users ADD CONSTRAINT users_guest_id_unique UNIQUE (guest_id);