import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User as AppUser } from "@/lib/api";

function withTimeout(promise: any, timeoutMs = 8000, message = "Request timeout") {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

const PENDING_EMAIL_LINK_KEY = "goodapp_pending_email_link";

type PendingEmailLink = {
  appUserId?: number;
  email?: string;
  createdAt?: number;
};

function readPendingEmailLink(): PendingEmailLink | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(PENDING_EMAIL_LINK_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PendingEmailLink;
    if (!parsed?.email) return null;

    if (parsed.createdAt && Date.now() - parsed.createdAt > 1000 * 60 * 60) {
      localStorage.removeItem(PENDING_EMAIL_LINK_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function clearPendingEmailLink() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(PENDING_EMAIL_LINK_KEY);
  }
}

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const fetchedRef = useRef(false);

  const fetchOrCreateAppUser = useCallback(async (authUser: { id: string; email?: string; user_metadata?: Record<string, string> }) => {
    const { data: existing } = await withTimeout((supabase
      .from("users")
      .select("*") as any)
      .eq("auth_id", authUser.id)
      .single(), 12000, "User fetch timeout");

    if (existing) {
      setUser(existing);
      return existing;
    }

    const pendingEmailLink = readPendingEmailLink();
    if (
      authUser.email &&
      pendingEmailLink?.appUserId &&
      pendingEmailLink.email?.toLowerCase() === authUser.email.toLowerCase()
    ) {
      const { data: linkedUser, error: linkError } = await withTimeout((supabase
        .from("users")
        .update({
          auth_id: authUser.id,
          email: authUser.email,
        } as any)
        .eq("id", pendingEmailLink.appUserId)
        .select() as any)
        .single(), 12000, "User email link timeout");

      clearPendingEmailLink();

      if (!linkError && linkedUser) {
        setUser(linkedUser);
        return linkedUser;
      }
    }

    const meta = authUser.user_metadata || {};
    const displayName = meta.display_name || "User";
    const phone = meta.phone || "";

    const { data: newUser, error } = await withTimeout((supabase
      .from("users")
      .insert({
        auth_id: authUser.id,
        guest_id: phone || authUser.id,
        display_name: displayName,
        email: authUser.email || null,
      } as any)
      .select() as any)
      .single(), 12000, "User create timeout");

    if (error) {
      console.error("Error creating user:", error);
      return null;
    }

    setUser(newUser);
    return newUser;
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Safety timeout - never spin loading longer than 15 seconds
    const safetyTimer = setTimeout(() => {
      if (isMounted && isLoading) {
        console.warn("Auth safety timeout reached, stopping loading");
        setIsLoading(false);
      }
    }, 15000);

    // Get session first, then listen for changes
    withTimeout(supabase.auth.getSession(), 8000, "Session timeout")
      .then(({ data: { session } }) => {
        if (!isMounted) return;
        if (session?.user) {
          fetchOrCreateAppUser(session.user).finally(() => {
            if (isMounted) setIsLoading(false);
          });
          fetchedRef.current = true;
        } else {
          setIsLoading(false);
        }
      })
      .catch((error) => {
        console.error("Session init failed:", error);
        if (!isMounted) return;
        setUser(null);
        setIsLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        // Skip if we already fetched on mount
        if (fetchedRef.current) {
          fetchedRef.current = false;
          return;
        }
        fetchOrCreateAppUser(session.user)
          .catch((error) => {
            console.error("Auth state user fetch failed:", error);
          })
          .finally(() => {
            if (isMounted) setIsLoading(false);
          });
      } else if (event === 'SIGNED_OUT') {
        // Only clear user on explicit sign out, not on token refresh issues
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [fetchOrCreateAppUser]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (user?.id) {
      const { data } = await withTimeout(
        supabase.from("users").select("*").eq("id", user.id).single(),
        12000,
        "User refresh timeout",
      );
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
