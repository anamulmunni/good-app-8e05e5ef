import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  getAllUsers, getAllTransactions, getPublicSettings, getPoolStats,
  getSubmittedNumbers, getResetHistory, getPaymentUsers,
  toggleBlockUser, updateUserBalance, resetUserKeyCount,
  updateTransactionStatus, updateSetting, deletePoolKey, deleteUsedKeys, deleteAllPoolKeys,
  addSubmittedNumbers, deleteSubmittedNumber, clearAllSubmittedNumbers,
  addResetHistory,
} from "@/lib/api";
import { getUserRequestSubmissions } from "@/lib/user-requests";
import { ShieldCheck, UserX, UserCheck, CheckCircle, XCircle, Loader2, Coins, Key, Search, RefreshCcw, Copy, Users, ChevronDown, ChevronUp, Trash2, Bell, Send, History, Lock, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_PASSWORD = "Anamul-963050";
const POOL_SECRET = "Anamul-984516";

export default function AdminPanel() {
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [newBalance, setNewBalance] = useState("");
  const [rewardRate, setRewardRate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showActiveUsers, setShowActiveUsers] = useState(false);
  const [showPoolList, setShowPoolList] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [showPaymentLists, setShowPaymentLists] = useState(false);
  const [showSubmittedNumbers, setShowSubmittedNumbers] = useState(false);
  const [showUserRequestSubmissions, setShowUserRequestSubmissions] = useState(false);
  const [showResetHistory, setShowResetHistory] = useState(false);
  const [resetHistorySearch, setResetHistorySearch] = useState("");
  const [poolPassword, setPoolPassword] = useState("");
  const [batchNumbers, setBatchNumbers] = useState("");
  const [buyStatus, setBuyStatus] = useState("on");
  const [bonusStatus, setBonusStatus] = useState("off");
  const [bonusTarget, setBonusTarget] = useState("10");
  const [customNotice, setCustomNotice] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [paymentNumberSearch, setPaymentNumberSearch] = useState("");
  const [showPaymentSearch, setShowPaymentSearch] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [userMgmtSearch, setUserMgmtSearch] = useState("");
  const [editingPasswordUserId, setEditingPasswordUserId] = useState<number | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [showPassword, setShowPassword] = useState<Record<number, boolean>>({});
  const [resettingPassword, setResettingPassword] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pool } = useQuery({ queryKey: ["admin-pool"], queryFn: getPoolStats, enabled: isLoggedIn });
  const { data: users } = useQuery({ queryKey: ["admin-users"], queryFn: getAllUsers, enabled: isLoggedIn });
  const { data: allTx } = useQuery({ queryKey: ["admin-transactions"], queryFn: getAllTransactions, enabled: isLoggedIn });
  const { data: settingsData } = useQuery({ queryKey: ["admin-settings"], queryFn: getPublicSettings, enabled: isLoggedIn });
  const { data: submittedNumbers } = useQuery({ queryKey: ["admin-submitted"], queryFn: getSubmittedNumbers, enabled: isLoggedIn });
  const { data: userRequestSubmissions } = useQuery({
    queryKey: ["admin-user-request-submissions"],
    queryFn: getUserRequestSubmissions,
    enabled: isLoggedIn && showUserRequestSubmissions,
  });
  const { data: resetHistoryData } = useQuery({ queryKey: ["admin-reset-history"], queryFn: getResetHistory, enabled: isLoggedIn && (showResetHistory || showPaymentSearch) });
  const { data: receivedList } = useQuery({ queryKey: ["admin-payments-received"], queryFn: () => getPaymentUsers("received"), enabled: isLoggedIn && showPaymentLists });
  const { data: notReceivedList } = useQuery({ queryKey: ["admin-payments-not-received"], queryFn: () => getPaymentUsers("not_received"), enabled: isLoggedIn && showPaymentLists });

  const withdrawals = allTx?.filter(t => t.type === "withdrawal") || [];

  useEffect(() => {
    if (settingsData) {
      setRewardRate(String(settingsData.rewardRate));
      setBuyStatus(settingsData.buyStatus);
      setBonusStatus(settingsData.bonusStatus);
      setBonusTarget(String(settingsData.bonusTarget));
      setCustomNotice(settingsData.customNotice);
      setVideoUrl(settingsData.videoUrl || "");
    }
  }, [settingsData]);

  const blockMutation = useMutation({
    mutationFn: ({ id, isBlocked }: { id: number; isBlocked: boolean }) => toggleBlockUser(id, isBlocked),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); toast({ title: "আপডেট হয়েছে" }); },
  });

  const balanceMutation = useMutation({
    mutationFn: ({ id, balance }: { id: number; balance: number }) => updateUserBalance(id, balance),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); setEditingUserId(null); setNewBalance(""); toast({ title: "ব্যালেন্স আপডেট হয়েছে" }); },
  });

  const resetCountMutation = useMutation({
    mutationFn: async (id: number) => {
      const user = users?.find(u => u.id === id);
      if (user) {
        const submittedInfo = submittedNumbers?.find(s => s.phone_number === user.guest_id);
        await addResetHistory(
          user.guest_id,
          user.key_count,
          "Admin",
          submittedInfo?.payment_number || undefined,
          submittedInfo?.payment_method || undefined
        );
        await resetUserKeyCount(id);
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); queryClient.invalidateQueries({ queryKey: ["admin-reset-history"] }); toast({ title: "কাউন্ট রিসেট হয়েছে" }); },
  });

  const rateMutation = useMutation({
    mutationFn: async (data: { rate?: number; status?: string; bonusStatus?: string; bonusTarget?: number; customNotice?: string; videoUrl?: string }) => {
      if (data.rate) await updateSetting("rewardRate", String(data.rate));
      if (data.status) await updateSetting("buyStatus", data.status);
      if (data.bonusStatus) await updateSetting("bonusStatus", data.bonusStatus);
      if (data.bonusTarget) await updateSetting("bonusTarget", String(data.bonusTarget));
      if (data.customNotice !== undefined) await updateSetting("customNotice", data.customNotice);
      if (data.videoUrl !== undefined) await updateSetting("videoUrl", data.videoUrl);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-settings"] }); queryClient.invalidateQueries({ queryKey: ["public-settings"] }); toast({ title: "সেটিংস আপডেট হয়েছে" }); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateTransactionStatus(id, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-transactions"] }); toast({ title: "স্ট্যাটাস আপডেট হয়েছে" }); },
  });

  const deletePoolMutation = useMutation({
    mutationFn: (id: number) => deletePoolKey(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-pool"] }); toast({ title: "কি ডিলিট হয়েছে" }); },
  });

  const deleteUsedKeysMutation = useMutation({
    mutationFn: deleteUsedKeys,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-pool"] }); toast({ title: "সব Used Key ডিলিট হয়েছে" }); },
  });

  const deleteAllKeysMutation = useMutation({
    mutationFn: deleteAllPoolKeys,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-pool"] }); toast({ title: "সব Key ডিলিট হয়েছে" }); },
  });

  const clearSubmittedMutation = useMutation({
    mutationFn: clearAllSubmittedNumbers,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-submitted"] }); toast({ title: "সব নম্বর ক্লিয়ার হয়েছে" }); },
  });

  const deleteSubmittedMutation = useMutation({
    mutationFn: (id: number) => deleteSubmittedNumber(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-submitted"] }); toast({ title: "ডিলিট হয়েছে" }); },
  });

  const batchResetMutation = useMutation({
    mutationFn: async (numbers: string[]) => {
      for (const phoneNumber of numbers) {
        const user = users?.find(u => u.guest_id === phoneNumber);
        if (user) {
          const submittedInfo = submittedNumbers?.find(s => s.phone_number === phoneNumber);
          await addResetHistory(
            phoneNumber,
            user.key_count,
            "Admin",
            submittedInfo?.payment_number || undefined,
            submittedInfo?.payment_method || undefined
          );
          await resetUserKeyCount(user.id);
        }
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); queryClient.invalidateQueries({ queryKey: ["admin-reset-history"] }); setBatchNumbers(""); toast({ title: "রিসেট হয়েছে" }); },
  });

  const filteredUsers = users?.filter(u => searchQuery ? u.guest_id.toLowerCase().includes(searchQuery.toLowerCase()) : true);

  const getBatchInfo = () => {
    const lines = batchNumbers.split("\n").map(l => l.trim()).filter(Boolean);
    let totalVerified = 0;
    const details = lines.map(num => {
      const u = users?.find(u => u.guest_id === num);
      totalVerified += u?.key_count || 0;
      return { num, count: u?.key_count || 0 };
    });
    return { totalVerified, details };
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="glass-card p-8 rounded-3xl w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">Admin Access</h1>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && password === ADMIN_PASSWORD) setIsLoggedIn(true); }}
            placeholder="Password..." className="input-field mb-4" />
          <button onClick={() => { if (password === ADMIN_PASSWORD) setIsLoggedIn(true); else toast({ title: "ভুল পাসওয়ার্ড", variant: "destructive" }); }}
            className="btn-primary">Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-8 pb-24">
        <header className="flex items-center gap-4">
          <ShieldCheck className="w-10 h-10 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">মোট ইউজার: <span className="text-primary font-bold">{users?.length || 0}</span> জন</p>
          </div>
        </header>

        {/* Notice & Bonus Settings */}
        <div className="glass-card p-6 rounded-3xl">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Bell className="w-5 h-5 text-primary" /> নোটিশ এবং বোনাস সেটিংস</h3>
          <div className="space-y-4">
            <textarea value={customNotice} onChange={(e) => setCustomNotice(e.target.value)} className="input-field h-24" placeholder="নোটিশ লিখুন..." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">বোনাস স্ট্যাটাস</label>
                <select value={bonusStatus} onChange={(e) => setBonusStatus(e.target.value)} className="input-field">
                  <option value="on">On</option><option value="off">Off</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">বোনাস টার্গেট</label>
                <input type="number" value={bonusTarget} onChange={(e) => setBonusTarget(e.target.value)} className="input-field" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">ভিডিও লিঙ্ক (ইউজারদের দেখানো হবে)</label>
              <input type="text" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="input-field" placeholder="https://youtube.com/..." />
            </div>
            <button onClick={() => rateMutation.mutate({ customNotice, bonusStatus, bonusTarget: parseInt(bonusTarget), videoUrl })}
              disabled={rateMutation.isPending} className="btn-primary py-3">
              {rateMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "সেটিংস সেভ করুন"}
            </button>
          </div>
        </div>

        {/* User Request Submissions */}
        <section className="glass-card p-6 rounded-2xl border-2 border-primary/30">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowUserRequestSubmissions(!showUserRequestSubmissions)}>
            <div className="flex items-center gap-3">
              <Send className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-bold">ইউজার Request Submission ({userRequestSubmissions?.length || 0})</h2>
            </div>
            {showUserRequestSubmissions ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>

          {showUserRequestSubmissions && (
            <div className="mt-6 space-y-4">
              {userRequestSubmissions && userRequestSubmissions.length > 0 ? (
                userRequestSubmissions.map((batch) => (
                  <div key={batch.id} className="bg-secondary/50 border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm font-bold">Target: {batch.target_guest_id}</p>
                        <p className="text-xs text-muted-foreground">
                          {batch.target_display_name || "Unknown"} • Verified: {batch.target_verified_count} • Submitter: {batch.submitted_to_admin_by}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{new Date(batch.submitted_at).toLocaleString("bn-BD")}</p>
                      </div>
                      <span className="text-xs font-bold px-2 py-1 rounded-lg bg-primary/20 text-primary">{batch.request_count} requests</span>
                    </div>

                    <div className="space-y-2 border-t border-border pt-3">
                      {batch.requests.map((request) => (
                        <div key={request.id} className="p-2 rounded-lg bg-background/50 border border-border/60">
                          <p className="text-xs text-muted-foreground">
                            From <span className="font-mono text-foreground font-bold">{request.requester_guest_id}</span> • Verified: <span className="text-primary font-bold">{request.requester_verified_count}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Payment: <span className="text-foreground font-bold">{request.requester_payment_method?.toUpperCase()} - {request.requester_payment_number}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">এখনও কোনো submission আসেনি।</p>
              )}
            </div>
          )}
        </section>

        {/* Submitted Numbers */}
        <section className="glass-card p-6 rounded-2xl border-2 border-[hsl(var(--purple))]/30">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowSubmittedNumbers(!showSubmittedNumbers)}>
            <div className="flex items-center gap-3"><Send className="w-6 h-6 text-[hsl(var(--purple))]" /><h2 className="text-xl font-bold">সাবমিটেড নম্বর ({submittedNumbers?.length || 0})</h2></div>
            {showSubmittedNumbers ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
          {showSubmittedNumbers && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[hsl(var(--purple))]">মোট ভেরিফাইড: {submittedNumbers?.reduce((sum, s) => {
                  const u = users?.find(u => u.guest_id === s.phone_number);
                  return sum + (u?.key_count || 0);
                }, 0) || 0}</p>
                <button onClick={() => clearSubmittedMutation.mutate()} disabled={clearSubmittedMutation.isPending} className="px-4 py-2 bg-destructive text-destructive-foreground font-bold rounded-xl text-sm flex items-center gap-2">
                  {clearSubmittedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCcw className="w-4 h-4" /> Reset All</>}
                </button>
              </div>
              {submittedNumbers?.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl border border-border">
                  <div><p className="font-mono text-sm font-bold">{item.phone_number}</p><p className="text-[10px] text-muted-foreground">{item.submitted_by} {item.payment_number ? `| ${item.payment_method?.toUpperCase()}: ${item.payment_number}` : ""}</p></div>
                  <div className="flex items-center gap-2">
                    <span className="text-primary font-bold text-sm bg-primary/10 px-2 py-1 rounded-lg">{users?.find(u => u.guest_id === item.phone_number)?.key_count || 0} টা</span>
                    <button onClick={async () => {
                      const user = users?.find(u => u.guest_id === item.phone_number);
                      await addResetHistory(item.phone_number, user?.key_count || item.verified_count, item.submitted_by, item.payment_number || undefined, item.payment_method || undefined);
                      if (user) await resetUserKeyCount(user.id);
                      await deleteSubmittedNumber(item.id);
                      queryClient.invalidateQueries({ queryKey: ["admin-submitted"] });
                      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
                      queryClient.invalidateQueries({ queryKey: ["admin-reset-history"] });
                      toast({ title: "রিসেট হয়ে হিস্ট্রিতে সেভ হয়েছে" });
                    }} className="px-2 py-1 bg-[hsl(var(--cyan))]/20 text-[hsl(var(--cyan))] font-bold rounded-lg text-xs hover:bg-[hsl(var(--cyan))]/30">Reset</button>
                    <button onClick={() => deleteSubmittedMutation.mutate(item.id)} className="p-1.5 hover:bg-destructive/20 rounded-lg text-destructive"><XCircle className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Payment Number Search */}
        <section className="glass-card p-6 rounded-2xl border-2 border-[hsl(var(--amber))]/30">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowPaymentSearch(!showPaymentSearch)}>
            <div className="flex items-center gap-3"><Search className="w-6 h-6 text-[hsl(var(--amber))]" /><h2 className="text-xl font-bold">পেমেন্ট নম্বর দিয়ে সার্চ</h2></div>
            {showPaymentSearch ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
          {showPaymentSearch && (
            <div className="mt-6 space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="bKash/Nagad নম্বর দিন..." value={paymentNumberSearch} onChange={(e) => setPaymentNumberSearch(e.target.value)} className="input-field pl-10" />
              </div>
              {paymentNumberSearch.trim() && (
                <>
                  {/* Submitted Numbers Results */}
                  {(() => {
                    const q = paymentNumberSearch.trim();
                    const results = submittedNumbers?.filter(s => 
                      s.payment_number?.includes(q) || s.phone_number.includes(q) || s.submitted_by?.includes(q)
                    ) || [];
                    if (results.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">সাবমিটেড নম্বরে কিছু পাওয়া যায়নি</p>;
                    return (
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-[hsl(var(--amber))]">সাবমিটেড রেকর্ড ({results.length}টি)</p>
                        {results.map(item => (
                          <div key={item.id} className="bg-secondary/50 border border-[hsl(var(--amber))]/20 rounded-xl p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-sm font-bold">{item.phone_number}</span>
                              <span className="text-primary font-bold text-sm bg-primary/10 px-2 py-1 rounded-lg">{users?.find(u => u.guest_id === item.phone_number)?.key_count || 0} টা ভেরিফাইড</span>
                            </div>
                            <p className="text-xs text-muted-foreground">অ্যাডমিন: <span className="text-foreground font-bold">{item.submitted_by}</span></p>
                            <p className="text-xs text-muted-foreground">পেমেন্ট: <span className="text-foreground font-bold">{item.payment_method?.toUpperCase()} - {item.payment_number}</span></p>
                            <p className="text-[10px] text-muted-foreground">{new Date(item.submitted_at || "").toLocaleString("bn-BD")}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Reset History Results */}
                  {(() => {
                    const results = resetHistoryData?.filter(r => 
                      r.payment_number?.includes(paymentNumberSearch.trim()) || r.phone_number.includes(paymentNumberSearch.trim()) || r.submitted_by?.includes(paymentNumberSearch.trim())
                    ) || [];
                    if (results.length === 0 && !resetHistoryData) return <p className="text-xs text-muted-foreground">রিসেট হিস্ট্রি লোড করতে উপরের সেকশন খুলুন</p>;
                    if (results.length === 0) return null;
                    return (
                      <div className="space-y-2 mt-4">
                        <p className="text-sm font-bold text-[hsl(var(--cyan))]">রিসেট পরবর্তী রেকর্ড ({results.length}টি)</p>
                        {results.map(item => (
                          <div key={item.id} className="bg-secondary/50 border border-[hsl(var(--cyan))]/20 rounded-xl p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-sm font-bold">{item.phone_number}</span>
                              <span className="text-[hsl(var(--cyan))] font-bold text-sm bg-[hsl(var(--cyan))]/10 px-2 py-1 rounded-lg">{item.verified_count} টা (রিসেটের আগে)</span>
                            </div>
                            <p className="text-xs text-muted-foreground">অ্যাডমিন: <span className="text-foreground font-bold">{item.submitted_by}</span></p>
                            <p className="text-xs text-muted-foreground">পেমেন্ট: <span className="text-foreground font-bold">{item.payment_method?.toUpperCase()} - {item.payment_number}</span></p>
                            <p className="text-[10px] text-muted-foreground">রিসেট: {new Date(item.reset_at || "").toLocaleString("bn-BD")}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </section>

        {/* Reset History */}
        <section className="glass-card p-6 rounded-2xl border-2 border-[hsl(var(--cyan))]/30">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowResetHistory(!showResetHistory)}>
            <div className="flex items-center gap-3"><History className="w-6 h-6 text-[hsl(var(--cyan))]" /><h2 className="text-xl font-bold">রিসেট হিস্ট্রি</h2></div>
            {showResetHistory ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
          {showResetHistory && (
            <div className="mt-6 space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="নম্বর দিয়ে সার্চ..." value={resetHistorySearch} onChange={(e) => setResetHistorySearch(e.target.value)} className="input-field pl-10" />
              </div>
              {resetHistoryData?.filter(i => !resetHistorySearch || i.phone_number.includes(resetHistorySearch)).map(item => {
                const matchedUser = users?.find(u => u.guest_id === item.phone_number);
                return (
                  <div key={item.id} className="bg-secondary/50 border border-[hsl(var(--cyan))]/10 rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-secondary border border-border flex-shrink-0 flex items-center justify-center">
                        {matchedUser?.avatar_url ? (
                          <img src={matchedUser.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Users className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-mono text-sm font-bold">{item.phone_number}</span>
                            {matchedUser?.display_name && <span className="text-xs text-muted-foreground ml-2">({matchedUser.display_name})</span>}
                          </div>
                          <span className="text-primary font-bold text-sm bg-primary/10 px-2 py-1 rounded-lg">{item.verified_count} টা</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">অ্যাডমিন: {item.submitted_by} | {new Date(item.reset_at || "").toLocaleString("bn-BD")}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Search */}
        <div className="relative">
          <Search className="w-6 h-6 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search User by ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-12 h-14 text-lg bg-secondary/50 border-primary/20 focus:border-primary shadow-xl" />
        </div>

        {/* Payment Lists */}
        <section className="glass-card p-6 rounded-2xl border-2 border-primary/30">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowPaymentLists(!showPaymentLists)}>
            <div className="flex items-center gap-3"><CheckCircle className="w-6 h-6 text-primary" /><h2 className="text-xl font-bold">পেমেন্ট কনফার্মেশন</h2></div>
            {showPaymentLists ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
          {showPaymentLists && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-bold text-primary flex items-center gap-2"><CheckCircle className="w-4 h-4" /> হ্যাঁ (পেয়েছে)</h3>
                {receivedList?.map(u => (<div key={u.id} className="p-3 bg-primary/10 rounded-xl border border-primary/20 text-xs">{u.guest_id} ({u.display_name})</div>))}
              </div>
              <div className="space-y-4">
                <h3 className="font-bold text-destructive flex items-center gap-2"><XCircle className="w-4 h-4" /> না (পায়নি)</h3>
                {notReceivedList?.map(u => (<div key={u.id} className="p-3 bg-destructive/10 rounded-xl border border-destructive/20 text-xs">{u.guest_id} ({u.display_name})</div>))}
              </div>
            </div>
          )}
        </section>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-card p-5 rounded-2xl bg-primary/10 border border-primary/30">
            <div className="flex items-center gap-3"><Key className="w-8 h-8 text-primary" /><div><p className="text-xs text-muted-foreground">Ready Keys</p><p className="text-3xl font-black text-primary">{pool?.filter(p => !p.is_used).length || 0}</p></div></div>
          </div>
          <div className="glass-card p-5 rounded-2xl bg-[hsl(var(--blue))]/10 border border-[hsl(var(--blue))]/30 cursor-pointer" onClick={() => setShowActiveUsers(!showActiveUsers)}>
            <div className="flex items-center gap-3"><Users className="w-8 h-8 text-[hsl(var(--blue))]" /><div><p className="text-xs text-muted-foreground">Active Users</p><p className="text-3xl font-black text-[hsl(var(--blue))]">{users?.filter(u => u.key_count >= 1).length || 0}</p></div></div>
          </div>
        </div>

        {showActiveUsers && (
          <section className="glass-card p-6 rounded-2xl border-2 border-[hsl(var(--blue))]/30">
            <h3 className="text-lg font-bold mb-4 text-[hsl(var(--blue))]">Active Users</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {users?.filter(u => u.key_count >= 1).map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl">
                  <span className="font-medium text-sm truncate max-w-[200px]">{u.guest_id}</span>
                  <span className="text-primary font-bold text-sm">{u.key_count} টা</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* System Settings */}
        <section className="glass-card p-6 rounded-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3"><Coins className="w-6 h-6 text-primary" /><h2 className="text-xl font-bold">সিস্টেম সেটিংস</h2></div>
            <div className="flex items-center gap-2 bg-secondary p-1 rounded-xl border border-border">
              <button onClick={() => rateMutation.mutate({ status: "on" })} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${buyStatus === "on" ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground"}`}>Buy ON</button>
              <button onClick={() => rateMutation.mutate({ status: "off" })} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${buyStatus === "off" ? "bg-destructive text-destructive-foreground shadow-lg" : "text-muted-foreground"}`}>Buy OFF</button>
            </div>
          </div>
          <div className="pt-4 border-t border-border">
            <label className="text-sm text-muted-foreground mb-1 block">Reward Rate (TK per Key)</label>
            <div className="flex gap-2">
              <input type="number" value={rewardRate} onChange={(e) => setRewardRate(e.target.value)} className="input-field" />
              <button onClick={() => rateMutation.mutate({ rate: parseInt(rewardRate) })} className="btn-primary w-auto" disabled={rateMutation.isPending}>Update</button>
            </div>
          </div>
        </section>

        {/* Add Keys Link */}
        <section className="glass-card p-6 rounded-2xl">
          <a href="/add-keys" className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3"><Key className="w-6 h-6 text-primary" /><div><h2 className="text-xl font-bold">পুলে কি যোগ করুন</h2><p className="text-xs text-muted-foreground">আলাদা পেজে গিয়ে কি যোগ করুন</p></div></div>
            <ChevronDown className="w-5 h-5 -rotate-90" />
          </a>
        </section>

        {/* Pool List */}
        <section className="glass-card rounded-2xl overflow-hidden border-2 border-primary/30">
          <button onClick={() => setShowPoolList(!showPoolList)} className="w-full p-6 flex items-center justify-between hover:bg-secondary/20 transition-colors">
            <h3 className="text-xl font-bold flex items-center gap-2"><Key className="w-5 h-5 text-primary" /> পুল কি লিস্ট ({pool?.length || 0})</h3>
            {showPoolList ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          {showPoolList && (
            <div className="p-6 border-t border-border">
              {poolPassword !== POOL_SECRET ? (
                <div className="space-y-4 text-center">
                  <p className="text-muted-foreground">পাসওয়ার্ড দিন:</p>
                  <input type="password" placeholder="পাসওয়ার্ড..." className="input-field max-w-sm mx-auto" onChange={(e) => setPoolPassword(e.target.value)} />
                </div>
              ) : (
                <div className="space-y-4">
                  <button onClick={() => { navigator.clipboard.writeText(pool?.map(i => i.private_key).join("\n") || ""); toast({ title: "সব Key কপি হয়েছে" }); }}
                    className="btn-primary bg-[hsl(var(--emerald))]"><Copy className="w-4 h-4" /> সব Private Key কপি ({pool?.length || 0})</button>
                    {pool?.some(p => p.is_used) && (
                      <button onClick={() => deleteUsedKeysMutation.mutate()} disabled={deleteUsedKeysMutation.isPending}
                        className="btn-primary bg-destructive">
                        {deleteUsedKeysMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4" /> সব Used Key ডিলিট ({pool?.filter(p => p.is_used).length})</>}
                      </button>
                    )}
                    {pool && pool.length > 0 && (
                      <button onClick={() => { if (confirm("সত্যিই সব Key ডিলিট করতে চান?")) deleteAllKeysMutation.mutate(); }} disabled={deleteAllKeysMutation.isPending}
                        className="btn-primary bg-destructive/80">
                        {deleteAllKeysMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4" /> সব Key ডিলিট ({pool?.length})</>}
                      </button>
                    )}
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {pool?.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl border border-border">
                        <div className="flex-1 truncate mr-4">
                          <p className="text-xs font-mono truncate">{item.private_key}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[10px] text-muted-foreground truncate">{item.verify_url}</p>
                            {item.added_by !== "Unknown" && <span className="text-[9px] bg-[hsl(var(--blue))]/20 text-[hsl(var(--blue))] px-1.5 py-0.5 rounded font-bold shrink-0">{item.added_by}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${item.is_used ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"}`}>{item.is_used ? "USED" : "READY"}</span>
                          <button onClick={() => deletePoolMutation.mutate(item.id)} className="text-destructive hover:bg-destructive/10 p-1 rounded"><XCircle className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* User Management */}
        <section className="glass-card p-6 rounded-2xl border-2 border-[hsl(var(--emerald))]/30">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowUserManagement(!showUserManagement)}>
            <div className="flex items-center gap-3"><Lock className="w-6 h-6 text-[hsl(var(--emerald))]" /><h2 className="text-xl font-bold">ইউজার ম্যানেজমেন্ট ({users?.length || 0})</h2></div>
            {showUserManagement ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
          {showUserManagement && (
            <div className="mt-6 space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="ফোন নম্বর দিয়ে সার্চ করুন..." value={userMgmtSearch} onChange={(e) => setUserMgmtSearch(e.target.value)} className="input-field pl-10" />
              </div>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {users?.filter(u => !userMgmtSearch || u.guest_id.includes(userMgmtSearch)).map(u => (
                  <div key={u.id} className="bg-secondary/50 border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-mono text-sm font-bold">{u.guest_id}</p>
                        <p className="text-xs text-muted-foreground">{u.display_name || "Unknown"} • Verified: <span className="text-primary font-bold">{u.key_count || 0}</span></p>
                        {u.email && <p className="text-[10px] text-muted-foreground">Email: {u.email}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => blockMutation.mutate({ id: u.id, isBlocked: !u.is_blocked })}
                          className={`p-2 rounded-lg transition-colors ${u.is_blocked ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"}`}>
                          {u.is_blocked ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                        </button>
                        <button onClick={() => resetCountMutation.mutate(u.id)} className="p-2 hover:bg-secondary rounded-lg text-muted-foreground hover:text-primary transition-colors">
                          <RefreshCcw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Password Change */}
                    {editingPasswordUserId === u.id ? (
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showPassword[u.id] ? "text" : "password"}
                            value={newPasswordValue}
                            onChange={(e) => setNewPasswordValue(e.target.value)}
                            placeholder="নতুন পাসওয়ার্ড..."
                            className="input-field pr-10 text-sm"
                          />
                          <button onClick={() => setShowPassword(p => ({ ...p, [u.id]: !p[u.id] }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showPassword[u.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <button
                          disabled={resettingPassword || !newPasswordValue || newPasswordValue.length < 6}
                          onClick={async () => {
                            if (!u.auth_id) { toast({ title: "এই ইউজারের auth ID নেই", variant: "destructive" }); return; }
                            setResettingPassword(true);
                            try {
                              const { data, error } = await supabase.functions.invoke("admin-reset-password", {
                                body: { auth_id: u.auth_id, new_password: newPasswordValue, admin_password: ADMIN_PASSWORD },
                              });
                              if (error) throw error;
                              if (data?.error) throw new Error(data.error);
                              toast({ title: "পাসওয়ার্ড পরিবর্তন হয়েছে ✓" });
                              setEditingPasswordUserId(null);
                              setNewPasswordValue("");
                            } catch (err: any) {
                              toast({ title: "ব্যর্থ", description: err.message, variant: "destructive" });
                            } finally {
                              setResettingPassword(false);
                            }
                          }}
                          className="px-3 py-2 bg-primary text-primary-foreground font-bold rounded-xl text-sm"
                        >
                          {resettingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "সেভ"}
                        </button>
                        <button onClick={() => { setEditingPasswordUserId(null); setNewPasswordValue(""); }} className="p-2 text-muted-foreground hover:text-destructive">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingPasswordUserId(u.id); setNewPasswordValue(""); }}
                        className="text-xs text-[hsl(var(--cyan))] hover:underline flex items-center gap-1">
                        <Lock className="w-3 h-3" /> পাসওয়ার্ড পরিবর্তন করুন
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Old User List (kept for backwards compat) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowUserList(!showUserList)}>
            <h2 className="text-xl font-bold">ব্যবহারকারী তালিকা (সংক্ষিপ্ত)</h2>
            {showUserList ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
          {showUserList && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4">
              {filteredUsers?.map(u => (
                <div key={u.id} className="glass-card p-4 rounded-xl flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-bold text-sm truncate max-w-[200px]">{u.guest_id}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-primary font-bold">Verified: {u.key_count || 0}</p>
                      <button onClick={() => resetCountMutation.mutate(u.id)} className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-primary transition-colors"><RefreshCcw className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <button onClick={() => blockMutation.mutate({ id: u.id, isBlocked: !u.is_blocked })}
                    className={`p-2 rounded-lg transition-colors ${u.is_blocked ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"}`}>
                    {u.is_blocked ? <UserCheck className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </section>

        {/* Withdrawals */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">পেন্ডিং উইথড্র</h2>
          <div className="grid gap-4">
            {withdrawals.filter(w => w.status === "pending").map(w => (
              <div key={w.id} className="glass-card p-4 rounded-xl space-y-3">
                <div className="flex justify-between">
                  <p className="font-bold text-lg">৳{w.amount}</p>
                  <p className="text-sm text-muted-foreground">{w.details}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => statusMutation.mutate({ id: w.id, status: "completed" })} className="flex-1 btn-primary py-2 bg-[hsl(var(--emerald))]">Approve</button>
                  <button onClick={() => statusMutation.mutate({ id: w.id, status: "rejected" })} className="flex-1 btn-primary py-2 bg-destructive">Reject</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
