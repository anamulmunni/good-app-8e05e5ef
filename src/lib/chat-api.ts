import { supabase } from "@/integrations/supabase/client";

export type Conversation = {
  id: string;
  participant_1: number;
  participant_2: number;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: number;
  content: string | null;
  message_type: string;
  media_url: string | null;
  is_read: boolean;
  created_at: string | null;
};

// Get or create a conversation between two users
export async function getOrCreateConversation(userId1: number, userId2: number): Promise<Conversation> {
  const p1 = Math.min(userId1, userId2);
  const p2 = Math.max(userId1, userId2);

  // Check existing
  const { data: existing } = await (supabase
    .from("conversations")
    .select("*") as any)
    .or(`and(participant_1.eq.${p1},participant_2.eq.${p2}),and(participant_1.eq.${p2},participant_2.eq.${p1})`)
    .limit(1)
    .single();

  if (existing) return existing;

  // Create new
  const { data, error } = await (supabase
    .from("conversations")
    .insert({ participant_1: p1, participant_2: p2 } as any)
    .select()
    .single() as any);

  if (error) throw error;
  return data;
}

// Get all conversations for a user
export async function getUserConversations(userId: number): Promise<Conversation[]> {
  const { data } = await (supabase
    .from("conversations")
    .select("*") as any)
    .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
    .order("last_message_at", { ascending: false });

  return data || [];
}

// Get messages for a conversation
export async function getMessages(conversationId: string, limit = 50): Promise<Message[]> {
  const { data } = await (supabase
    .from("messages")
    .select("*") as any)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  return data || [];
}

// Send a text message
export async function sendMessage(conversationId: string, senderId: number, content: string, messageType = "text", mediaUrl?: string): Promise<Message> {
  const { data, error } = await (supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content: content || null,
      message_type: messageType,
      media_url: mediaUrl || null,
    } as any)
    .select()
    .single() as any);

  if (error) throw error;

  void (supabase
    .from("conversations")
    .update({
      last_message: messageType === "text" ? content : (messageType === "image" ? "📷 ছবি" : "🎤 ভয়েস"),
      last_message_at: new Date().toISOString(),
    } as any)
    .eq("id", conversationId) as any);

  return data;
}

// Upload chat media (image or voice)
export async function uploadChatMedia(file: File | Blob, fileName: string): Promise<string> {
  const path = `${Date.now()}_${fileName}`;
  const { error } = await supabase.storage.from("chat-media").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
  return data.publicUrl;
}

// Search users by guest_id or display_name
export async function searchUsers(query: string) {
  const { data } = await (supabase
    .from("users")
    .select("id, guest_id, display_name, avatar_url") as any)
    .or(`guest_id.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(10);

  return data || [];
}

// Mark messages as read
export async function markMessagesRead(conversationId: string, readerId: number) {
  await (supabase
    .from("messages")
    .update({ is_read: true } as any)
    .eq("conversation_id", conversationId)
    .neq("sender_id", readerId) as any);
}

// Get unread count for a user
export async function getUnreadCount(userId: number): Promise<number> {
  // Get conversations
  const convos = await getUserConversations(userId);
  if (convos.length === 0) return 0;

  const convoIds = convos.map(c => c.id);
  const { count } = await (supabase
    .from("messages")
    .select("id", { count: "exact", head: true }) as any)
    .in("conversation_id", convoIds)
    .eq("is_read", false)
    .neq("sender_id", userId);

  return count || 0;
}
