-- Ensure only one active request per requester at a time
CREATE UNIQUE INDEX IF NOT EXISTS user_transfer_requests_one_active_request_idx
ON public.user_transfer_requests (requester_guest_id)
WHERE status IN ('pending', 'submitted');

-- Keep submission count in sync after request status changes
CREATE OR REPLACE FUNCTION public.sync_user_request_submission_count(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_batch_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.user_request_submissions s
  SET request_count = COALESCE((
    SELECT COUNT(*)::int
    FROM public.user_transfer_requests r
    WHERE r.submitted_batch_id = s.id
      AND r.status = 'submitted'
  ), 0)
  WHERE s.id = p_batch_id;
END;
$$;

-- Remove legacy overload to avoid wrong password/function path usage
DROP FUNCTION IF EXISTS public.submit_user_request_batch(text, text, text);

-- Secure batch submission: only target account owner can submit to admin
CREATE OR REPLACE FUNCTION public.submit_user_request_batch(
  p_target_guest_id text,
  p_submitter_name text,
  p_password text,
  p_submitter_payment_number text DEFAULT NULL,
  p_submitter_payment_method text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
  v_target_user public.users%ROWTYPE;
  v_request_count integer;
BEGIN
  IF COALESCE(p_password, '') <> 'Anamul-341321' THEN
    RAISE EXCEPTION 'Invalid password';
  END IF;

  SELECT *
  INTO v_target_user
  FROM public.users
  WHERE guest_id = p_target_guest_id
    AND auth_id = auth.uid()
  LIMIT 1;

  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized target submission';
  END IF;

  INSERT INTO public.user_request_submissions (
    target_user_id,
    target_guest_id,
    target_display_name,
    target_verified_count,
    submitted_to_admin_by,
    request_count,
    submitter_payment_number,
    submitter_payment_method
  )
  VALUES (
    v_target_user.id,
    p_target_guest_id,
    v_target_user.display_name,
    COALESCE(v_target_user.key_count, 0),
    COALESCE(NULLIF(p_submitter_name, ''), 'Unknown'),
    0,
    NULLIF(p_submitter_payment_number, ''),
    NULLIF(p_submitter_payment_method, '')
  )
  RETURNING id INTO v_batch_id;

  UPDATE public.user_transfer_requests
  SET
    status = 'submitted',
    submitted_batch_id = v_batch_id,
    submitted_at = now(),
    target_user_id = v_target_user.id
  WHERE target_guest_id = p_target_guest_id
    AND status = 'pending';

  GET DIAGNOSTICS v_request_count = ROW_COUNT;

  IF v_request_count = 0 THEN
    DELETE FROM public.user_request_submissions WHERE id = v_batch_id;
    RAISE EXCEPTION 'No pending requests found';
  END IF;

  UPDATE public.user_request_submissions
  SET request_count = v_request_count
  WHERE id = v_batch_id;

  INSERT INTO public.submitted_numbers (
    phone_number,
    verified_count,
    submitted_by,
    payment_number,
    payment_method
  )
  SELECT
    requester_guest_id,
    requester_verified_count,
    CONCAT('Request→', p_target_guest_id),
    NULL,
    NULL
  FROM public.user_transfer_requests
  WHERE submitted_batch_id = v_batch_id
    AND status = 'submitted';

  RETURN v_batch_id;
END;
$$;

-- Admin: reset single request sender and move out of active list
CREATE OR REPLACE FUNCTION public.admin_reset_transfer_request(
  p_request_id bigint,
  p_admin_name text DEFAULT 'Admin'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.user_transfer_requests%ROWTYPE;
  v_current_key_count integer;
BEGIN
  SELECT *
  INTO v_req
  FROM public.user_transfer_requests
  WHERE id = p_request_id
    AND status IN ('pending', 'submitted')
  LIMIT 1;

  IF v_req.id IS NULL THEN
    RETURN false;
  END IF;

  SELECT key_count
  INTO v_current_key_count
  FROM public.users
  WHERE guest_id = v_req.requester_guest_id
  LIMIT 1;

  INSERT INTO public.reset_history (
    phone_number,
    verified_count,
    submitted_by
  ) VALUES (
    v_req.requester_guest_id,
    COALESCE(v_current_key_count, v_req.requester_verified_count, 0),
    COALESCE(NULLIF(p_admin_name, ''), 'Admin')
  );

  UPDATE public.users
  SET key_count = 0
  WHERE guest_id = v_req.requester_guest_id;

  UPDATE public.user_transfer_requests
  SET status = 'reset'
  WHERE id = v_req.id;

  DELETE FROM public.submitted_numbers
  WHERE phone_number = v_req.requester_guest_id
    AND submitted_by = CONCAT('Request→', v_req.target_guest_id);

  PERFORM public.sync_user_request_submission_count(v_req.submitted_batch_id);

  RETURN true;
END;
$$;

-- Admin: reset all request senders from one submitted batch
CREATE OR REPLACE FUNCTION public.admin_reset_transfer_batch(
  p_batch_id uuid,
  p_admin_name text DEFAULT 'Admin'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.reset_history (
    phone_number,
    verified_count,
    submitted_by
  )
  SELECT
    r.requester_guest_id,
    COALESCE(u.key_count, r.requester_verified_count, 0),
    COALESCE(NULLIF(p_admin_name, ''), 'Admin')
  FROM public.user_transfer_requests r
  LEFT JOIN public.users u
    ON u.guest_id = r.requester_guest_id
  WHERE r.submitted_batch_id = p_batch_id
    AND r.status = 'submitted';

  UPDATE public.users u
  SET key_count = 0
  WHERE u.guest_id IN (
    SELECT r.requester_guest_id
    FROM public.user_transfer_requests r
    WHERE r.submitted_batch_id = p_batch_id
      AND r.status = 'submitted'
  );

  UPDATE public.user_transfer_requests
  SET status = 'reset'
  WHERE submitted_batch_id = p_batch_id
    AND status = 'submitted';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.submitted_numbers sn
  USING public.user_transfer_requests r
  WHERE r.submitted_batch_id = p_batch_id
    AND r.status = 'reset'
    AND sn.phone_number = r.requester_guest_id
    AND sn.submitted_by = CONCAT('Request→', r.target_guest_id);

  PERFORM public.sync_user_request_submission_count(p_batch_id);

  RETURN COALESCE(v_count, 0);
END;
$$;

-- Admin: remove one request from active submitted/pending list without reset
CREATE OR REPLACE FUNCTION public.admin_dismiss_transfer_request(p_request_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
  v_target_guest_id text;
  v_requester_guest_id text;
BEGIN
  UPDATE public.user_transfer_requests
  SET status = 'dismissed'
  WHERE id = p_request_id
    AND status IN ('pending', 'submitted')
  RETURNING submitted_batch_id, target_guest_id, requester_guest_id
  INTO v_batch_id, v_target_guest_id, v_requester_guest_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  DELETE FROM public.submitted_numbers
  WHERE phone_number = v_requester_guest_id
    AND submitted_by = CONCAT('Request→', v_target_guest_id);

  PERFORM public.sync_user_request_submission_count(v_batch_id);

  RETURN true;
END;
$$;

-- Admin: search by requester number and cancel all active requests
CREATE OR REPLACE FUNCTION public.admin_cancel_requests_by_requester(p_requester_guest_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    UPDATE public.user_transfer_requests
    SET status = 'cancelled'
    WHERE requester_guest_id = p_requester_guest_id
      AND status IN ('pending', 'submitted')
    RETURNING submitted_batch_id, target_guest_id, requester_guest_id
  LOOP
    v_count := v_count + 1;

    DELETE FROM public.submitted_numbers
    WHERE phone_number = v_row.requester_guest_id
      AND submitted_by = CONCAT('Request→', v_row.target_guest_id);

    PERFORM public.sync_user_request_submission_count(v_row.submitted_batch_id);
  END LOOP;

  RETURN v_count;
END;
$$;