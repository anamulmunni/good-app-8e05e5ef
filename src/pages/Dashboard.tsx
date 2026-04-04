import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { KeySubmitter } from "@/components/KeySubmitter";
import { WithdrawForm } from "@/components/WithdrawForm";
import { LogOut, User, Wallet, Copy, Check, Bell, Send, Loader2, ChevronDown, MessageCircle, Shield, Lock, Newspaper, Download, Sparkles, X, Play, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPublicSettings, updateUserPaymentStatus } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { createUserTransferRequest, getIncomingTransferRequests, submitIncomingTransferRequests, cancelIncomingRequest } from "@/lib/user-requests";
import { hasUserPosted } from "@/lib/feed-api";
import { formatCountdown, getRemainingMilliseconds } from "@/lib/countdown";
import { getUnreadCount } from "@/lib/chat-api";

// Chat button with real-time unread badge
function ChatButtonWithBadge({ userId, navigate }: { userId?: number; navigate: (path: string) => void }) {
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => getUnreadCount(userId!),
    enabled: !!userId,
    refetchInterval: 20000,
  });

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={() => navigate("/chat")}
      className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--cyan))] to-[hsl(var(--blue))] shadow-lg shadow-[hsl(var(--cyan))]/40 flex items-center justify-center"
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[hsl(var(--cyan))] to-[hsl(var(--blue))] animate-pulse opacity-40" />
      <MessageCircle className="w-6 h-6 text-foreground relative z-10 fill-foreground/20" />
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] bg-destructive text-destructive-foreground text-[11px] font-black rounded-full flex items-center justify-center px-1 z-20 shadow-lg animate-pulse border-2 border-background">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </motion.button>
  );
}

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

export default function Dashboard() {
  const { user, logout, isLoading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [requestTargetNumber, setRequestTargetNumber] = useState("");
  const [requestPaymentMethod, setRequestPaymentMethod] = useState("bkash");
  const [requestPaymentNumber, setRequestPaymentNumber] = useState("");
  const [showRequestSubmitPassword, setShowRequestSubmitPassword] = useState(false);
  const [requestSubmitPassword, setRequestSubmitPassword] = useState("");
  const [submitterPaymentNumber, setSubmitterPaymentNumber] = useState("");
  const [submitterPaymentMethod, setSubmitterPaymentMethod] = useState("bkash");
  const [submitterRate, setSubmitterRate] = useState("");
  const [userRequestPassword, setUserRequestPassword] = useState("");
  const [showRequestSection, setShowRequestSection] = useState(false);
  const [showWalletDrawer, setShowWalletDrawer] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [prevKeyCount, setPrevKeyCount] = useState<number | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [loadedAppVersion, setLoadedAppVersion] = useState<number | null>(null);

  const { data: publicSettings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: getPublicSettings,
    staleTime: 10000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 15000,
  });

  const { data: incomingRequests = [] } = useQuery({
    queryKey: ["incoming-user-transfer-requests", user?.guest_id],
    queryFn: () => getIncomingTransferRequests(user?.guest_id || ""),
    enabled: !!user?.guest_id,
    refetchInterval: 30000,
  });

  const { data: userHasPosted = true } = useQuery({
    queryKey: ["user-has-posted", user?.id],
    queryFn: () => hasUserPosted(user!.id),
    enabled: !!user?.id,
    refetchInterval: 120000,
  });

  const createUserRequestMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("ইউজার পাওয়া যায়নি");
      
      // Request password check
      if (!userRequestPassword.trim()) throw new Error("Request পাসওয়ার্ড দিন");
      if ((user as any).request_password && userRequestPassword !== (user as any).request_password) {
        throw new Error("Request পাসওয়ার্ড ভুল হয়েছে");
      }
      
      // Target lock check
      let targetInput = requestTargetNumber.trim();
      if ((user as any).locked_target_guest_id) {
        targetInput = (user as any).locked_target_guest_id;
      }
      if (!targetInput) throw new Error("টার্গেট ইউজার দিন");
      
      const freshSettings = await getPublicSettings();
      const freshMinVerified = freshSettings.minRequestVerified || 10;
      if ((user.key_count || 0) < freshMinVerified) {
        throw new Error(`সর্বনিম্ন ${freshMinVerified} টি ভেরিফাইড কাউন্ট দরকার। আপনার আছে ${user.key_count || 0} টি।`);
      }
      
      let targetGuestId = targetInput;
      if (/^\d+$/.test(targetInput)) {
        const { data: targetUser } = await supabase.from("users").select("guest_id").eq("id", parseInt(targetInput)).maybeSingle();
        if (!targetUser) throw new Error("এই ID তে কোনো ইউজার পাওয়া যায়নি");
        targetGuestId = targetUser.guest_id;
      }
      
      await createUserTransferRequest({
        requesterUserId: user.id,
        requesterGuestId: user.guest_id,
        requesterVerifiedCount: user.key_count || 0,
        requesterPaymentNumber: requestPaymentNumber.trim(),
        requesterPaymentMethod: requestPaymentMethod,
        targetGuestId: targetGuestId,
      });
      
      // Set password and lock target if first time
      const updates: Record<string, string> = {};
      if (!(user as any).request_password) updates.request_password = userRequestPassword.trim();
      if (!(user as any).locked_target_guest_id) updates.locked_target_guest_id = targetGuestId;
      if (Object.keys(updates).length > 0) {
        await supabase.from("users").update(updates).eq("id", user.id);
        await refreshUser();
      }
    },
    onSuccess: () => {
      setRequestPaymentNumber("");
      setUserRequestPassword("");
      toast({ title: "রিকুয়েস্ট পাঠানো হয়েছে" });
    },
    onError: (error: Error) => {
      toast({ title: "রিকুয়েস্ট পাঠানো যায়নি", description: error.message, variant: "destructive" });
    },
  });

  const submitIncomingRequestsMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("ইউজার পাওয়া যায়নি");
      // Re-fetch latest settings to prevent stale submissions
      const freshSettings = await getPublicSettings();
      const minTarget = freshSettings.minRequestTarget || 0;
      const freshMinVerified = freshSettings.minRequestVerified || 10;
      if (minTarget > 0 && incomingRequests.length < minTarget) {
        throw new Error(`সর্বনিম্ন ${minTarget} টি request দরকার, আপনার আছে ${incomingRequests.length} টি।`);
      }
      // Check if any request has verified count below minimum
      const belowMinRequests = incomingRequests.filter(r => (r.requester_verified_count || 0) < freshMinVerified);
      if (belowMinRequests.length > 0) {
        throw new Error(`${belowMinRequests.length} টি request এ verified count ${freshMinVerified} এর কম। ওইগুলো Cancel করুন তারপর submit করুন।`);
      }
      const rateToSubmit = parseInt(submitterRate) || 0;
      if (rateToSubmit <= 0) {
        throw new Error("রেট লিখুন (সংখ্যা)");
      }
      return submitIncomingTransferRequests(
        user.guest_id,
        user.display_name || user.guest_id,
        requestSubmitPassword,
        submitterPaymentNumber.trim() || undefined,
        submitterPaymentNumber.trim() ? submitterPaymentMethod : undefined,
        rateToSubmit
      );
    },
    onSuccess: () => {
      setShowRequestSubmitPassword(false);
      setRequestSubmitPassword("");
      setSubmitterPaymentNumber("");
      queryClient.invalidateQueries({ queryKey: ["incoming-user-transfer-requests", user?.guest_id] });
      queryClient.invalidateQueries({ queryKey: ["admin-submitted"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-request-submissions"] });
      toast({ title: "লিস্ট অ্যাডমিন প্যানেলে পাঠানো হয়েছে" });
    },
    onError: (error: Error) => {
      toast({ title: "সাবমিট ব্যর্থ হয়েছে", description: error.message, variant: "destructive" });
    },
  });

  const cancelIncomingRequestMutation = useMutation({
    mutationFn: async (requestId: number) => {
      if (!user) throw new Error("ইউজার পাওয়া যায়নি");
      return cancelIncomingRequest(requestId, user.guest_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incoming-user-transfer-requests", user?.guest_id] });
      toast({ title: "Request cancel হয়েছে" });
    },
    onError: (error: Error) => {
      toast({ title: "Cancel ব্যর্থ", description: error.message, variant: "destructive" });
    },
  });

  const paymentMutation = useMutation({
    mutationFn: async (received: boolean) => {
      if (!user) return;
      await updateUserPaymentStatus(user.id, received ? "received" : "not_received");
    },
    onSuccess: () => {
      refreshUser();
      toast({ title: "আপনার ফিডব্যাক জমা হয়েছে" });
    },
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Celebration when key_count increases
  useEffect(() => {
    if (user?.key_count != null) {
      if (prevKeyCount !== null && user.key_count > prevKeyCount) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 3000);
      }
      setPrevKeyCount(user.key_count);
    }
  }, [user?.key_count]);

  // Auto-refresh: track appVersion changes and reload page
  useEffect(() => {
    if (publicSettings?.appVersion != null) {
      if (loadedAppVersion === null) {
        setLoadedAppVersion(publicSettings.appVersion);
      } else if (publicSettings.appVersion !== loadedAppVersion) {
        window.location.reload();
      }
    }
  }, [publicSettings?.appVersion, loadedAppVersion]);

  useEffect(() => {
    if (!user?.id) return;

    const settingsChannel = supabase
      .channel('dashboard-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => {
        queryClient.invalidateQueries({ queryKey: ["public-settings"] });
      })
      .subscribe();

    const usersChannel = supabase
      .channel('dashboard-user')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: user ? `id=eq.${user.id}` : undefined }, () => {
        refreshUser();
      })
      .subscribe();

    const txChannel = supabase
      .channel('dashboard-transactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: user ? `user_id=eq.${user.id}` : undefined }, () => {
        queryClient.invalidateQueries({ queryKey: ["user-transactions"] });
        refreshUser();
      })
      .subscribe();

    const requestsChannel = supabase
      .channel('dashboard-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_transfer_requests' }, () => {
        queryClient.invalidateQueries({ queryKey: ["incoming-user-transfer-requests", user?.guest_id] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(txChannel);
      supabase.removeChannel(requestsChannel);
    };
  }, [user?.id, queryClient, refreshUser]);

  const bonusEnabled = publicSettings?.bonusStatus === "on";
  const targetAmount = publicSettings?.bonusTarget || 10;
  const customNoticeText = publicSettings?.customNotice;
  const minRequestVerified = publicSettings?.minRequestVerified || 10;
  const minRequestTarget = publicSettings?.minRequestTarget || 0;
  const paymentMode = publicSettings?.paymentMode === "on";
  const currentRate = publicSettings?.rewardRate || 0;
  const userVerifiedCount = user?.key_count || 0;
  const canSendRequest = userVerifiedCount >= minRequestVerified;
  const belowMinIncoming = incomingRequests.filter(r => (r.requester_verified_count || 0) < minRequestVerified);
  const canSubmitList = (minRequestTarget <= 0 || incomingRequests.length >= minRequestTarget) && belowMinIncoming.length === 0;
  const requestLockRemainingMs = !paymentMode ? getRemainingMilliseconds(publicSettings?.requestLockUntil, nowMs) : 0;
  const isRequestLocked = requestLockRemainingMs > 0;
  const requestCountdownText = formatCountdown(requestLockRemainingMs);

  const copyId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(String(user.id));
      setCopied(true);
      toast({ title: "ID কপি করা হয়েছে" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm animate-pulse">লোড হচ্ছে...</p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  return (
    // Check if user has a real email
    const userHasRealEmail = user?.email && !user.email.endsWith("@goodapp.local");
    const [showGmailPrompt, setShowGmailPrompt] = useState(!userHasRealEmail);
    const [gmailInput, setGmailInput] = useState("");
    const [gmailOtpCode, setGmailOtpCode] = useState("");
    const [gmailStep, setGmailStep] = useState<"email" | "otp">("email");
    const [gmailSubmitting, setGmailSubmitting] = useState(false);

    const handleGmailSubmit = async () => {
      if (gmailStep === "email") {
        if (!gmailInput.trim() || !gmailInput.includes("@")) {
          toast({ title: "সঠিক Gmail দিন", variant: "destructive" });
          return;
        }
        setGmailSubmitting(true);
        try {
          // Update email in auth
          const { error } = await supabase.auth.updateUser({ email: gmailInput.trim() });
          if (error) throw error;
          setGmailStep("otp");
          toast({ title: "📧 কোড পাঠানো হয়েছে", description: `${gmailInput.trim()} এ ভেরিফিকেশন কোড পাঠানো হয়েছে` });
        } catch (err: any) {
          toast({ title: "ব্যর্থ", description: err.message || "কিছু ভুল হয়েছে", variant: "destructive" });
        } finally {
          setGmailSubmitting(false);
        }
      } else {
        if (!gmailOtpCode.trim()) return;
        setGmailSubmitting(true);
        try {
          const { error } = await supabase.auth.verifyOtp({
            email: gmailInput.trim(),
            token: gmailOtpCode.trim(),
            type: "email_change",
          });
          if (error) throw error;
          // Update email in users table
          await supabase.from("users").update({ email: gmailInput.trim() }).eq("id", user.id);
          await refreshUser();
          setShowGmailPrompt(false);
          toast({ title: "✅ Gmail ভেরিফাই হয়েছে!" });
        } catch (err: any) {
          toast({ title: "ভেরিফিকেশন ব্যর্থ", description: err.message || "ভুল কোড", variant: "destructive" });
        } finally {
          setGmailSubmitting(false);
        }
      }
    };

    return (
    <div className="min-h-screen bg-background pb-24 relative">
      {/* Gmail force prompt for old users */}
      <AnimatePresence>
        {showGmailPrompt && !userHasRealEmail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-background/95 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", damping: 20 }}
              className="w-full max-w-sm text-center space-y-5"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-primary to-[hsl(var(--cyan))] flex items-center justify-center shadow-2xl shadow-primary/30"
              >
                <Mail className="w-10 h-10 text-primary-foreground" />
              </motion.div>
              <div className="space-y-2">
                <h2 className="text-xl font-black">Gmail যোগ করুন 📧</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  আপনার অ্যাকাউন্টের সুরক্ষার জন্য Gmail ভেরিফাই করতে হবে। পরবর্তী লগইনে Gmail কোড দিয়ে লগইন করতে হবে।
                </p>
              </div>
              {gmailStep === "email" ? (
                <div className="space-y-3">
                  <input
                    type="email"
                    value={gmailInput}
                    onChange={(e) => setGmailInput(e.target.value)}
                    placeholder="আপনার Gmail লিখুন..."
                    className="input-field text-center"
                  />
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleGmailSubmit}
                    disabled={gmailSubmitting}
                    className="w-full py-3.5 rounded-2xl font-black text-primary-foreground bg-gradient-to-r from-primary to-[hsl(var(--cyan))]"
                  >
                    {gmailSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "কোড পাঠান"}
                  </motion.button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">{gmailInput} এ কোড পাঠানো হয়েছে</p>
                  <input
                    type="text"
                    value={gmailOtpCode}
                    onChange={(e) => setGmailOtpCode(e.target.value)}
                    placeholder="৬ সংখ্যার কোড..."
                    className="input-field text-center text-2xl tracking-[0.5em] font-mono"
                    maxLength={6}
                  />
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleGmailSubmit}
                    disabled={gmailSubmitting}
                    className="w-full py-3.5 rounded-2xl font-black text-primary-foreground bg-gradient-to-r from-[hsl(var(--emerald))] to-primary"
                  >
                    {gmailSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "ভেরিফাই করুন"}
                  </motion.button>
                  <button onClick={() => setGmailStep("email")} className="text-xs text-muted-foreground hover:text-primary">
                    অন্য Gmail ব্যবহার করুন
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary opacity-10 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[hsl(var(--purple))] opacity-[0.07] rounded-full blur-[150px]" />
        <div className="absolute top-[40%] left-[50%] w-[400px] h-[400px] bg-[hsl(var(--cyan))] opacity-[0.05] rounded-full blur-[150px]" />
      </div>

      {/* Feed onboarding overlay - ALL users must post */}
      <AnimatePresence>
        {!userHasPosted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", damping: 20 }}
              className="w-full max-w-sm text-center space-y-6"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-br from-[hsl(var(--amber))] to-[hsl(var(--orange))] flex items-center justify-center shadow-2xl shadow-[hsl(var(--amber))]/30"
              >
                <Newspaper className="w-12 h-12 text-background" />
              </motion.div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black">নিউজ ফিডে পোস্ট করুন! 🎉</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  অ্যাপ ব্যবহার করতে প্রথমে নিউজ ফিডে গিয়ে একটি পোস্ট করুন। এটি সবার জন্য প্রযোজ্য।
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate("/feed")}
                className="w-full relative py-4 rounded-2xl font-black text-lg text-primary-foreground overflow-hidden"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--amber))] via-[hsl(var(--orange))] to-[hsl(var(--pink))]"
                  animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  style={{ backgroundSize: "200% 100%" }}
                />
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5" /> নিউজ ফিডে যান ও পোস্ট করুন
                </span>
              </motion.button>
              <p className="text-[10px] text-muted-foreground">পোস্ট করার পর সব ফিচার আনলক হবে</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment confirmation overlay */}
      <AnimatePresence>
        {user.payment_status === "pending" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="glass-card p-8 rounded-3xl w-full max-w-sm text-center space-y-6 border-2 border-primary/30 shadow-2xl shadow-primary/20">
              <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
                <Wallet className="w-10 h-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">পেমেন্ট পেয়েছেন?</h2>
                <p className="text-muted-foreground">আপনার পূর্বের কাজের পেমেন্ট কি আপনি বুঝে পেয়েছেন?</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => paymentMutation.mutate(true)} className="btn-primary bg-[hsl(var(--emerald))] h-14 text-lg font-black" disabled={paymentMutation.isPending}>হ্যাঁ</button>
                <button onClick={() => paymentMutation.mutate(false)} className="btn-primary bg-destructive h-14 text-lg font-black" disabled={paymentMutation.isPending}>না</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wallet Drawer Overlay */}
      <AnimatePresence>
        {showWalletDrawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWalletDrawer(false)}
              className="fixed inset-0 z-[150] bg-background/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[151] max-h-[85vh] overflow-y-auto"
            >
              <div className="max-w-md mx-auto bg-background border-t border-x border-border/50 rounded-t-3xl shadow-2xl">
                {/* Drawer handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(var(--cyan))]/30 to-[hsl(var(--emerald))]/20 flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-[hsl(var(--cyan))]" />
                      </div>
                      <div>
                        <h2 className="text-lg font-black">ওয়ালেট</h2>
                        <p className="text-[10px] text-muted-foreground">💰 {currentRate} TK/ভেরিফাই</p>
                      </div>
                    </div>
                    <button onClick={() => setShowWalletDrawer(false)} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                      <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                  </div>
                  
                  {/* Balance */}
                  <div className="text-center py-4 bg-gradient-to-br from-[hsl(var(--cyan))]/5 to-[hsl(var(--emerald))]/5 rounded-2xl border border-[hsl(var(--cyan))]/15">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">মোট ব্যালেন্স</p>
                    <p className="text-5xl font-black bg-gradient-to-r from-[hsl(var(--cyan))] via-[hsl(var(--emerald))] to-primary bg-clip-text text-transparent">
                      {user.balance || 0}<span className="text-lg ml-1">৳</span>
                    </p>
                  </div>

                  {/* Withdraw Form */}
                  <WithdrawForm balance={user.balance || 0} />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/profile")}
              className="w-11 h-11 bg-gradient-to-br from-primary/30 to-[hsl(var(--cyan))]/20 rounded-2xl flex items-center justify-center border border-primary/20 overflow-hidden"
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-primary" />
              )}
            </motion.button>
            <div>
              <p className="font-bold text-sm truncate max-w-[140px]">{user.display_name || "Unknown"}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] text-muted-foreground font-mono">ID: {user.id}</p>
                <button onClick={copyId} className="p-0.5 hover:bg-secondary rounded transition-colors">
                  {copied ? <Check className="w-2.5 h-2.5 text-primary" /> : <Copy className="w-2.5 h-2.5 text-muted-foreground" />}
                </button>
              </div>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => { logout(); navigate("/"); }}
            className="p-2.5 hover:bg-destructive/10 rounded-xl text-muted-foreground hover:text-destructive transition-all"
          >
            <LogOut className="w-5 h-5" />
          </motion.button>
        </div>
      </header>

      {/* Feed & Chat buttons - top bar */}
      <div className="max-w-md mx-auto px-4 pt-4 relative z-10">
        <div className="flex gap-2">
          {/* Feed */}
          <motion.button
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 12, delay: 0.1 }}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => navigate("/feed")}
            className="flex-1 relative py-3 rounded-2xl font-bold text-xs overflow-hidden"
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--amber))] via-[hsl(var(--orange))] to-[hsl(var(--amber))]"
              animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              style={{ backgroundSize: "200% 100%" }}
            />
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1.5 }}
            />
            <span className="relative z-10 flex items-center justify-center gap-1.5 text-primary-foreground">
              <motion.span animate={{ rotate: [0, -10, 10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                <Newspaper className="w-4 h-4" />
              </motion.span>
              ফিড
            </span>
          </motion.button>

          {/* good-app Video */}
          <motion.button
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 12, delay: 0.15 }}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => navigate("/reels")}
            className="flex-1 relative py-3 rounded-2xl font-bold text-xs overflow-hidden"
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--emerald))] via-[hsl(var(--cyan))] to-[hsl(var(--emerald))]"
              animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              style={{ backgroundSize: "200% 100%" }}
            />
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1.8 }}
            />
            <span className="relative z-10 flex items-center justify-center gap-1.5 text-primary-foreground font-black">
              <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                <Play className="w-4 h-4 fill-current" />
              </motion.span>
              ভিডিও
            </span>
          </motion.button>

          {/* Chat */}
          <motion.button
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 12, delay: 0.2 }}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => navigate("/chat")}
            className="flex-1 relative py-3 rounded-2xl font-bold text-xs overflow-hidden"
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--cyan))] via-[hsl(var(--blue))] to-[hsl(var(--cyan))]"
              animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              style={{ backgroundSize: "200% 100%" }}
            />
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 2 }}
            />
            <span className="relative z-10 flex items-center justify-center gap-1.5 text-primary-foreground">
              <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                <MessageCircle className="w-4 h-4" />
              </motion.span>
              মেসেজ
            </span>
          </motion.button>
        </div>
      </div>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-5 relative z-10">
        {/* Premium Balance & Wallet Section - ONLY when payment mode ON */}
        {paymentMode && (
          <motion.div
            custom={0}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="glass-card rounded-3xl border border-[hsl(var(--cyan))]/25 relative overflow-hidden group"
          >
            <motion.div
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[hsl(var(--cyan))]/8 via-[hsl(var(--emerald))]/5 to-[hsl(var(--purple))]/8"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
            <motion.div
              className="pointer-events-none absolute -top-20 -right-20 w-40 h-40 bg-[hsl(var(--cyan))] rounded-full blur-[80px] opacity-15"
              animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.2, 0.1] }}
              transition={{ duration: 5, repeat: Infinity }}
            />
            <motion.div
              className="pointer-events-none absolute -bottom-20 -left-20 w-40 h-40 bg-[hsl(var(--emerald))] rounded-full blur-[80px] opacity-15"
              animate={{ scale: [1.3, 1, 1.3], opacity: [0.15, 0.08, 0.15] }}
              transition={{ duration: 5, repeat: Infinity }}
            />
            <div className="relative z-10 p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(var(--cyan))]/30 to-[hsl(var(--emerald))]/25 flex items-center justify-center border border-[hsl(var(--cyan))]/30"
                  >
                    <Wallet className="w-5 h-5 text-[hsl(var(--cyan))]" />
                  </motion.div>
                  <p className="text-sm text-muted-foreground font-bold">আমার ওয়ালেট</p>
                </div>
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="px-4 py-2 rounded-2xl bg-gradient-to-r from-[hsl(var(--emerald))]/20 to-[hsl(var(--cyan))]/15 border border-[hsl(var(--emerald))]/30"
                >
                  <p className="text-base font-black text-[hsl(var(--emerald))]">💰 {currentRate} TK/ভেরিফাই</p>
                </motion.div>
              </div>
              <div className="text-center py-5">
                <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-2 font-semibold">মোট ব্যালেন্স</p>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 15 }}
                >
                  <motion.p
                    key={user.balance}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-7xl font-black leading-none"
                  >
                    <span className="bg-gradient-to-r from-[hsl(var(--cyan))] via-[hsl(var(--emerald))] to-primary bg-clip-text text-transparent drop-shadow-[0_0_40px_hsl(var(--emerald)/0.3)]">
                      {user.balance || 0}
                    </span>
                    <motion.span
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="text-2xl ml-2 text-[hsl(var(--emerald))]"
                    >
                      ৳
                    </motion.span>
                  </motion.p>
                </motion.div>
              </div>
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowWalletDrawer(true)}
                className="w-full relative py-4 rounded-2xl font-black text-base overflow-hidden mt-2"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--cyan))] via-[hsl(var(--emerald))] to-[hsl(var(--cyan))]"
                  animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  style={{ backgroundSize: "200% 100%" }}
                />
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                />
                <div className="absolute inset-0 rounded-2xl border border-white/20" />
                <span className="relative z-10 flex items-center justify-center gap-2 text-primary-foreground">
                  <Wallet className="w-5 h-5" />
                  উইথড্র করুন
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Verified Count - ONLY when payment mode OFF */}
        {!paymentMode && (
          <motion.div
            custom={0}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="glass-card rounded-3xl border border-[hsl(var(--purple))]/25 relative overflow-hidden group"
          >
            <motion.div
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[hsl(var(--purple))]/10 via-[hsl(var(--pink))]/5 to-primary/8"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
            <motion.div
              className="pointer-events-none absolute -top-20 -right-20 w-40 h-40 bg-[hsl(var(--purple))] rounded-full blur-[80px] opacity-15"
              animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.2, 0.1] }}
              transition={{ duration: 5, repeat: Infinity }}
            />
            <motion.div
              className="pointer-events-none absolute -bottom-20 -left-20 w-40 h-40 bg-[hsl(var(--pink))] rounded-full blur-[80px] opacity-15"
              animate={{ scale: [1.3, 1, 1.3], opacity: [0.15, 0.08, 0.15] }}
              transition={{ duration: 5, repeat: Infinity }}
            />
            <div className="relative z-10 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(var(--purple))]/30 to-[hsl(var(--pink))]/25 flex items-center justify-center border border-[hsl(var(--purple))]/30"
                  >
                    <Shield className="w-5 h-5 text-[hsl(var(--purple))]" />
                  </motion.div>
                  <p className="text-sm text-muted-foreground font-bold">ভেরিফাইড কী</p>
                </div>
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[hsl(var(--purple))]/20 to-[hsl(var(--pink))]/15 border border-[hsl(var(--purple))]/30"
                >
                  <span className="text-[10px] font-black text-[hsl(var(--purple))] tracking-wider">LIVE COUNT</span>
                </motion.div>
              </div>
               <div className="relative text-center py-5 overflow-hidden">
                {/* Minimal floating particles */}
                {[...Array(4)].map((_, i) => (
                  <motion.div
                    key={`particle-${i}`}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      width: [5, 7, 5, 7][i],
                      height: [5, 7, 5, 7][i],
                      left: `${15 + i * 20}%`,
                      top: `${20 + (i % 2) * 40}%`,
                      background: ['hsl(var(--purple))', 'hsl(var(--pink))', 'hsl(var(--cyan))', 'hsl(var(--amber))'][i],
                    }}
                    animate={{ y: [0, -15, 0], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 3, repeat: Infinity, delay: i * 0.8 }}
                  />
                ))}
                {/* Full-screen celebration overlay */}
                <AnimatePresence>
                  {showCelebration && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center"
                    >
                      {/* Confetti burst */}
                      {[...Array(10)].map((_, i) => (
                        <motion.div
                          key={`confetti-${i}`}
                          className="absolute rounded-full"
                          style={{
                            width: 6 + Math.random() * 8,
                            height: 6 + Math.random() * 8,
                            background: ['#ff0', '#f0f', '#0ff', '#f00', '#0f0', '#ff6b6b', '#ffd700', '#00e5ff', '#e040fb'][i % 9],
                          }}
                          initial={{ x: 0, y: 0, scale: 0 }}
                          animate={{
                            x: (Math.random() - 0.5) * 400,
                            y: (Math.random() - 0.5) * 600,
                            scale: [0, 1.5, 0],
                            rotate: Math.random() * 720,
                          }}
                          transition={{ duration: 2 + Math.random(), ease: "easeOut" }}
                        />
                      ))}
                      <motion.div
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: [0, 1.3, 1], rotate: [-20, 5, 0] }}
                        transition={{ type: "spring", damping: 8 }}
                        className="text-center"
                      >
                        <p className="text-5xl mb-2">🎉</p>
                        <p className="text-2xl font-black text-white drop-shadow-[0_0_20px_rgba(0,0,0,0.8)]">
                          ভেরিফিকেশন বেড়েছে!
                        </p>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-2 font-semibold relative z-10">মোট ভেরিফিকেশন</p>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 15 }}
                  className="relative z-10"
                >
                  <motion.p
                    key={user.key_count}
                    initial={{ y: 40, opacity: 0, rotate: -15, scale: 0.5 }}
                    animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
                    transition={{ type: "spring", damping: 10, stiffness: 100 }}
                    className="text-7xl font-black leading-none"
                  >
                    <motion.span
                      className="inline-block bg-clip-text text-transparent"
                      style={{
                        backgroundImage: (user.key_count || 0) >= 50
                          ? "linear-gradient(135deg, #ffd700, #ff8c00, #ff4500, #ffd700)"
                          : (user.key_count || 0) >= 20
                          ? "linear-gradient(135deg, #e040fb, #7c4dff, #536dfe, #e040fb)"
                          : (user.key_count || 0) >= 10
                          ? "linear-gradient(135deg, #00e5ff, #1de9b6, #00e676, #00e5ff)"
                          : "linear-gradient(135deg, hsl(var(--purple)), hsl(var(--pink)), hsl(var(--amber)))",
                        backgroundSize: "300% 300%",
                        filter: (user.key_count || 0) >= 50
                          ? "drop-shadow(0 0 30px rgba(255,215,0,0.6)) drop-shadow(0 0 60px rgba(255,140,0,0.4))"
                          : (user.key_count || 0) >= 20
                          ? "drop-shadow(0 0 30px rgba(224,64,251,0.5)) drop-shadow(0 0 60px rgba(124,77,255,0.3))"
                          : (user.key_count || 0) >= 10
                          ? "drop-shadow(0 0 30px rgba(0,229,255,0.5)) drop-shadow(0 0 60px rgba(0,230,118,0.3))"
                          : "drop-shadow(0 0 30px hsl(var(--purple) / 0.5)) drop-shadow(0 0 60px hsl(var(--pink) / 0.3))",
                      }}
                      animate={{
                        backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
                        scale: [1, 1.12, 0.95, 1.08, 1],
                        rotate: [0, 3, -3, 2, 0],
                        y: [0, -8, 4, -4, 0],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      {user.key_count || 0}
                    </motion.span>
                  </motion.p>
                  {/* Tier label */}
                  {(user.key_count || 0) >= 10 && (
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] font-black mt-2 tracking-widest uppercase"
                      style={{
                        color: (user.key_count || 0) >= 50 ? "#ffd700" : (user.key_count || 0) >= 20 ? "#e040fb" : "#00e5ff",
                      }}
                    >
                      <motion.span
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        {(user.key_count || 0) >= 50 ? "⭐ GOLD TIER" : (user.key_count || 0) >= 20 ? "💎 DIAMOND TIER" : "🔥 SILVER TIER"}
                      </motion.span>
                    </motion.p>
                  )}
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Custom Notice */}
        <AnimatePresence>
          {customNoticeText && (
            <motion.div
              custom={2}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              className="relative overflow-hidden rounded-2xl border border-[hsl(var(--amber))]/30"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--amber))]/10 to-[hsl(var(--orange))]/5" />
              <div className="relative p-5 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[hsl(var(--amber))]/20 flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5 text-[hsl(var(--amber))]" />
                </div>
                <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap">{customNoticeText}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User Request Section - MOVED UP */}
        {!paymentMode && <motion.section
          custom={3}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="relative overflow-hidden rounded-3xl border-2 border-[hsl(var(--cyan))]/30"
        >
          <motion.div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[hsl(var(--cyan))]/10 via-[hsl(var(--blue))]/5 to-[hsl(var(--purple))]/10"
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <motion.div
            className="pointer-events-none absolute -top-16 -right-16 w-32 h-32 bg-[hsl(var(--cyan))] rounded-full blur-[60px] opacity-20"
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ duration: 4, repeat: Infinity }}
          />
          <motion.div
            className="pointer-events-none absolute -bottom-16 -left-16 w-32 h-32 bg-[hsl(var(--purple))] rounded-full blur-[60px] opacity-15"
            animate={{ scale: [1.3, 1, 1.3] }}
            transition={{ duration: 4, repeat: Infinity }}
          />
          <button
            onClick={() => setShowRequestSection(!showRequestSection)}
            className="w-full relative z-10 p-5 flex items-center justify-between hover:bg-secondary/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[hsl(var(--cyan))] to-[hsl(var(--blue))] flex items-center justify-center shadow-lg shadow-[hsl(var(--cyan))]/30"
              >
                <Send className="w-6 h-6 text-foreground" />
              </motion.div>
              <div className="text-left">
                <h2 className="text-base font-black bg-gradient-to-r from-[hsl(var(--cyan))] to-[hsl(var(--blue))] bg-clip-text text-transparent">💸 Payment Request</h2>
                <p className="text-[10px] text-muted-foreground">ট্যাপ করে রিকুয়েস্ট পাঠান</p>
              </div>
            </div>
            <motion.div animate={{ rotate: showRequestSection ? 180 : 0 }} transition={{ duration: 0.3 }}>
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            </motion.div>
          </button>

          <AnimatePresence>
            {showRequestSection && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                <div className="px-5 pb-5 space-y-4 relative z-10">
                  <div className="bg-[hsl(var(--amber))]/10 border border-[hsl(var(--amber))]/20 rounded-xl p-4 space-y-2">
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      রিকুয়েস্ট পাঠাতে সর্বনিম্ন <span className="text-[hsl(var(--amber))] font-black">{minRequestVerified}</span> টি ভেরিফাইড কাউন্ট দরকার।
                    </p>
                    {bonusEnabled && (
                      <p className="text-xs text-foreground/80 leading-relaxed">
                        <span className="text-primary font-bold">৫০ টি</span> = <span className="text-primary font-bold">২০% বোনাস</span>
                      </p>
                    )}
                  </div>

                  {isRequestLocked ? (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center"
                    >
                      <p className="text-[10px] text-muted-foreground mb-1">রিকুয়েস্ট সিস্টেম চালু হবে</p>
                      <p className="text-2xl font-black text-destructive tracking-wide">{requestCountdownText}</p>
                    </motion.div>
                  ) : !canSendRequest ? (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-center">
                      <p className="text-sm text-destructive font-bold">
                        {userVerifiedCount} / {minRequestVerified} ভেরিফাইড
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">সর্বনিম্ন {minRequestVerified} টি হলেই পাঠাতে পারবেন</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(user as any).locked_target_guest_id ? (
                        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3">
                          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Lock className="w-3 h-3" /> লক করা টার্গেট</p>
                          <p className="text-sm font-mono font-black text-primary">{(user as any).locked_target_guest_id}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">Admin থেকে আনলক করতে হবে অন্য কাউকে request দিতে</p>
                        </div>
                      ) : (
                        <input type="text" value={requestTargetNumber} onChange={(e) => setRequestTargetNumber(e.target.value)}
                          placeholder="যার কাছে রিকুয়েস্ট যাবে (User ID দিন)" className="input-field" />
                      )}
                      <div className="bg-[hsl(var(--purple))]/10 border border-[hsl(var(--purple))]/20 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-bold text-[hsl(var(--purple))] flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" />
                          {(user as any).request_password ? "Request পাসওয়ার্ড দিন" : "Request পাসওয়ার্ড সেট করুন (প্রথমবার)"}
                        </p>
                        <input type="password" value={userRequestPassword} onChange={(e) => setUserRequestPassword(e.target.value)}
                          placeholder={(user as any).request_password ? "আপনার পাসওয়ার্ড দিন..." : "নতুন পাসওয়ার্ড সেট করুন..."} className="input-field" />
                        {!(user as any).request_password && (
                          <p className="text-[10px] text-muted-foreground">⚠️ এই পাসওয়ার্ড পরে request দিতে লাগবে, মনে রাখুন</p>
                        )}
                      </div>
                      <div className="bg-secondary/30 p-4 rounded-xl border border-border/50 space-y-3">
                        <p className="text-sm font-bold">আপনার পেমেন্ট নম্বর</p>
                        <div className="grid grid-cols-2 gap-2 bg-secondary/50 p-1 rounded-xl border border-border/50">
                          <motion.button
                            onClick={() => setRequestPaymentMethod("bkash")}
                            whileTap={{ scale: 0.9 }}
                            whileHover={{ scale: 1.05 }}
                            className={`px-4 py-2.5 rounded-lg text-xs font-black transition-all relative overflow-hidden ${requestPaymentMethod === "bkash" ? "text-foreground shadow-lg" : "text-muted-foreground"}`}
                          >
                            {requestPaymentMethod === "bkash" && (
                              <>
                                <motion.div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--pink))] to-[hsl(340,80%,55%)]" layoutId="payment-method-bg" transition={{ type: "spring", bounce: 0.2 }} />
                                <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" animate={{ x: ["-100%", "200%"] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }} />
                              </>
                            )}
                            <span className="relative z-10">bKash</span>
                          </motion.button>
                          <motion.button
                            onClick={() => setRequestPaymentMethod("nagad")}
                            whileTap={{ scale: 0.9 }}
                            whileHover={{ scale: 1.05 }}
                            className={`px-4 py-2.5 rounded-lg text-xs font-black transition-all relative overflow-hidden ${requestPaymentMethod === "nagad" ? "text-foreground shadow-lg" : "text-muted-foreground"}`}
                          >
                            {requestPaymentMethod === "nagad" && (
                              <>
                                <motion.div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--orange))] to-[hsl(25,85%,55%)]" layoutId="payment-method-bg" transition={{ type: "spring", bounce: 0.2 }} />
                                <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" animate={{ x: ["-100%", "200%"] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }} />
                              </>
                            )}
                            <span className="relative z-10">Nagad</span>
                          </motion.button>
                        </div>
                        <input type="text" placeholder="01XXXXXXXXX" value={requestPaymentNumber}
                          onChange={(e) => setRequestPaymentNumber(e.target.value)} className="input-field" />
                      </div>
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        whileHover={{ scale: 1.03, y: -2 }}
                        onClick={() => createUserRequestMutation.mutate()}
                        className="w-full relative py-3.5 rounded-2xl font-black overflow-hidden"
                        disabled={isRequestLocked || createUserRequestMutation.isPending || (!(user as any).locked_target_guest_id && !requestTargetNumber.trim()) || !requestPaymentNumber.trim() || !userRequestPassword.trim()}>
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-primary via-[hsl(var(--cyan))] to-primary"
                          animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          style={{ backgroundSize: "200% 100%" }}
                        />
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                          animate={{ x: ["-100%", "200%"] }}
                          transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                        />
                        <span className="relative z-10 flex items-center justify-center gap-2 text-primary-foreground">
                          {createUserRequestMutation.isPending ? <Loader2 className="animate-spin w-5 h-5" /> : <><Send className="w-4 h-4" /> Request পাঠান</>}
                        </span>
                      </motion.button>
                    </div>
                  )}

                  <div className="border-t border-border/50 pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">আসা Request ({incomingRequests.length})</h3>
                      {minRequestTarget > 0 && (
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${canSubmitList ? "bg-[hsl(var(--emerald))]/20 text-[hsl(var(--emerald))]" : "bg-destructive/20 text-destructive"}`}>
                          {incomingRequests.length}/{minRequestTarget} টার্গেট
                        </span>
                      )}
                    </div>
                    {incomingRequests.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">কোনো request আসেনি</p>
                    ) : (
                      <>
                        {/* Below-min verified warning */}
                        {belowMinIncoming.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-center"
                          >
                            <p className="text-xs font-bold text-destructive">
                              ⚠️ {belowMinIncoming.length} টি request এ verified count {minRequestVerified} এর কম আছে।
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">ওইগুলো Cancel করুন তারপর list submit দিতে পারবেন।</p>
                          </motion.div>
                        )}

                        {/* Minimum target warning */}
                        {minRequestTarget > 0 && incomingRequests.length < minRequestTarget && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-center"
                          >
                            <p className="text-xs font-bold text-destructive">
                              সর্বনিম্ন {minRequestTarget} টি request দরকার। আপনার আছে {incomingRequests.length} টি।
                            </p>
                          </motion.div>
                        )}

                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {incomingRequests.map((item) => (
                            <motion.div
                              key={item.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className={`rounded-xl p-3.5 space-y-2 ${(item.requester_verified_count || 0) < minRequestVerified ? "bg-destructive/10 border-2 border-destructive/40" : "bg-secondary/30 border border-border/50"}`}
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-bold font-mono">ID: {item.requester_user_id}</p>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-primary/20 text-primary">
                                    {item.requester_verified_count} ✓
                                  </span>
                                  <motion.button
                                    whileTap={{ scale: 0.85 }}
                                    onClick={() => cancelIncomingRequestMutation.mutate(item.id)}
                                    disabled={cancelIncomingRequestMutation.isPending}
                                    className="p-1 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive transition-colors"
                                    title="Cancel request"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </motion.button>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                                  item.requester_payment_method === "bkash"
                                    ? "bg-[hsl(var(--pink))]/20 text-[hsl(var(--pink))]"
                                    : "bg-[hsl(var(--orange))]/20 text-[hsl(var(--orange))]"
                                }`}>
                                  {item.requester_payment_method?.toUpperCase() || "N/A"}
                                </span>
                                <span className="text-xs font-mono font-bold">{item.requester_payment_number}</span>
                              </div>
                            </motion.div>
                          ))}
                        </div>

                        {showRequestSubmitPassword ? (
                          <div className="space-y-3 bg-secondary/20 p-4 rounded-xl border border-border/50">
                            <input type="password" value={requestSubmitPassword} onChange={(e) => setRequestSubmitPassword(e.target.value)}
                              placeholder="পাসওয়ার্ড দিন" className="input-field" />
                            {/* Custom Rate Input */}
                            <div className="bg-[hsl(var(--amber))]/10 border border-[hsl(var(--amber))]/20 rounded-xl p-3 space-y-2">
                              <p className="text-xs font-bold text-[hsl(var(--amber))]">💰 আপনার ইউজারের নির্ধারিত রেট লিখুন</p>
                              <input type="number" value={submitterRate} onChange={(e) => setSubmitterRate(e.target.value)}
                                placeholder="যেমন: 35" className="input-field text-center text-lg font-black" />
                              <p className="text-[10px] text-muted-foreground">এই রেটে Admin প্যানেলে দেখাবে</p>
                            </div>
                            <div className="bg-secondary/30 p-3 rounded-xl border border-border/50 space-y-3">
                              <p className="text-xs font-bold">আপনার bKash/Nagad নম্বর</p>
                               <div className="grid grid-cols-2 gap-2 bg-secondary/50 p-1 rounded-xl border border-border/50">
                                 <motion.button
                                   onClick={() => setSubmitterPaymentMethod("bkash")}
                                   whileTap={{ scale: 0.9 }}
                                   className={`px-3 py-2.5 rounded-lg text-xs font-black transition-all relative overflow-hidden ${submitterPaymentMethod === "bkash" ? "text-foreground shadow-lg" : "text-muted-foreground"}`}
                                 >
                                   {submitterPaymentMethod === "bkash" && (
                                     <motion.div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--pink))] to-[hsl(340,80%,55%)]" layoutId="submitter-payment-bg" transition={{ type: "spring", bounce: 0.2 }} />
                                   )}
                                   <span className="relative z-10">bKash</span>
                                 </motion.button>
                                 <motion.button
                                   onClick={() => setSubmitterPaymentMethod("nagad")}
                                   whileTap={{ scale: 0.9 }}
                                   className={`px-3 py-2.5 rounded-lg text-xs font-black transition-all relative overflow-hidden ${submitterPaymentMethod === "nagad" ? "text-foreground shadow-lg" : "text-muted-foreground"}`}
                                 >
                                   {submitterPaymentMethod === "nagad" && (
                                     <motion.div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--orange))] to-[hsl(25,85%,55%)]" layoutId="submitter-payment-bg" transition={{ type: "spring", bounce: 0.2 }} />
                                   )}
                                   <span className="relative z-10">Nagad</span>
                                 </motion.button>
                               </div>
                              <input type="text" placeholder="01XXXXXXXXX" value={submitterPaymentNumber}
                                onChange={(e) => setSubmitterPaymentNumber(e.target.value)} className="input-field" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <motion.button
                                whileTap={{ scale: 0.92 }}
                                onClick={() => submitIncomingRequestsMutation.mutate()}
                                className="relative py-3 rounded-xl font-black text-sm overflow-hidden"
                                disabled={isRequestLocked || submitIncomingRequestsMutation.isPending || !requestSubmitPassword || !submitterPaymentNumber.trim() || !submitterRate.trim() || !canSubmitList}>
                                <motion.div
                                  className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--emerald))] via-primary to-[hsl(var(--emerald))]"
                                  animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                  style={{ backgroundSize: "200% 100%" }}
                                />
                                <motion.div
                                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                                  animate={{ x: ["-100%", "200%"] }}
                                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                                />
                                <span className="relative z-10 text-primary-foreground flex items-center justify-center gap-1.5">
                                  {submitIncomingRequestsMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "Admin এ পাঠান"}
                                </span>
                              </motion.button>
                              <motion.button
                                whileTap={{ scale: 0.92 }}
                                onClick={() => { setShowRequestSubmitPassword(false); setRequestSubmitPassword(""); setSubmitterPaymentNumber(""); }}
                                className="px-4 py-3 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-colors font-bold text-sm">
                                Cancel
                              </motion.button>
                            </div>
                          </div>
                        ) : (
                          <motion.button
                            whileTap={{ scale: 0.92 }}
                            whileHover={{ scale: 1.03, y: -2 }}
                            onClick={() => {
                              if (!canSubmitList) {
                                toast({ title: `সর্বনিম্ন ${minRequestTarget} টি request দরকার`, description: `আপনার আছে ${incomingRequests.length} টি`, variant: "destructive" });
                                return;
                              }
                              setShowRequestSubmitPassword(true);
                            }}
                            className={`w-full relative py-3.5 rounded-2xl font-black overflow-hidden ${!canSubmitList ? "opacity-50" : ""}`}
                          >
                            <motion.div
                              className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--purple))] via-[hsl(var(--pink))] to-[hsl(var(--purple))]"
                              animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                              style={{ backgroundSize: "200% 100%" }}
                            />
                            <motion.div
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                              animate={{ x: ["-100%", "200%"] }}
                              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                            />
                            <span className="relative z-10 text-primary-foreground flex items-center justify-center gap-2">
                              📋 Full List Submit {minRequestTarget > 0 ? `(${incomingRequests.length}/${minRequestTarget})` : ""}
                            </span>
                          </motion.button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>}

        {/* Key Submitter */}
        <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible">
          <KeySubmitter />
        </motion.div>

        {/* Bonus Section */}
        {bonusEnabled && (
          <motion.div
            custom={4}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            <div className="relative overflow-hidden rounded-2xl border border-accent/30">
              <div className="absolute inset-0 bg-gradient-to-r from-accent/15 via-[hsl(var(--amber))]/10 to-[hsl(var(--orange))]/15" />
              <motion.div
                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-[length:200%_100%] bg-gradient-to-r from-transparent via-accent/10 to-transparent"
              />
              <div className="relative p-5 text-center">
                <p className="text-lg font-black text-accent mb-1">🔥 ধামাকা বোনাস অফার! 🔥</p>
                <p className="text-xs font-bold leading-relaxed text-foreground/80">
                  {targetAmount}টি ভেরিফাই করলে <span className="text-accent">বোনাস</span> পাবেন!
                </p>
              </div>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-border/50 space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">বোনাস প্রগ্রেস</p>
                <p className="text-xs font-mono bg-primary/20 text-primary px-2.5 py-1 rounded-lg font-bold">{user.key_count}/{targetAmount}</p>
              </div>
              <div className="w-full h-3 bg-secondary/80 rounded-full overflow-hidden border border-border/50">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((user.key_count / targetAmount) * 100, 100)}%` }}
                  transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full bg-gradient-to-r from-primary via-[hsl(var(--emerald))] to-[hsl(var(--cyan))] rounded-full relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-foreground/10 rounded-full" />
                </motion.div>
              </div>
              {user.key_count >= targetAmount ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-3 bg-primary/15 border border-primary/30 rounded-xl text-center"
                >
                  <p className="text-primary font-bold text-sm">🎉 বোনাসের জন্য এলিজিবল!</p>
                </motion.div>
              ) : (
                <p className="text-[10px] text-muted-foreground text-center">টার্গেট পূর্ণ হলে বোনাস আনলক হবে</p>
              )}
            </div>
          </motion.div>
        )}

      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-5 z-50 flex flex-col gap-3">
        {/* Install Button */}
        {!window.matchMedia("(display-mode: standalone)").matches && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate("/install")}
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] shadow-lg shadow-[hsl(var(--emerald))]/30 flex items-center justify-center"
          >
            <Download className="w-6 h-6 text-foreground" />
          </motion.button>
        )}

        {/* Feed & Chat moved to top bar */}
      </div>
    </div>
  );
}
