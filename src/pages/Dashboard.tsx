import { useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { KeySubmitter } from "@/components/KeySubmitter";
import { WithdrawForm } from "@/components/WithdrawForm";
import { TransactionList } from "@/components/TransactionList";
import { LogOut, User, Wallet, Copy, Check, Bell, Send, Loader2, XCircle, ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPublicSettings, updateUserPaymentStatus } from "@/lib/api";
import { createUserTransferRequest, getIncomingTransferRequests, submitIncomingTransferRequests } from "@/lib/user-requests";

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

  const bonusEnabled = publicSettings?.bonusStatus === "on";
  const targetAmount = publicSettings?.bonusTarget || 10;
  const customNoticeText = publicSettings?.customNotice;
  const minRequestVerified = publicSettings?.minRequestVerified || 10;
  const userVerifiedCount = user?.key_count || 0;
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
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-24 relative">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />
      </div>

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

      <header className="sticky top-0 z-50 glass-card border-b-0 rounded-none bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/profile")} className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center border border-border overflow-hidden hover:border-primary transition-colors">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            <div>
              <p className="text-xs text-muted-foreground">স্বাগতম,</p>
              <div className="flex flex-col">
                <p className="font-bold text-sm truncate max-w-[120px]">{user.display_name || user.guest_id}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground font-mono">ID: {user.guest_id}</p>
                  <button onClick={copyId} className="p-1 hover:bg-secondary rounded transition-colors">
                    {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <button onClick={() => { logout(); navigate("/"); }} className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-destructive transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-6 space-y-6 relative z-10">
        {/* User to User Request */}
        <section className="glass-card rounded-3xl border-2 border-primary/30 overflow-hidden">
          <button
            onClick={() => setShowRequestSection(!showRequestSection)}
            className="w-full p-6 flex items-center justify-between hover:bg-secondary/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Send className="w-6 h-6 text-primary" />
              <div className="text-left">
                <h2 className="text-xl font-bold">User Request পাঠান</h2>
                <p className="text-xs text-muted-foreground">ট্যাপ করে খুলুন</p>
              </div>
            </div>
            {showRequestSection ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>

          <AnimatePresence>
            {showRequestSection && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-6 pb-6 space-y-4">
                  {/* Minimum request notice */}
                  <div className="bg-[hsl(var(--amber))]/10 border border-[hsl(var(--amber))]/30 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-bold text-[hsl(var(--amber))]">📢 গুরুত্বপূর্ণ নোটিশ</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      রিকুয়েস্ট পাঠাতে হলে আপনার অ্যাকাউন্টে সর্বনিম্ন <span className="text-[hsl(var(--amber))] font-black text-sm">{minRequestVerified}</span> টি ভেরিফাইড কাউন্ট থাকতে হবে।
                    </p>
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      একসাথে <span className="text-primary font-bold">২০ টি</span> করতে পারলে <span className="text-primary font-bold">১০% বোনাস</span> এবং <span className="text-primary font-bold">৫০ টি</span> করতে পারলে <span className="text-primary font-bold">২০% বোনাস</span> পাবেন!
                    </p>
                  </div>

                  {!canSendRequest ? (
                    <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-center">
                      <p className="text-sm text-destructive font-bold">
                        আপনার ভেরিফাইড কাউন্ট: <span className="text-lg">{userVerifiedCount}</span> / {minRequestVerified}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">সর্বনিম্ন {minRequestVerified} টি ভেরিফাইড হলেই রিকুয়েস্ট পাঠাতে পারবেন।</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={requestTargetNumber}
                        onChange={(e) => setRequestTargetNumber(e.target.value)}
                        placeholder="যার কাছে রিকুয়েস্ট যাবে (01XXXXXXXXX)"
                        className="input-field"
                      />
                      <div className="bg-secondary/50 p-5 rounded-xl border border-border space-y-4">
                        <p className="text-base font-bold text-foreground">আপনার পেমেন্ট নম্বর</p>
                        <div className="grid grid-cols-2 gap-2 bg-secondary p-1.5 rounded-xl border border-border">
                          <button onClick={() => setRequestPaymentMethod("bkash")}
                            className={`px-4 py-2.5 rounded-lg text-sm font-black transition-all ${requestPaymentMethod === "bkash" ? "bg-[hsl(var(--pink))] text-foreground shadow-lg" : "text-muted-foreground"}`}>bKash</button>
                          <button onClick={() => setRequestPaymentMethod("nagad")}
                            className={`px-4 py-2.5 rounded-lg text-sm font-black transition-all ${requestPaymentMethod === "nagad" ? "bg-[hsl(var(--orange))] text-foreground shadow-lg" : "text-muted-foreground"}`}>Nagad</button>
                        </div>
                        <input type="text" placeholder="01XXXXXXXXX" value={requestPaymentNumber}
                          onChange={(e) => setRequestPaymentNumber(e.target.value)} className="input-field text-base py-3" />
                      </div>
                      <button onClick={() => createUserRequestMutation.mutate()} className="btn-primary py-4 font-black"
                        disabled={createUserRequestMutation.isPending || !requestTargetNumber.trim() || !requestPaymentNumber.trim()}>
                        {createUserRequestMutation.isPending ? <Loader2 className="animate-spin" /> : <><Send className="w-5 h-5" /> Request পাঠান</>}
                      </button>
                    </div>
                  )}

          <div className="border-t border-border pt-4 space-y-3">
            <h3 className="font-bold text-sm">আপনার নম্বরে আসা Request List ({incomingRequests.length})</h3>
            {incomingRequests.length === 0 ? (
              <p className="text-xs text-muted-foreground">এখনও কোনো request আসেনি।</p>
            ) : (
              <>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {incomingRequests.map((item) => (
                    <div key={item.id} className="bg-secondary/40 border border-border rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-foreground font-mono">{item.requester_guest_id}</p>
                        <span className="text-xs font-bold px-2 py-1 rounded-lg bg-primary/20 text-primary">
                          {item.requester_verified_count} verified
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                          item.requester_payment_method === "bkash" 
                            ? "bg-[hsl(var(--pink))]/20 text-[hsl(var(--pink))]" 
                            : "bg-[hsl(var(--orange))]/20 text-[hsl(var(--orange))]"
                        }`}>
                          {item.requester_payment_method?.toUpperCase() || "N/A"}
                        </span>
                        <span className="text-sm font-mono font-bold text-foreground">{item.requester_payment_number}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {showRequestSubmitPassword ? (
                  <div className="space-y-3 bg-secondary/30 p-4 rounded-xl border border-border">
                    <input
                      type="password"
                      value={requestSubmitPassword}
                      onChange={(e) => setRequestSubmitPassword(e.target.value)}
                      placeholder="পাসওয়ার্ড দিন"
                      className="input-field"
                    />
                    
                    <div className="bg-secondary/50 p-4 rounded-xl border border-border space-y-3">
                      <p className="text-sm font-bold text-foreground">আপনার bKash/Nagad নম্বর (Admin এ যাবে)</p>
                      <div className="grid grid-cols-2 gap-2 bg-secondary p-1.5 rounded-xl border border-border">
                        <button
                          onClick={() => setSubmitterPaymentMethod("bkash")}
                          className={`px-4 py-2.5 rounded-lg text-sm font-black transition-all ${submitterPaymentMethod === "bkash" ? "bg-[hsl(var(--pink))] text-foreground shadow-lg" : "text-muted-foreground"}`}
                        >
                          bKash
                        </button>
                        <button
                          onClick={() => setSubmitterPaymentMethod("nagad")}
                          className={`px-4 py-2.5 rounded-lg text-sm font-black transition-all ${submitterPaymentMethod === "nagad" ? "bg-[hsl(var(--orange))] text-foreground shadow-lg" : "text-muted-foreground"}`}
                        >
                          Nagad
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="01XXXXXXXXX"
                        value={submitterPaymentNumber}
                        onChange={(e) => setSubmitterPaymentNumber(e.target.value)}
                        className="input-field text-base py-3"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => submitIncomingRequestsMutation.mutate()}
                        className="btn-primary py-3"
                        disabled={submitIncomingRequestsMutation.isPending || !requestSubmitPassword || !submitterPaymentNumber.trim()}
                      >
                        {submitIncomingRequestsMutation.isPending ? <Loader2 className="animate-spin" /> : "Admin এ পাঠান"}
                      </button>
                      <button
                        onClick={() => { setShowRequestSubmitPassword(false); setRequestSubmitPassword(""); setSubmitterPaymentNumber(""); }}
                        className="px-4 py-3 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-colors font-bold"
                      >
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
        </section>

        {/* Custom Notice */}
        <AnimatePresence>
          {customNoticeText && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-primary/20 border-2 border-primary/40 rounded-2xl p-6 flex items-start gap-4 shadow-xl shadow-primary/10">
              <Bell className="w-10 h-10 text-primary shrink-0" />
              <p className="text-xl font-black leading-tight whitespace-pre-wrap">{customNoticeText}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bonus Section */}
        {bonusEnabled && (
          <div className="space-y-3">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-r from-accent/20 to-[hsl(var(--amber))]/20 border-2 border-accent/50 rounded-2xl p-6 text-center shadow-lg shadow-accent/10">
              <p className="text-xl font-black text-accent mb-2">🔥 ধামাকা বোনাস অফার! 🔥</p>
              <p className="text-sm font-bold leading-relaxed">
                {targetAmount}টি ভেরিফাই করলে <span className="text-accent text-lg">বোনাস</span> পাবেন!
              </p>
            </motion.div>

            <div className="glass-card p-5 rounded-3xl border border-border space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-sm font-bold">আজকের টার্গেট (Bonus)</p>
                <p className="text-xs font-mono bg-primary/20 text-primary px-2 py-1 rounded-lg">{user.key_count}/{targetAmount}</p>
              </div>
              <div className="w-full h-4 bg-secondary rounded-full overflow-hidden border border-border">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((user.key_count / targetAmount) * 100, 100)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-primary to-[hsl(var(--emerald))] rounded-full"
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0</span>
                <span className="text-primary font-bold">{user.key_count} সম্পন্ন</span>
                <span>{targetAmount}</span>
              </div>
              {user.key_count >= targetAmount ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-primary/20 border border-primary/40 rounded-xl text-center">
                  <p className="text-primary font-bold text-sm">🎉 আপনি বোনাসের জন্য এলিজিবল হয়েছেন!</p>
                </motion.div>
              ) : (
                <p className="text-[10px] text-muted-foreground text-center">টার্গেট পূর্ণ হলে বোনাস আনলক হবে</p>
              )}
            </div>
          </div>
        )}

        {/* Balance Card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary to-[hsl(var(--emerald))] rounded-3xl p-8 shadow-2xl shadow-primary/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-foreground/10 rounded-full blur-2xl transform translate-x-10 -translate-y-10" />
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div>
              <p className="text-primary-foreground/80 font-medium mb-1">মোট ভেরিফাইড কি</p>
              <h1 className="text-5xl font-bold tracking-tight text-primary-foreground">{user.key_count || 0}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-primary-foreground/60 text-sm relative z-10">
            <span className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse" />লাইভ আপডেট সক্রিয়
          </div>
        </motion.div>

        {/* Important Notice */}
        <div className="bg-accent/10 border border-accent/20 rounded-2xl p-4 text-accent">
          <p className="text-sm font-bold mb-1">গুরুত্বপূর্ণ নোটিশ:</p>
          <div className="space-y-2 text-xs leading-relaxed">
            <p>সবাইকে জানানো যাচ্ছে যে, একটি প্রাইভেট কি শুধুমাত্র একবারই সাবমিট করা যাবে।</p>
            <p className="font-bold border-t border-accent/20 pt-2">Account verified করে স্থানীয় অ্যাডমিনের কাছ থেকে নির্ধারিত পরিমাণ টাকা বুঝে নিন।</p>
          </div>
        </div>

        <KeySubmitter />

        <div className="pt-4">
          <h3 className="text-lg font-bold mb-4 px-2">Recent History</h3>
          <TransactionList />
        </div>
      </main>

      {/* Floating Chat Button */}
      <button
        onClick={() => navigate("/chat")}
        className="fixed bottom-6 right-6 z-50 bg-primary text-primary-foreground w-14 h-14 rounded-full shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-110 transition-transform"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    </div>
  );
}
