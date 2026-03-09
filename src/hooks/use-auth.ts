import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User as AppUser } from "@/lib/api";

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const fetchOrCreateAppUser = useCallback(async (authUser: { id: string; email?: string; user_metadata?: Record<string, string> }) => {
    // Check if user exists by auth_id using raw filter
    const { data: existing } = await (supabase
      .from("users")
      .select("*") as any)
      .eq("auth_id", authUser.id)
      .single();

    if (existing) {
      setUser(existing);
      return existing;
    }

    // Create new user entry
    const meta = authUser.user_metadata || {};
    const displayName = meta.display_name || authUser.email?.split("@")[0] || "User";
    const phone = meta.phone || "";

    const { data: newUser, error } = await (supabase
      .from("users")
      .insert({
        auth_id: authUser.id,
        guest_id: phone || authUser.email || authUser.id,
        display_name: displayName,
        email: authUser.email || null,
      } as any)
      .select() as any)
      .single();

    if (error) {
      console.error("Error creating user:", error);
      return null;
    }

    setUser(newUser);
    return newUser;
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setTimeout(() => {
          fetchOrCreateAppUser(session.user).finally(() => setIsLoading(false));
        }, 0);
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchOrCreateAppUser(session.user).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchOrCreateAppUser]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (user?.id) {
      const { data } = await supabase.from("users").select("*").eq("id", user.id).single();
      if (data) setUser(data);
    }
  }, [user?.id]);

  return {
    user,
    isLoading,
    isLoggingIn,
    isAuthenticated: !!user,
    logout,
    refreshUser,
  };
}
