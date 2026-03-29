import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

// Updates the user's online_at timestamp every 30 seconds
export function useOnlineHeartbeat() {
  const { user } = useAuth();

  const sendHeartbeat = useCallback(async () => {
    if (!user) return;
    await (supabase.from("users").update({ online_at: new Date().toISOString() } as any).eq("id", user.id) as any);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30000);
    return () => clearInterval(interval);
  }, [user, sendHeartbeat]);
}

// Check if user is online (active within last 2 minutes)
export function isUserOnline(onlineAt: string | null): boolean {
  if (!onlineAt) return false;
  return Date.now() - new Date(onlineAt).getTime() < 2 * 60 * 1000;
}

// Fetch online users (active within last 2 minutes)
export async function getOnlineUsers(excludeUserId?: number) {
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  let query = (supabase.from("users").select("id, guest_id, display_name, avatar_url, online_at, is_verified_badge") as any)
    .gt("online_at", twoMinAgo)
    .order("online_at", { ascending: false })
    .limit(20);
  
  if (excludeUserId) {
    query = query.neq("id", excludeUserId);
  }
  
  const { data } = await query;
  return data || [];
}
