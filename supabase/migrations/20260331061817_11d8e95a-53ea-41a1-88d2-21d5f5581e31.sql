
-- 1. Add submitter_rate to user_request_submissions
ALTER TABLE public.user_request_submissions ADD COLUMN IF NOT EXISTS submitter_rate integer NOT NULL DEFAULT 0;

-- 2. Admin cancel batch function (returns requests back to pending for submitter)
CREATE OR REPLACE FUNCTION public.admin_cancel_transfer_batch(p_batch_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
  v_req record;
BEGIN
  FOR v_req IN
    SELECT requester_guest_id, target_guest_id
    FROM public.user_transfer_requests
    WHERE submitted_batch_id = p_batch_id AND status = 'submitted'
  LOOP
    DELETE FROM public.submitted_numbers
    WHERE phone_number = v_req.requester_guest_id
      AND submitted_by = CONCAT('Request→', v_req.target_guest_id);
  END LOOP;

  UPDATE public.user_transfer_requests
  SET status = 'pending', submitted_batch_id = NULL, submitted_at = NULL, target_user_id = NULL
  WHERE submitted_batch_id = p_batch_id AND status = 'submitted';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.user_request_submissions WHERE id = p_batch_id;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- 3. Cancel incoming request by target user (submitter can cancel individual requests)
CREATE OR REPLACE FUNCTION public.cancel_incoming_request(p_request_id bigint, p_target_guest_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.user_transfer_requests
  SET status = 'cancelled'
  WHERE id = p_request_id
    AND target_guest_id = p_target_guest_id
    AND status = 'pending';

  RETURN FOUND;
END;
$$;

-- 4. Update submit_user_request_batch to enforce minimum request target and store rate
CREATE OR REPLACE FUNCTION public.submit_user_request_batch(
  p_target_guest_id text,
  p_submitter_name text,
  p_password text,
  p_submitter_payment_number text DEFAULT NULL::text,
  p_submitter_payment_method text DEFAULT NULL::text,
  p_submitter_rate integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_batch_id uuid;
  v_target_user public.users%ROWTYPE;
  v_request_count integer;
  v_stored_password text;
  v_min_target_str text;
  v_min_target integer;
  v_pending_count integer;
BEGIN
  SELECT value INTO v_stored_password FROM public.settings WHERE key = 'requestSubmitPassword' LIMIT 1;
  IF v_stored_password IS NULL THEN v_stored_password := 'Anamul-341321'; END IF;
  IF COALESCE(p_password, '') <> v_stored_password THEN
    RAISE EXCEPTION 'Invalid password';
  END IF;

  -- Check minimum request target
  SELECT value INTO v_min_target_str FROM public.settings WHERE key = 'minRequestTarget' LIMIT 1;
  v_min_target := COALESCE(NULLIF(v_min_target_str, '')::integer, 0);

  IF v_min_target > 0 THEN
    SELECT COUNT(*) INTO v_pending_count FROM public.user_transfer_requests
    WHERE target_guest_id = p_target_guest_id AND status = 'pending';

    IF v_pending_count < v_min_target THEN
      RAISE EXCEPTION 'সর্বনিম্ন % টি request দরকার, আপনার আছে % টি', v_min_target, v_pending_count;
    END IF;
  END IF;

  SELECT * INTO v_target_user FROM public.users WHERE guest_id = p_target_guest_id LIMIT 1;
  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  INSERT INTO public.user_request_submissions (target_user_id, target_guest_id, target_display_name, target_verified_count, submitted_to_admin_by, request_count, submitter_payment_number, submitter_payment_method, submitter_rate)
  VALUES (v_target_user.id, p_target_guest_id, v_target_user.display_name, COALESCE(v_target_user.key_count, 0), COALESCE(NULLIF(p_submitter_name, ''), 'Unknown'), 0, NULLIF(p_submitter_payment_number, ''), NULLIF(p_submitter_payment_method, ''), COALESCE(p_submitter_rate, 0))
  RETURNING id INTO v_batch_id;

  UPDATE public.user_transfer_requests SET status = 'submitted', submitted_batch_id = v_batch_id, submitted_at = now(), target_user_id = v_target_user.id
  WHERE target_guest_id = p_target_guest_id AND status = 'pending';
  GET DIAGNOSTICS v_request_count = ROW_COUNT;

  IF v_request_count = 0 THEN
    DELETE FROM public.user_request_submissions WHERE id = v_batch_id;
    RAISE EXCEPTION 'No pending requests found';
  END IF;

  UPDATE public.user_request_submissions SET request_count = v_request_count WHERE id = v_batch_id;

  INSERT INTO public.submitted_numbers (phone_number, verified_count, submitted_by, payment_number, payment_method)
  SELECT requester_guest_id, requester_verified_count, CONCAT('Request→', p_target_guest_id), NULL, NULL
  FROM public.user_transfer_requests WHERE submitted_batch_id = v_batch_id AND status = 'submitted';

  RETURN v_batch_id;
END;
$$;
