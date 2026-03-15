import { supabase } from "@/integrations/supabase/client";

const ACTIVE_REQUEST_STATUSES = ["pending", "submitted"] as const;

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
  submitter_payment_number: string | null;
  submitter_payment_method: string | null;
  request_count: number;
  submitted_at: string;
  requests: UserTransferRequest[];
};

export async function checkUserHasPendingRequest(requesterGuestId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_transfer_requests")
    .select("id")
    .eq("requester_guest_id", requesterGuestId)
    .in("status", [...ACTIVE_REQUEST_STATUSES])
    .limit(1);

  if (error) throw error;
  return !!(data && data.length > 0);
}

export async function createUserTransferRequest(payload: {
  requesterUserId: number;
  requesterGuestId: string;
  requesterVerifiedCount: number;
  requesterPaymentNumber: string;
  requesterPaymentMethod?: string;
  targetGuestId: string;
}) {
  const hasPending = await checkUserHasPendingRequest(payload.requesterGuestId);
  if (hasPending) {
    throw new Error("আপনার আগের request এখনও active আছে। Admin reset/cancel না করা পর্যন্ত নতুন request দিতে পারবেন না।");
  }

  const { error } = await supabase.from("user_transfer_requests").insert({
    requester_user_id: payload.requesterUserId,
    requester_guest_id: payload.requesterGuestId,
    requester_verified_count: payload.requesterVerifiedCount,
    requester_payment_number: payload.requesterPaymentNumber,
    requester_payment_method: payload.requesterPaymentMethod || null,
    target_guest_id: payload.targetGuestId,
  });

  if (error) {
    if ((error as any).code === "23505") {
      throw new Error("আপনার আগের request এখনও active আছে। Admin reset/cancel না করা পর্যন্ত নতুন request দিতে পারবেন না।");
    }
    throw error;
  }
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

export async function submitIncomingTransferRequests(
  targetGuestId: string,
  submitterName: string,
  password: string,
  submitterPaymentNumber?: string,
  submitterPaymentMethod?: string
): Promise<string> {
  const { data, error } = await supabase.rpc("submit_user_request_batch", {
    p_target_guest_id: targetGuestId,
    p_submitter_name: submitterName,
    p_password: password,
    p_submitter_payment_number: submitterPaymentNumber || null,
    p_submitter_payment_method: submitterPaymentMethod || null,
  } as any);

  if (error) throw error;
  return data;
}

export async function getUserRequestSubmissions(activeOnly = false): Promise<UserRequestSubmission[]> {
  const { data: submissions, error: submissionsError } = await supabase
    .from("user_request_submissions")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (submissionsError) throw submissionsError;
  if (!submissions || submissions.length === 0) return [];

  const batchIds = submissions.map((submission) => submission.id);

  let requestsQuery = supabase
    .from("user_transfer_requests")
    .select("*")
    .in("submitted_batch_id", batchIds)
    .order("created_at", { ascending: false });

  if (activeOnly) {
    requestsQuery = requestsQuery.eq("status", "submitted");
  }

  const { data: requests, error: requestsError } = await requestsQuery;
  if (requestsError) throw requestsError;

  const mapped = submissions.map((submission) => ({
    ...submission,
    submitter_payment_number: (submission as any).submitter_payment_number || null,
    submitter_payment_method: (submission as any).submitter_payment_method || null,
    requests: (requests || []).filter((request) => request.submitted_batch_id === submission.id),
  }));

  return activeOnly ? mapped.filter((submission) => submission.requests.length > 0) : mapped;
}

export async function getActiveRequestsByRequester(requesterGuestId: string): Promise<UserTransferRequest[]> {
  const { data, error } = await supabase
    .from("user_transfer_requests")
    .select("*")
    .eq("requester_guest_id", requesterGuestId)
    .in("status", [...ACTIVE_REQUEST_STATUSES])
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function adminCancelRequestsByRequester(requesterGuestId: string): Promise<number> {
  const { data, error } = await supabase.rpc("admin_cancel_requests_by_requester", {
    p_requester_guest_id: requesterGuestId,
  } as any);

  if (error) throw error;
  return Number(data || 0);
}

export async function adminResetTransferRequest(requestId: number): Promise<boolean> {
  const { data, error } = await supabase.rpc("admin_reset_transfer_request", {
    p_request_id: requestId,
    p_admin_name: "Admin",
  } as any);

  if (error) throw error;
  return Boolean(data);
}

export async function adminResetTransferBatch(batchId: string): Promise<number> {
  const { data, error } = await supabase.rpc("admin_reset_transfer_batch", {
    p_batch_id: batchId,
    p_admin_name: "Admin",
  } as any);

  if (error) throw error;
  return Number(data || 0);
}

export async function adminDismissTransferRequest(requestId: number): Promise<boolean> {
  const { data, error } = await supabase.rpc("admin_dismiss_transfer_request", {
    p_request_id: requestId,
  } as any);

  if (error) throw error;
  return Boolean(data);
}

// Get all requests (pending + submitted + others) for a user (as requester) for history
export async function getUserRequestHistory(requesterGuestId: string): Promise<UserTransferRequest[]> {
  const { data, error } = await supabase
    .from("user_transfer_requests")
    .select("*")
    .eq("requester_guest_id", requesterGuestId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

// Get submitted batches where user was the target (for their history)
export async function getUserSubmittedBatches(targetGuestId: string): Promise<UserRequestSubmission[]> {
  const { data: submissions, error: submissionsError } = await supabase
    .from("user_request_submissions")
    .select("*")
    .eq("target_guest_id", targetGuestId)
    .order("submitted_at", { ascending: false });

  if (submissionsError) throw submissionsError;
  if (!submissions || submissions.length === 0) return [];

  const batchIds = submissions.map((s) => s.id);

  const { data: requests, error: requestsError } = await supabase
    .from("user_transfer_requests")
    .select("*")
    .in("submitted_batch_id", batchIds)
    .order("created_at", { ascending: false });

  if (requestsError) throw requestsError;

  return submissions.map((submission) => ({
    ...submission,
    submitter_payment_number: (submission as any).submitter_payment_number || null,
    submitter_payment_method: (submission as any).submitter_payment_method || null,
    requests: (requests || []).filter((r) => r.submitted_batch_id === submission.id),
  }));
}
