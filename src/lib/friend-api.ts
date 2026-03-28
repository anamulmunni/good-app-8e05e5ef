import { supabase } from "@/integrations/supabase/client";

export type FriendRequest = {
  id: string;
  sender_id: number;
  receiver_id: number;
  status: string;
  created_at: string | null;
  sender?: { id: number; display_name: string | null; avatar_url: string | null; guest_id: string };
  receiver?: { id: number; display_name: string | null; avatar_url: string | null; guest_id: string };
};

// Send friend request
export async function sendFriendRequest(senderId: number, receiverId: number): Promise<void> {
  const { error } = await (supabase.from("friend_requests").insert({
    sender_id: senderId, receiver_id: receiverId, status: "pending"
  } as any).select().single() as any);
  if (error) throw error;
}

// Accept friend request
export async function acceptFriendRequest(requestId: string): Promise<void> {
  const { error } = await (supabase.from("friend_requests").update({ status: "accepted" } as any).eq("id", requestId) as any);
  if (error) throw error;
}

// Reject/cancel friend request
export async function rejectFriendRequest(requestId: string): Promise<void> {
  const { error } = await (supabase.from("friend_requests").delete() as any).eq("id", requestId);
  if (error) throw error;
}

// Get pending requests received by user
export async function getReceivedRequests(userId: number): Promise<FriendRequest[]> {
  const { data: requests } = await (supabase.from("friend_requests").select("*") as any)
    .eq("receiver_id", userId).eq("status", "pending").order("created_at", { ascending: false });
  if (!requests || requests.length === 0) return [];

  const senderIds = requests.map((r: any) => r.sender_id);
  const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id") as any).in("id", senderIds);
  const userMap: Record<number, any> = {};
  (users || []).forEach((u: any) => { userMap[u.id] = u; });

  return requests.map((r: any) => ({ ...r, sender: userMap[r.sender_id] || null }));
}

// Get friend request count
export async function getFriendRequestCount(userId: number): Promise<number> {
  const { count } = await (supabase.from("friend_requests").select("id", { count: "exact", head: true }) as any)
    .eq("receiver_id", userId).eq("status", "pending");
  return count || 0;
}

// Get all friends (accepted requests where user is sender or receiver)
export async function getFriends(userId: number): Promise<number[]> {
  const { data } = await (supabase.from("friend_requests").select("sender_id, receiver_id") as any)
    .eq("status", "accepted")
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
  if (!data) return [];
  return data.map((r: any) => r.sender_id === userId ? r.receiver_id : r.sender_id);
}

// Check friendship status between two users
export async function getFriendshipStatus(userId: number, targetId: number): Promise<{ status: string | null; requestId: string | null; direction: string | null }> {
  const { data } = await (supabase.from("friend_requests").select("*") as any)
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${userId})`)
    .limit(1).single();
  if (!data) return { status: null, requestId: null, direction: null };
  return {
    status: data.status,
    requestId: data.id,
    direction: data.sender_id === userId ? "sent" : "received"
  };
}

// Get suggested people (users who are not friends and no pending requests)
export async function getSuggestedPeople(userId: number, limit = 6): Promise<any[]> {
  // Get existing friend request user IDs
  const { data: existingRequests } = await (supabase.from("friend_requests").select("sender_id, receiver_id") as any)
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

  const excludeIds = new Set<number>([userId]);
  (existingRequests || []).forEach((r: any) => {
    excludeIds.add(r.sender_id);
    excludeIds.add(r.receiver_id);
  });

  // Get random users not in exclude list
  const { data: allUsers } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id, cover_url") as any)
    .neq("id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!allUsers) return [];
  const filtered = allUsers.filter((u: any) => !excludeIds.has(u.id));
  // Shuffle and take limit
  const shuffled = filtered.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}
