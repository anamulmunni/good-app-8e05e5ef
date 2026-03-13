-- Tighten policies added for request feature
DROP POLICY IF EXISTS "Allow all access to user_transfer_requests" ON public.user_transfer_requests;
DROP POLICY IF EXISTS "Allow all access to user_request_submissions" ON public.user_request_submissions;

CREATE POLICY "Public read user_transfer_requests"
  ON public.user_transfer_requests
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated create own request"
  ON public.user_transfer_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.auth_id = auth.uid()
        AND u.id = requester_user_id
        AND u.guest_id = requester_guest_id
    )
  );

CREATE POLICY "Public read user_request_submissions"
  ON public.user_request_submissions
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.submit_user_request_batch(
  p_target_guest_id TEXT,
  p_submitter_name TEXT,
  p_password TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  v_target_user public.users%ROWTYPE;
  v_request_count INTEGER;
BEGIN
  IF COALESCE(p_password, '') <> 'Anamul-984516' THEN
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
    request_count
  )
  VALUES (
    v_target_user.id,
    p_target_guest_id,
    v_target_user.display_name,
    COALESCE(v_target_user.key_count, 0),
    COALESCE(NULLIF(p_submitter_name, ''), 'Unknown'),
    0
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
    requester_payment_number,
    requester_payment_method
  FROM public.user_transfer_requests
  WHERE submitted_batch_id = v_batch_id;

  RETURN v_batch_id;
END;
$$;