
CREATE OR REPLACE FUNCTION public.admin_reset_transfer_request(p_request_id bigint, p_admin_name text DEFAULT 'Admin'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.user_transfer_requests%ROWTYPE;
  v_current_key_count integer;
  v_payment_number text;
  v_payment_method text;
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

  -- Get submitter payment info from the batch (if submitted)
  IF v_req.submitted_batch_id IS NOT NULL THEN
    SELECT submitter_payment_number, submitter_payment_method
    INTO v_payment_number, v_payment_method
    FROM public.user_request_submissions
    WHERE id = v_req.submitted_batch_id
    LIMIT 1;
  END IF;

  SELECT key_count
  INTO v_current_key_count
  FROM public.users
  WHERE guest_id = v_req.requester_guest_id
  LIMIT 1;

  INSERT INTO public.reset_history (
    phone_number,
    verified_count,
    submitted_by,
    payment_number,
    payment_method
  ) VALUES (
    v_req.requester_guest_id,
    COALESCE(v_current_key_count, v_req.requester_verified_count, 0),
    COALESCE(NULLIF(p_admin_name, ''), 'Admin'),
    v_payment_number,
    v_payment_method
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
$function$;
