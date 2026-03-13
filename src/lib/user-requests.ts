import { supabase } from "@/integrations/supabase/client";

export type UserTransferRequest = {
  id: number;
  requester_user_id: number;
  requester_guest_id: string;
  requester_verified_count: number;
  requester_payment_number: string;
  requester_payment_method: string | null;
  target_guest_id: string;
  target_user_id: number | null;
  status: string;
  submitted_batch_id: string | null;
  created_at: string;
  submitted_at: string | null;
};

export type UserRequestSubmission = {
  id: string;
  target_guest_id: string;
  target_user_id: number | null;
  target_display_name: string | null;
  target_verified_count: number;
  submitted_to_admin_by: string;
  request_count: number;
  submitted_at: string;
  requests: UserTransferRequest[];
};

export async function createUserTransferRequest(payload: {
  requesterUserId: number;
  requesterGuestId: string;
  requesterVerifiedCount: number;
  requesterPaymentNumber: string;
  requesterPaymentMethod?: string;
  targetGuestId: string;
}) {
  const { error } = await supabase.from("user_transfer_requests").insert({
    requester_user_id: payload.requesterUserId,
    requester_guest_id: payload.requesterGuestId,
    requester_verified_count: payload.requesterVerifiedCount,
    requester_payment_number: payload.requesterPaymentNumber,
    requester_payment_method: payload.requesterPaymentMethod || null,
    target_guest_id: payload.targetGuestId,
  });

  if (error) throw error;
}

export async function getIncomingTransferRequests(targetGuestId: string): Promise<UserTransferRequest[]> {
  const { data, error } = await supabase
    .from("user_transfer_requests")
    .select("*")
    .eq("target_guest_id", targetGuestId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function submitIncomingTransferRequests(targetGuestId: string, submitterName: string, password: string): Promise<string> {
  const { data, error } = await supabase.rpc("submit_user_request_batch", {
    p_target_guest_id: targetGuestId,
    p_submitter_name: submitterName,
    p_password: password,
  });

  if (error) throw error;
  return data;
}

export async function getUserRequestSubmissions(): Promise<UserRequestSubmission[]> {
  const { data: submissions, error: submissionsError } = await supabase
    .from("user_request_submissions")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (submissionsError) throw submissionsError;
  if (!submissions || submissions.length === 0) return [];

  const batchIds = submissions.map((submission) => submission.id);

  const { data: requests, error: requestsError } = await supabase
    .from("user_transfer_requests")
    .select("*")
    .in("submitted_batch_id", batchIds)
    .order("created_at", { ascending: false });

  if (requestsError) throw requestsError;

  return submissions.map((submission) => ({
    ...submission,
    requests: (requests || []).filter((request) => request.submitted_batch_id === submission.id),
  }));
}
