
CREATE OR REPLACE FUNCTION public.admin_reset_transfer_batch(p_batch_id uuid, p_admin_name text DEFAULT 'Admin'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_payment_number text;
  v_payment_method text;
BEGIN
  -- Get submitter payment info from the batch
  SELECT submitter_payment_number, submitter_payment_method
  INTO v_payment_number, v_payment_method
  FROM public.user_request_submissions
  WHERE id = p_batch_id
  LIMIT 1;

  INSERT INTO public.reset_history (
    phone_number,
    verified_count,
    submitted_by,
    payment_number,
    payment_method
  )
  SELECT
    r.requester_guest_id,
    COALESCE(u.key_count, r.requester_verified_count, 0),
    COALESCE(NULLIF(p_admin_name, ''), 'Admin'),
    v_payment_number,
    v_payment_method
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
$function$;
