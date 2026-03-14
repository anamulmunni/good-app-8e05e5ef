
ALTER TABLE public.user_request_submissions 
  ADD COLUMN IF NOT EXISTS submitter_payment_number text,
  ADD COLUMN IF NOT EXISTS submitter_payment_method text;

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
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch_id UUID;
  v_target_user public.users%ROWTYPE;
  v_request_count INTEGER;
BEGIN
  IF COALESCE(p_password, '') <> 'Anamul-341321' THEN
    RAISE EXCEPTION 'Invalid password';
  END IF;

  SELECT *
  INTO v_target_user
  FROM public.users
  WHERE guest_id = p_target_guest_id
  LIMIT 1;

  IF v_target_user.id IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
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
    p_submitter_payment_number,
    p_submitter_payment_method
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
  WHERE submitted_batch_id = v_batch_id;

  RETURN v_batch_id;
END;
$function$;
