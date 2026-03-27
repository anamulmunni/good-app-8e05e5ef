import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { KeySubmitter } from "@/components/KeySubmitter";
import { WithdrawForm } from "@/components/WithdrawForm";
import { TransactionList } from "@/components/TransactionList";
import { LogOut, User, Wallet, Copy, Check, Bell, Send, Loader2, ChevronDown, ChevronUp, MessageCircle, Shield, Zap, TrendingUp, DollarSign, Newspaper, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPublicSettings, updateUserPaymentStatus } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { createUserTransferRequest, getIncomingTransferRequests, submitIncomingTransferRequests } from "@/lib/user-requests";

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
  const [showRequestSection, setShowRequestSection] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const { data: publicSettings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: getPublicSettings,
  });

  const { data: incomingRequests = [] } = useQuery({
    queryKey: ["incoming-user-transfer-requests", user?.guest_id],
    queryFn: () => getIncomingTransferRequests(user?.guest_id || ""),
    enabled: !!user?.guest_id,
  });

  const createUserRequestMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("ইউজার পাওয়া যায়নি");
      await createUserTransferRequest({
        requesterUserId: user.id,
        requesterGuestId: user.guest_id,
        requesterVerifiedCount: user.key_count || 0,
        requesterPaymentNumber: requestPaymentNumber.trim(),
        requesterPaymentMethod: requestPaymentMethod,
        targetGuestId: requestTargetNumber.trim(),
      });
    },
    onSuccess: () => {
      setRequestTargetNumber("");
      setRequestPaymentNumber("");
      toast({ title: "রিকুয়েস্ট পাঠানো হয়েছে" });
    },
    onError: (error: Error) => {
      toast({ title: "রিকুয়েস্ট পাঠানো যায়নি", description: error.message, variant: "destructive" });
    },
  });

  const submitIncomingRequestsMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("ইউজার পাওয়া যায়নি");
      return submitIncomingTransferRequests(
        user.guest_id,
        user.display_name || user.guest_id,
        requestSubmitPassword,
        submitterPaymentNumber.trim() || undefined,
        submitterPaymentNumber.trim() ? submitterPaymentMethod : undefined
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

  // Realtime: auto-refresh settings & user data when admin changes them
  useEffect(() => {
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

    return () => {
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(txChannel);
    };
  }, [user?.id, queryClient, refreshUser]);

  const bonusEnabled = publicSettings?.bonusStatus === "on";
  const targetAmount = publicSettings?.bonusTarget || 10;
  const customNoticeText = publicSettings?.customNotice;
  const minRequestVerified = publicSettings?.minRequestVerified || 10;
  const paymentMode = publicSettings?.paymentMode === "on";
  const currentRate = publicSettings?.rewardRate || 0;
  const userVerifiedCount = user?.key_count || 0;
  const displayBalance = paymentMode ? (user?.balance || 0) : 0;
  const canSendRequest = userVerifiedCount >= minRequestVerified;

  const copyId = () => {
    if (user?.guest_id) {
      navigator.clipboard.writeText(user.guest_id);
      setCopied(true);
      toast({ title: "ID কপি করা হয়েছে" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
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
    <div className="min-h-screen bg-background pb-24 relative">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary opacity-10 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[hsl(var(--purple))] opacity-[0.07] rounded-full blur-[150px]" />
        <div className="absolute top-[40%] left-[50%] w-[400px] h-[400px] bg-[hsl(var(--cyan))] opacity-[0.05] rounded-full blur-[150px]" />
      </div>

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
              <p className="font-bold text-sm truncate max-w-[140px]">{user.display_name || user.guest_id}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] text-muted-foreground font-mono">ID: {user.guest_id}</p>
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

      <main className="max-w-md mx-auto px-4 pt-6 space-y-5 relative z-10">
        {/* Stats Cards Row */}
        <div className="grid grid-cols-1 gap-3">
          {paymentMode ? (
            <motion.div
              custom={0}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              className="glass-card rounded-2xl border border-[hsl(var(--cyan))]/20 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--cyan))]/5 via-[hsl(var(--emerald))]/5 to-[hsl(var(--purple))]/5" />
              <motion.div
                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-[length:200%_100%] bg-gradient-to-r from-transparent via-[hsl(var(--cyan))]/5 to-transparent"
              />
              <div className="relative z-10 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[hsl(var(--cyan))]/30 to-[hsl(var(--emerald))]/20 flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-[hsl(var(--cyan))]" />
                    </div>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">আমার ওয়ালেট</p>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-[hsl(var(--emerald))]/15 border border-[hsl(var(--emerald))]/25">
                    <p className="text-sm font-black text-[hsl(var(--emerald))]">💰 {currentRate} TK/ভেরিফাই</p>
                  </div>
                </div>
                <div className="text-center py-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">মোট ব্যালেন্স</p>
                  <p className="text-5xl font-black bg-gradient-to-r from-[hsl(var(--cyan))] via-[hsl(var(--emerald))] to-primary bg-clip-text text-transparent">
                    {user.balance || 0}<span className="text-lg ml-1">৳</span>
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowWithdraw(!showWithdraw)}
                  className="w-full mt-4 py-3.5 rounded-xl bg-gradient-to-r from-[hsl(var(--cyan))] to-[hsl(var(--emerald))] text-background font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[hsl(var(--emerald))]/20"
                >
                  <Wallet className="w-4 h-4" />
                  উইথড্র করুন
                  <motion.div animate={{ rotate: showWithdraw ? 180 : 0 }} transition={{ duration: 0.3 }}>
                    <ChevronDown className="w-4 h-4" />
                  </motion.div>
                </motion.button>
              </div>
              <AnimatePresence>
                {showWithdraw && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="border-t border-[hsl(var(--cyan))]/10"
                  >
                    <div className="p-5">
                      <WithdrawForm balance={user.balance || 0} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              custom={0}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              className="glass-card rounded-2xl p-5 border border-primary/20 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">ভেরিফাইড</p>
                </div>
                <p className="text-3xl font-black text-foreground">{user.key_count || 0}</p>
              </div>
            </motion.div>
          )}
        </div>

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

        {/* Bonus Section */}
        {bonusEnabled && (
          <motion.div
            custom={3}
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


        {/* User Request Section - hidden when payment mode is ON */}
        {!paymentMode && <motion.section
          custom={4}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="glass-card rounded-2xl border border-primary/20 overflow-hidden"
        >
          <button
            onClick={() => setShowRequestSection(!showRequestSection)}
            className="w-full p-5 flex items-center justify-between hover:bg-secondary/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 to-[hsl(var(--cyan))]/20 flex items-center justify-center">
                <Send className="w-5 h-5 text-primary" />
              </div>
              <div className="text-left">
                <h2 className="text-base font-bold">User Request পাঠান</h2>
                <p className="text-[10px] text-muted-foreground">ট্যাপ করে খুলুন</p>
              </div>
            </div>
            <motion.div animate={{ rotate: showRequestSection ? 180 : 0 }} transition={{ duration: 0.3 }}>
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            </motion.div>
          </button>

          <AnimatePresence>
            {showRequestSection && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                <div className="px-5 pb-5 space-y-4">
                  {/* Minimum request notice */}
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

                  {!canSendRequest ? (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-center">
                      <p className="text-sm text-destructive font-bold">
                        {userVerifiedCount} / {minRequestVerified} ভেরিফাইড
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">সর্বনিম্ন {minRequestVerified} টি হলেই পাঠাতে পারবেন</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <input type="text" value={requestTargetNumber} onChange={(e) => setRequestTargetNumber(e.target.value)}
                        placeholder="যার কাছে রিকুয়েস্ট যাবে (01XXXXXXXXX)" className="input-field" />
                      <div className="bg-secondary/30 p-4 rounded-xl border border-border/50 space-y-3">
                        <p className="text-sm font-bold">আপনার পেমেন্ট নম্বর</p>
                        <div className="grid grid-cols-2 gap-2 bg-secondary/50 p-1 rounded-xl border border-border/50">
                          <button onClick={() => setRequestPaymentMethod("bkash")}
                            className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${requestPaymentMethod === "bkash" ? "bg-[hsl(var(--pink))] text-foreground shadow-lg" : "text-muted-foreground"}`}>bKash</button>
                          <button onClick={() => setRequestPaymentMethod("nagad")}
                            className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${requestPaymentMethod === "nagad" ? "bg-[hsl(var(--orange))] text-foreground shadow-lg" : "text-muted-foreground"}`}>Nagad</button>
                        </div>
                        <input type="text" placeholder="01XXXXXXXXX" value={requestPaymentNumber}
                          onChange={(e) => setRequestPaymentNumber(e.target.value)} className="input-field" />
                      </div>
                      <button onClick={() => createUserRequestMutation.mutate()} className="btn-primary py-3.5 font-black"
                        disabled={createUserRequestMutation.isPending || !requestTargetNumber.trim() || !requestPaymentNumber.trim()}>
                        {createUserRequestMutation.isPending ? <Loader2 className="animate-spin" /> : <><Send className="w-4 h-4" /> Request পাঠান</>}
                      </button>
                    </div>
                  )}

                  <div className="border-t border-border/50 pt-4 space-y-3">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">আসা Request ({incomingRequests.length})</h3>
                    {incomingRequests.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">কোনো request আসেনি</p>
                    ) : (
                      <>
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {incomingRequests.map((item) => (
                            <motion.div
                              key={item.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="bg-secondary/30 border border-border/50 rounded-xl p-3.5 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-bold font-mono">{item.requester_guest_id}</p>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-primary/20 text-primary">
                                  {item.requester_verified_count} ✓
                                </span>
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
                            <div className="bg-secondary/30 p-3 rounded-xl border border-border/50 space-y-3">
                              <p className="text-xs font-bold">আপনার bKash/Nagad নম্বর</p>
                              <div className="grid grid-cols-2 gap-2 bg-secondary/50 p-1 rounded-xl border border-border/50">
                                <button onClick={() => setSubmitterPaymentMethod("bkash")}
                                  className={`px-3 py-2 rounded-lg text-xs font-black transition-all ${submitterPaymentMethod === "bkash" ? "bg-[hsl(var(--pink))] text-foreground shadow-lg" : "text-muted-foreground"}`}>bKash</button>
                                <button onClick={() => setSubmitterPaymentMethod("nagad")}
                                  className={`px-3 py-2 rounded-lg text-xs font-black transition-all ${submitterPaymentMethod === "nagad" ? "bg-[hsl(var(--orange))] text-foreground shadow-lg" : "text-muted-foreground"}`}>Nagad</button>
                              </div>
                              <input type="text" placeholder="01XXXXXXXXX" value={submitterPaymentNumber}
                                onChange={(e) => setSubmitterPaymentNumber(e.target.value)} className="input-field" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button onClick={() => submitIncomingRequestsMutation.mutate()} className="btn-primary py-3"
                                disabled={submitIncomingRequestsMutation.isPending || !requestSubmitPassword || !submitterPaymentNumber.trim()}>
                                {submitIncomingRequestsMutation.isPending ? <Loader2 className="animate-spin" /> : "Admin এ পাঠান"}
                              </button>
                              <button onClick={() => { setShowRequestSubmitPassword(false); setRequestSubmitPassword(""); setSubmitterPaymentNumber(""); }}
                                className="px-4 py-3 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-colors font-bold text-sm">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setShowRequestSubmitPassword(true)} className="btn-primary py-3">
                            Full List Submit
                          </button>
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
        <motion.div custom={5} variants={cardVariants} initial="hidden" animate="visible">
          <KeySubmitter />
        </motion.div>

        {/* Transaction History */}
        <motion.div custom={6} variants={cardVariants} initial="hidden" animate="visible" className="pt-2">
          <div className="flex items-center gap-2 mb-4 px-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent History</h3>
          </div>
          <TransactionList />
        </motion.div>
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

        {/* Feed Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate("/feed")}
          className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--amber))] to-[hsl(var(--orange))] shadow-lg shadow-[hsl(var(--amber))]/30 flex items-center justify-center"
        >
          <Newspaper className="w-6 h-6 text-foreground" />
        </motion.button>

        {/* Chat Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate("/chat")}
          className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--cyan))] to-[hsl(var(--blue))] shadow-lg shadow-[hsl(var(--cyan))]/40 flex items-center justify-center"
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[hsl(var(--cyan))] to-[hsl(var(--blue))] animate-pulse opacity-40" />
          <MessageCircle className="w-6 h-6 text-foreground relative z-10 fill-foreground/20" />
        </motion.button>
      </div>
    </div>
  );
}
