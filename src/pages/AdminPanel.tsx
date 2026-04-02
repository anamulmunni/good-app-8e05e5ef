import { useState, useEffect } from "react";
import { UserAuditCard } from "@/components/UserAuditCard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  getAllUsers, getAllTransactions, getPublicSettings, getPoolStats,
  getSubmittedNumbers, getResetHistory, getPaymentUsers,
  toggleBlockUser, updateUserBalance, resetUserKeyCount, updateUserKeyCount,
  updateUserVerifiedBadge,
  updateTransactionStatus, updateSetting, deletePoolKey, deleteAllPoolKeys,
  addSubmittedNumbers, deleteSubmittedNumber, clearAllSubmittedNumbers,
  addResetHistory, recalculateAllBalances, resetAllBalances,
  getDuplicateKeyAttempts,
} from "@/lib/api";
import {
  getUserRequestSubmissions,
  getActiveRequestsByRequester,
  adminCancelRequestsByRequester,
  adminResetTransferRequest,
  adminResetTransferBatch,
  adminDismissTransferRequest,
  adminCancelTransferBatch,
} from "@/lib/user-requests";
import { ShieldCheck, UserX, UserCheck, CheckCircle, XCircle, Loader2, Coins, Key, Search, RefreshCcw, Copy, Users, ChevronDown, ChevronUp, Trash2, Bell, Send, History, Lock, Eye, EyeOff, ToggleLeft, ToggleRight, Wallet, Settings, FileText, CreditCard, Clock, Youtube, Pencil, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

const POOL_SECRET = "Anamul-984516";

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString();
}

// Collapsible section component
function Section({ icon: Icon, title, count, color, children, defaultOpen = false }: {
  icon: any; title: string; count?: number | string; color: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`glass-card rounded-2xl border-2 border-[hsl(var(--${color}))]/20 overflow-hidden`}>
      <button onClick={() => setOpen(!open)} className="w-full p-5 flex items-center justify-between hover:bg-secondary/20 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl bg-[hsl(var(--${color}))]/10`}>
            <Icon className={`w-5 h-5 text-[hsl(var(--${color}))]`} />
          </div>
          <div className="text-left">
            <h2 className="text-lg font-bold">{title}</h2>
            {count !== undefined && <p className="text-xs text-muted-foreground">{count} টি</p>}
          </div>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-border/50">{children}</div>}
    </section>
  );
}

export default function AdminPanel() {
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [newBalance, setNewBalance] = useState("");
  const [rewardRate, setRewardRate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showActiveUsers, setShowActiveUsers] = useState(false);
  const [poolPassword, setPoolPassword] = useState("");
  const [batchNumbers, setBatchNumbers] = useState("");
  const [buyStatus, setBuyStatus] = useState("on");
  const [bonusStatus, setBonusStatus] = useState("off");
  const [bonusTarget, setBonusTarget] = useState("10");
  const [customNotice, setCustomNotice] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [paymentNumberSearch, setPaymentNumberSearch] = useState("");
  const [userMgmtSearch, setUserMgmtSearch] = useState("");
  const [editingPasswordUserId, setEditingPasswordUserId] = useState<number | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [showPassword, setShowPassword] = useState<Record<number, boolean>>({});
  const [resettingPassword, setResettingPassword] = useState(false);
  const [requesterRequestSearch, setRequesterRequestSearch] = useState("");
  const [requestSubmitPasswordSetting, setRequestSubmitPasswordSetting] = useState("");
  const [minRequestVerifiedSetting, setMinRequestVerifiedSetting] = useState("10");
  const [paymentModeSetting, setPaymentModeSetting] = useState("off");
  const [paymentModeLoading, setPaymentModeLoading] = useState(false);
  const [minWithdrawSetting, setMinWithdrawSetting] = useState("50");
  const [withdrawLockUntilSetting, setWithdrawLockUntilSetting] = useState("");
  const [requestLockUntilSetting, setRequestLockUntilSetting] = useState("");
  const [resetHistorySearch, setResetHistorySearch] = useState("");
  const [editingKeyCountUserId, setEditingKeyCountUserId] = useState<number | null>(null);
  const [newKeyCountValue, setNewKeyCountValue] = useState("");
  const [youtubeApiKeyInput, setYoutubeApiKeyInput] = useState("");
  const [minRequestTargetSetting, setMinRequestTargetSetting] = useState("0");
  const [savedYoutubeKeys, setSavedYoutubeKeys] = useState<string[]>([]);
  const [youtubeKeysLoading, setYoutubeKeysLoading] = useState(false);
  const [youtubeKeyStatus, setYoutubeKeyStatus] = useState<any>(null);
  const [youtubeKeysLoaded, setYoutubeKeysLoaded] = useState(false);
  const [showFullYoutubeKeys, setShowFullYoutubeKeys] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const parseYoutubeKeys = (value: string) => {
    const keys = value
      .split(/[\s,]+/)
      .map((k) => k.trim())
      .filter(Boolean)
      .filter((k) => /^AIza[0-9A-Za-z_-]{20,}$/.test(k));
    return Array.from(new Set(keys));
  };

  const maskYoutubeKey = (key: string) => `${key.slice(0, 8)}...${key.slice(-4)}`;

  const persistYoutubeKeys = async (keys: string[]) => {
    const payload = keys.join("\n");
    const { data: existing } = await supabase.from("settings").select("id").eq("key", "youtube_api_keys").maybeSingle();
    if (existing) {
      const { error } = await supabase.from("settings").update({ value: payload }).eq("key", "youtube_api_keys");
      if (error) throw error;
    } else {
      const { error } = await supabase.from("settings").insert({ key: "youtube_api_keys", value: payload });
      if (error) throw error;
    }
  };

  // Auto-load YouTube API keys
  useEffect(() => {
    if (isLoggedIn && !youtubeKeysLoaded) {
      setYoutubeKeysLoaded(true);
      supabase.from("settings").select("value").eq("key", "youtube_api_keys").maybeSingle()
        .then(({ data }) => {
          const keys = parseYoutubeKeys(data?.value || "");
          setSavedYoutubeKeys(keys);
          setYoutubeApiKeyInput("");
        });
    }
  }, [isLoggedIn, youtubeKeysLoaded]);

  const trimmedRequesterSearch = requesterRequestSearch.trim();

  // Queries
  const { data: pool } = useQuery({ queryKey: ["admin-pool"], queryFn: getPoolStats, enabled: isLoggedIn });
  const { data: users } = useQuery({ queryKey: ["admin-users"], queryFn: getAllUsers, enabled: isLoggedIn });
  const { data: allTx } = useQuery({ queryKey: ["admin-transactions"], queryFn: getAllTransactions, enabled: isLoggedIn });
  const { data: settingsData } = useQuery({ queryKey: ["admin-settings"], queryFn: getPublicSettings, enabled: isLoggedIn });
  const { data: submittedNumbers } = useQuery({ queryKey: ["admin-submitted"], queryFn: getSubmittedNumbers, enabled: isLoggedIn });
  const { data: userRequestSubmissions = [] } = useQuery({
    queryKey: ["admin-user-request-submissions"],
    queryFn: () => getUserRequestSubmissions(true),
    enabled: isLoggedIn,
  });
  const { data: requesterActiveRequests = [] } = useQuery({
    queryKey: ["admin-requester-active-requests", trimmedRequesterSearch],
    queryFn: () => getActiveRequestsByRequester(trimmedRequesterSearch),
    enabled: isLoggedIn && trimmedRequesterSearch.length > 0,
  });
  const { data: resetHistoryData } = useQuery({ queryKey: ["admin-reset-history"], queryFn: getResetHistory, enabled: isLoggedIn });
  const { data: receivedList } = useQuery({ queryKey: ["admin-payments-received"], queryFn: () => getPaymentUsers("received"), enabled: isLoggedIn });
  const { data: notReceivedList } = useQuery({ queryKey: ["admin-payments-not-received"], queryFn: () => getPaymentUsers("not_received"), enabled: isLoggedIn });
  const { data: duplicateAttempts = [] } = useQuery({ queryKey: ["admin-duplicate-attempts"], queryFn: getDuplicateKeyAttempts, enabled: isLoggedIn });

  const withdrawals = allTx?.filter(t => t.type === "withdrawal") || [];
  const pendingWithdrawals = withdrawals.filter(w => w.status === "pending");

  useEffect(() => {
    if (settingsData) {
      setRewardRate(String(settingsData.rewardRate));
      setBuyStatus(settingsData.buyStatus);
      setBonusStatus(settingsData.bonusStatus);
      setBonusTarget(String(settingsData.bonusTarget));
      setCustomNotice(settingsData.customNotice);
      setVideoUrl(settingsData.videoUrl || "");
      setRequestSubmitPasswordSetting(settingsData.requestSubmitPassword || "");
      setMinRequestVerifiedSetting(String(settingsData.minRequestVerified || 10));
      setMinRequestTargetSetting(String(settingsData.minRequestTarget || 0));
      setPaymentModeSetting(settingsData.paymentMode || "off");
      setMinWithdrawSetting(String(settingsData.minWithdraw || 50));
      setWithdrawLockUntilSetting(isoToDatetimeLocal(settingsData.withdrawLockUntil));
      setRequestLockUntilSetting(isoToDatetimeLocal(settingsData.requestLockUntil));
    }
  }, [settingsData]);

  // Mutations
  const blockMutation = useMutation({
    mutationFn: ({ id, isBlocked }: { id: number; isBlocked: boolean }) => toggleBlockUser(id, isBlocked),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); toast({ title: "আপডেট হয়েছে" }); },
  });

  const resetCountMutation = useMutation({
    mutationFn: async (id: number) => {
      const user = users?.find(u => u.id === id);
      if (user) {
        const submittedInfo = submittedNumbers?.find(s => s.phone_number === user.guest_id);
        await addResetHistory(user.guest_id, user.key_count, "Admin", submittedInfo?.payment_number || undefined, submittedInfo?.payment_method || undefined);
        await resetUserKeyCount(id);
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); queryClient.invalidateQueries({ queryKey: ["admin-reset-history"] }); toast({ title: "কাউন্ট রিসেট হয়েছে" }); },
  });

  const updateKeyCountMutation = useMutation({
    mutationFn: ({ id, keyCount }: { id: number; keyCount: number }) => updateUserKeyCount(id, keyCount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setEditingKeyCountUserId(null);
      setNewKeyCountValue("");
      toast({ title: "Verified count আপডেট হয়েছে ✓" });
    },
  });

  const verifiedBadgeMutation = useMutation({
    mutationFn: ({ id, isVerifiedBadge }: { id: number; isVerifiedBadge: boolean }) => updateUserVerifiedBadge(id, isVerifiedBadge),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      toast({ title: "ভেরিফাইড ব্যাজ আপডেট হয়েছে" });
    },
  });

  const rateMutation = useMutation({
    mutationFn: async (data: { rate?: number; status?: string; bonusStatus?: string; bonusTarget?: number; customNotice?: string; videoUrl?: string; requestSubmitPassword?: string; minRequestVerified?: number; minRequestTarget?: number; minWithdraw?: number; withdrawLockUntil?: string; requestLockUntil?: string }) => {
      if (data.rate !== undefined && Number.isFinite(data.rate)) await updateSetting("rewardRate", String(data.rate));
      if (data.status !== undefined) await updateSetting("buyStatus", data.status);
      if (data.bonusStatus !== undefined) await updateSetting("bonusStatus", data.bonusStatus);
      if (data.bonusTarget !== undefined && Number.isFinite(data.bonusTarget)) await updateSetting("bonusTarget", String(data.bonusTarget));
      if (data.customNotice !== undefined) await updateSetting("customNotice", data.customNotice);
      if (data.videoUrl !== undefined) await updateSetting("videoUrl", data.videoUrl);
      if (data.requestSubmitPassword !== undefined) await updateSetting("requestSubmitPassword", data.requestSubmitPassword);
      if (data.minRequestVerified !== undefined && Number.isFinite(data.minRequestVerified)) await updateSetting("minRequestVerified", String(data.minRequestVerified));
      if (data.minRequestTarget !== undefined && Number.isFinite(data.minRequestTarget)) await updateSetting("minRequestTarget", String(data.minRequestTarget));
      if (data.minWithdraw !== undefined && Number.isFinite(data.minWithdraw)) await updateSetting("minWithdraw", String(data.minWithdraw));
      if (data.withdrawLockUntil !== undefined) await updateSetting("withdrawLockUntil", data.withdrawLockUntil);
      if (data.requestLockUntil !== undefined) await updateSetting("requestLockUntil", data.requestLockUntil);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-settings"] }); queryClient.invalidateQueries({ queryKey: ["public-settings"] }); toast({ title: "সেটিংস আপডেট হয়েছে" }); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateTransactionStatus(id, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-transactions"] }); queryClient.invalidateQueries({ queryKey: ["admin-users"] }); toast({ title: "স্ট্যাটাস আপডেট হয়েছে" }); },
  });

  const deletePoolMutation = useMutation({
    mutationFn: (id: number) => deletePoolKey(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-pool"] }); toast({ title: "কি ডিলিট হয়েছে" }); },
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

  const refreshRequestPanels = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-submitted"] });
    queryClient.invalidateQueries({ queryKey: ["admin-reset-history"] });
    queryClient.invalidateQueries({ queryKey: ["admin-user-request-submissions"] });
    queryClient.invalidateQueries({ queryKey: ["admin-requester-active-requests"] });
    queryClient.invalidateQueries({ queryKey: ["incoming-user-transfer-requests"] });
    queryClient.invalidateQueries({ queryKey: ["user-sent-requests"] });
    queryClient.invalidateQueries({ queryKey: ["user-submitted-batches"] });
  };

  const resetTransferRequestMutation = useMutation({
    mutationFn: adminResetTransferRequest,
    onSuccess: (ok) => { if (!ok) { toast({ title: "রিকুয়েস্ট রিসেট করা যায়নি", variant: "destructive" }); return; } refreshRequestPanels(); toast({ title: "রিকুয়েস্ট রিসেট হয়েছে" }); },
  });
  const dismissTransferRequestMutation = useMutation({
    mutationFn: adminDismissTransferRequest,
    onSuccess: (ok) => { if (!ok) { toast({ title: "রিকুয়েস্ট বাদ দেওয়া যায়নি", variant: "destructive" }); return; } refreshRequestPanels(); toast({ title: "রিকুয়েস্ট লিস্ট থেকে সরানো হয়েছে" }); },
  });
  const resetTransferBatchMutation = useMutation({
    mutationFn: adminResetTransferBatch,
    onSuccess: (count) => { refreshRequestPanels(); toast({ title: `${count} টি রিকুয়েস্ট রিসেট হয়েছে` }); },
  });
  const cancelRequesterRequestsMutation = useMutation({
    mutationFn: adminCancelRequestsByRequester,
    onSuccess: (count) => { refreshRequestPanels(); toast({ title: `${count} টি active request cancel হয়েছে` }); },
  });
  const cancelTransferBatchMutation = useMutation({
    mutationFn: adminCancelTransferBatch,
    onSuccess: (count) => { refreshRequestPanels(); toast({ title: `${count} টি request ফিরে গেছে submitter এর কাছে` }); },
  });

  const filteredUsers = users?.filter(u => searchQuery ? (String(u.id).includes(searchQuery) || u.guest_id.toLowerCase().includes(searchQuery.toLowerCase()) || (u.display_name || "").toLowerCase().includes(searchQuery.toLowerCase())) : true);

  // Login screen
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="glass-card p-8 rounded-3xl w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">Admin Access</h1>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && password === "Anamul-963050") setIsLoggedIn(true); }}
            placeholder="Password..." className="input-field mb-4" />
          <button onClick={() => { if (password === "Anamul-963050") setIsLoggedIn(true); else toast({ title: "ভুল পাসওয়ার্ড", variant: "destructive" }); }}
            className="btn-primary">Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4 pb-24">

        {/* Header */}
        <header className="flex items-center gap-4 mb-2">
          <ShieldCheck className="w-10 h-10 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="text-xs text-muted-foreground">মোট ইউজার: <span className="text-primary font-bold">{users?.length || 0}</span></p>
          </div>
        </header>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-card p-4 rounded-2xl bg-primary/10 border border-primary/30 text-center">
            <Key className="w-6 h-6 text-primary mx-auto mb-1" />
            <p className="text-2xl font-black text-primary">{pool?.filter(p => !p.is_used).length || 0}</p>
            <p className="text-[10px] text-muted-foreground">Ready Keys</p>
          </div>
          <div className="glass-card p-4 rounded-2xl bg-[hsl(var(--blue))]/10 border border-[hsl(var(--blue))]/30 text-center cursor-pointer" onClick={() => setShowActiveUsers(!showActiveUsers)}>
            <Users className="w-6 h-6 text-[hsl(var(--blue))] mx-auto mb-1" />
            <p className="text-2xl font-black text-[hsl(var(--blue))]">{users?.filter(u => u.key_count >= 1).length || 0}</p>
            <p className="text-[10px] text-muted-foreground">Active</p>
          </div>
          <div className="glass-card p-4 rounded-2xl bg-[hsl(var(--orange))]/10 border border-[hsl(var(--orange))]/30 text-center">
            <Wallet className="w-6 h-6 text-[hsl(var(--orange))] mx-auto mb-1" />
            <p className="text-2xl font-black text-[hsl(var(--orange))]">{pendingWithdrawals.length}</p>
            <p className="text-[10px] text-muted-foreground">Withdraw</p>
          </div>
        </div>

        {/* Account Stats */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card p-4 rounded-2xl border-2 border-[hsl(var(--cyan))]/30 text-center relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, hsl(var(--cyan) / 0.08), hsl(var(--blue) / 0.08))" }}
          >
            <motion.div
              className="absolute inset-0 opacity-20"
              style={{ background: "linear-gradient(90deg, transparent, hsl(var(--cyan) / 0.3), transparent)", backgroundSize: "200% 100%" }}
              animate={{ backgroundPosition: ["200% 0%", "-200% 0%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
            <div className="relative z-10">
              <Users className="w-6 h-6 text-[hsl(var(--cyan))] mx-auto mb-1" />
              <p className="text-3xl font-black text-[hsl(var(--cyan))]">{users?.reduce((sum, u) => sum + (u.key_count || 0), 0) || 0}</p>
              <p className="text-[10px] text-muted-foreground font-semibold">মোট ভেরিফাইড</p>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-4 rounded-2xl border-2 border-[hsl(var(--amber))]/30 text-center relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, hsl(var(--amber) / 0.08), hsl(var(--orange) / 0.08))" }}
          >
            <motion.div
              className="absolute inset-0 opacity-20"
              style={{ background: "linear-gradient(90deg, transparent, hsl(var(--amber) / 0.3), transparent)", backgroundSize: "200% 100%" }}
              animate={{ backgroundPosition: ["200% 0%", "-200% 0%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear", delay: 0.5 }}
            />
            <div className="relative z-10">
              <ShieldCheck className="w-6 h-6 text-[hsl(var(--amber))] mx-auto mb-1" />
              <p className="text-3xl font-black text-[hsl(var(--amber))]">{users?.filter(u => u.key_count >= 5).reduce((sum, u) => sum + (u.key_count || 0), 0) || 0}</p>
              <p className="text-[10px] text-muted-foreground font-semibold">৫+ ভেরিফাইড</p>
            </div>
          </motion.div>
        </div>

        {showActiveUsers && (
          <div className="glass-card p-4 rounded-2xl border border-[hsl(var(--blue))]/30">
            <h3 className="text-sm font-bold mb-3 text-[hsl(var(--blue))]">Active Users</h3>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {users?.filter(u => u.key_count >= 1).map(u => (
                <div key={u.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg text-sm">
                  <span className="font-mono truncate max-w-[200px]">ID: {u.id} ({u.display_name || u.guest_id})</span>
                  <span className="text-primary font-bold">{u.key_count} টা</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════ */}
        {/* 💰 SECTION 1: পেমেন্ট ও উইথড্র */}
        {/* ═══════════════════════════════════════ */}
        <div className="pt-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Coins className="w-4 h-4" /> পেমেন্ট ও উইথড্র
          </h2>
        </div>

        {/* Payment Mode Switch */}
        <div className="glass-card p-5 rounded-2xl border-2 border-[hsl(var(--emerald))]/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${paymentModeSetting === "on" ? "bg-[hsl(var(--emerald))]/20" : "bg-secondary"}`}>
                <Coins className={`w-5 h-5 ${paymentModeSetting === "on" ? "text-[hsl(var(--emerald))]" : "text-muted-foreground"}`} />
              </div>
              <div>
                <h3 className="font-bold">পেমেন্ট মোড</h3>
                <p className="text-[10px] text-muted-foreground">ON করলে ভেরিফাই এ টাকা যোগ হবে</p>
              </div>
            </div>
            <button
              disabled={paymentModeLoading}
              onClick={async () => {
                const newMode = paymentModeSetting === "on" ? "off" : "on";
                setPaymentModeLoading(true);
                try {
                  await updateSetting("paymentMode", newMode);
                  if (newMode === "on") {
                    const rate = parseInt(rewardRate) || parseInt(String(settingsData?.rewardRate)) || 30;
                    await recalculateAllBalances(rate);
                    toast({ title: `পেমেন্ট মোড ON — ব্যালেন্স ${rate} TK/key হিসেবে আপডেট` });
                  } else {
                    // Don't reset balances — just hide the UI. Balances stay safe.
                    toast({ title: "পেমেন্ট মোড OFF — উইথড্র ও ব্যালেন্স ইউজারদের কাছে লুকানো হয়েছে" });
                  }
                  setPaymentModeSetting(newMode);
                  queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
                  queryClient.invalidateQueries({ queryKey: ["admin-users"] });
                  queryClient.invalidateQueries({ queryKey: ["public-settings"] });
                } catch (err: any) {
                  console.error("Payment mode toggle error:", err);
                  toast({ title: "ব্যর্থ", description: err?.message || "কিছু ভুল হয়েছে", variant: "destructive" });
                } finally {
                  setPaymentModeLoading(false);
                }
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm transition-all ${
                paymentModeSetting === "on"
                  ? "bg-[hsl(var(--emerald))] text-foreground shadow-lg shadow-[hsl(var(--emerald))]/30"
                  : "bg-secondary text-muted-foreground border border-border"
              }`}
            >
              {paymentModeLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : paymentModeSetting === "on" ? <><ToggleRight className="w-5 h-5" /> ON</> : <><ToggleLeft className="w-5 h-5" /> OFF</>}
            </button>
          </div>
          {paymentModeSetting === "on" && (
            <>
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">রেট (TK/key)</label>
                <input type="number" value={rewardRate} onChange={(e) => setRewardRate(e.target.value)} className="input-field text-sm" />
              </div>
              <div className="flex items-end">
                <button onClick={async () => {
                  const rate = parseInt(rewardRate);
                  await rateMutation.mutateAsync({ rate });
                  await recalculateAllBalances(rate);
                  queryClient.invalidateQueries({ queryKey: ["admin-users"] });
                  toast({ title: `রেট ${rate} TK — সব ব্যালেন্স রিক্যালকুলেট হয়েছে` });
                }} className="btn-primary w-full text-sm py-2.5" disabled={rateMutation.isPending}>
                  {rateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "আপডেট ও রিক্যালকুলেট"}
                </button>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">সর্বনিম্ন উইথড্র (TK)</label>
                <input type="number" value={minWithdrawSetting} onChange={(e) => setMinWithdrawSetting(e.target.value)} className="input-field text-sm" />
              </div>
              <div className="flex items-end">
                <button onClick={() => rateMutation.mutate({ minWithdraw: parseInt(minWithdrawSetting) || 50 })}
                  className="btn-primary w-full text-sm py-2.5 bg-[hsl(var(--amber))]" disabled={rateMutation.isPending}>
                  {rateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "সেভ"}
                </button>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[hsl(var(--orange))]" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Withdraw Countdown Lock</p>
              </div>
              <input
                type="datetime-local"
                value={withdrawLockUntilSetting}
                onChange={(e) => setWithdrawLockUntilSetting(e.target.value)}
                className="input-field text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => rateMutation.mutate({ withdrawLockUntil: datetimeLocalToIso(withdrawLockUntilSetting) })}
                  className="btn-primary py-2.5 text-sm bg-[hsl(var(--orange))]"
                  disabled={rateMutation.isPending}
                >
                  {rateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "টাইম সেভ"}
                </button>
                <button
                  onClick={() => {
                    setWithdrawLockUntilSetting("");
                    rateMutation.mutate({ withdrawLockUntil: "" });
                  }}
                  className="px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-colors font-bold text-sm"
                  disabled={rateMutation.isPending}
                >
                  ক্লিয়ার
                </button>
              </div>
            </div>
            </>
          )}
        </div>

        {/* Pending Withdrawals */}
        <Section icon={Wallet} title="পেন্ডিং উইথড্র" count={pendingWithdrawals.length} color="orange">
          <div className="mt-4 space-y-3">
            {pendingWithdrawals.map(w => {
              const wxUser = users?.find(u => u.id === w.user_id);
              return (
                <div key={w.id} className="bg-secondary/50 border border-border rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-black text-2xl text-[hsl(var(--orange))]">{w.amount} TK</p>
                      <p className="text-sm text-muted-foreground">{w.details}</p>
                      {wxUser && <p className="text-xs text-muted-foreground mt-1">User: <span className="font-mono font-bold text-foreground">ID: {wxUser.id}</span> ({wxUser.display_name || wxUser.guest_id})</p>}
                      <p className="text-[10px] text-muted-foreground">{new Date(w.created_at || "").toLocaleString("bn-BD")}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => statusMutation.mutate({ id: w.id, status: "completed" })} className="flex-1 btn-primary py-2.5 bg-[hsl(var(--emerald))]"><CheckCircle className="w-4 h-4" /> Approve</button>
                    <button onClick={() => statusMutation.mutate({ id: w.id, status: "rejected" })} className="flex-1 btn-primary py-2.5 bg-destructive"><XCircle className="w-4 h-4" /> Reject</button>
                  </div>
                </div>
              );
            })}
            {pendingWithdrawals.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">কোনো পেন্ডিং উইথড্র নেই</p>}
          </div>
        </Section>

        {/* Payment Confirmation */}
        <Section icon={CheckCircle} title="পেমেন্ট কনফার্মেশন" color="emerald">
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="font-bold text-primary flex items-center gap-2 text-sm"><CheckCircle className="w-4 h-4" /> হ্যাঁ (পেয়েছে)</h3>
              {receivedList?.map(u => (<div key={u.id} className="p-2 bg-primary/10 rounded-lg border border-primary/20 text-xs">ID: {u.id} ({u.display_name || u.guest_id})</div>))}
              {(!receivedList || receivedList.length === 0) && <p className="text-xs text-muted-foreground">কেউ নেই</p>}
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-destructive flex items-center gap-2 text-sm"><XCircle className="w-4 h-4" /> না (পায়নি)</h3>
              {notReceivedList?.map(u => (<div key={u.id} className="p-2 bg-destructive/10 rounded-lg border border-destructive/20 text-xs">ID: {u.id} ({u.display_name || u.guest_id})</div>))}
              {(!notReceivedList || notReceivedList.length === 0) && <p className="text-xs text-muted-foreground">কেউ নেই</p>}
            </div>
          </div>
        </Section>

        {/* ═══════════════════════════════════════ */}
        {/* 📋 SECTION 2: রিকুয়েস্ট ও সাবমিশন */}
        {/* ═══════════════════════════════════════ */}
        <div className="pt-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Send className="w-4 h-4" /> রিকুয়েস্ট ও সাবমিশন
          </h2>
        </div>

        {/* User Request Submissions */}
        <Section icon={Send} title="ইউজার Request Submission" count={userRequestSubmissions.length} color="primary" defaultOpen={userRequestSubmissions.length > 0}>
          <div className="mt-4 space-y-4">
            {/* Per-Admin Stats Summary */}
            {userRequestSubmissions.length > 0 && (() => {
              const adminStats = new Map<string, { numbers: number; verified: number; paymentNumber?: string; paymentMethod?: string }>();
              userRequestSubmissions.forEach((batch) => {
                const adminKey = batch.target_guest_id;
                const existing = adminStats.get(adminKey) || { numbers: 0, verified: 0 };
                existing.numbers += batch.requests?.length || 0;
                existing.verified += batch.requests?.reduce((sum, r) => sum + (r.requester_verified_count || 0), 0) || 0;
                if (batch.submitter_payment_number) existing.paymentNumber = batch.submitter_payment_number;
                if (batch.submitter_payment_method) existing.paymentMethod = batch.submitter_payment_method;
                adminStats.set(adminKey, existing);
              });
              const totalNumbers = Array.from(adminStats.values()).reduce((s, a) => s + a.numbers, 0);
              const totalVerified = Array.from(adminStats.values()).reduce((s, a) => s + a.verified, 0);
              return (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gradient-to-br from-[hsl(var(--cyan))]/15 to-[hsl(var(--blue))]/10 border border-[hsl(var(--cyan))]/30 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-[hsl(var(--cyan))]">{totalNumbers}</p>
                      <p className="text-[10px] text-muted-foreground font-bold">মোট নম্বর</p>
                    </div>
                    <div className="bg-gradient-to-br from-[hsl(var(--emerald))]/15 to-primary/10 border border-[hsl(var(--emerald))]/30 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-[hsl(var(--emerald))]">{totalVerified}</p>
                      <p className="text-[10px] text-muted-foreground font-bold">মোট ভেরিফাইড</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                     {Array.from(adminStats.entries()).map(([adminGuestId, stats]) => {
                      const adminUser = users?.find(u => u.guest_id === adminGuestId);
                      return (
                        <div key={adminGuestId} className="flex items-center justify-between bg-secondary/40 border border-border/50 rounded-xl px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">ID: {adminUser?.id || "?"} ({adminUser?.display_name || adminGuestId})</p>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="bg-[hsl(var(--cyan))]/15 text-[hsl(var(--cyan))] font-bold px-2 py-1 rounded-lg">{stats.numbers} নম্বর</span>
                            <span className="bg-[hsl(var(--emerald))]/15 text-[hsl(var(--emerald))] font-bold px-2 py-1 rounded-lg">{stats.verified} ✓</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })()}

            {/* Cancel by requester search */}
            <div className="bg-secondary/30 border border-border rounded-xl p-4 space-y-3">
              <p className="text-sm font-bold">রিকুয়েস্ট পাঠানো নম্বর দিয়ে Cancel করুন</p>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" value={requesterRequestSearch} onChange={(e) => setRequesterRequestSearch(e.target.value)}
                  placeholder="01XXXXXXXXX" className="input-field pl-10 text-sm" />
              </div>
              {trimmedRequesterSearch && (
                <div className="space-y-2">
                  {requesterActiveRequests.length === 0 ? (
                    <p className="text-xs text-muted-foreground">এই নম্বরের active request নেই।</p>
                  ) : (
                    <>
                      <div className="space-y-2 max-h-44 overflow-y-auto">
                        {requesterActiveRequests.map((item) => (
                          <div key={item.id} className="bg-background/50 border border-border rounded-lg p-3">
                            <p className="text-sm font-mono font-bold">{item.requester_guest_id} → {item.target_guest_id}</p>
                            <p className="text-xs text-muted-foreground">Status: {item.status} • Verified: {item.requester_verified_count}</p>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => cancelRequesterRequestsMutation.mutate(trimmedRequesterSearch)}
                        disabled={cancelRequesterRequestsMutation.isPending}
                        className="btn-primary py-2.5 bg-destructive text-destructive-foreground text-sm">
                        {cancelRequesterRequestsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `সব Active Request Cancel`}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Batch list */}
            {userRequestSubmissions.length > 0 ? (
              userRequestSubmissions.map((batch) => {
                const totalBatchVerified = batch.requests?.reduce((sum, r) => sum + (r.requester_verified_count || 0), 0) || 0;
                return (
                  <div key={batch.id} className="glass-card border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between bg-primary/10 rounded-lg px-3 py-2">
                      <p className="text-sm font-bold text-primary">📋 {batch.request_count} টি নম্বর • মোট {totalBatchVerified} ভেরিফাইড</p>
                      <div className="flex gap-1">
                        <button onClick={() => { if (confirm("এই ব্যাচ Cancel করলে request গুলো submitter এর কাছে ফিরে যাবে। নিশ্চিত?")) cancelTransferBatchMutation.mutate(batch.id); }} disabled={cancelTransferBatchMutation.isPending} className="p-2 rounded-lg bg-[hsl(var(--amber))]/20 hover:bg-[hsl(var(--amber))]/40 transition" title="Cancel Batch (ফিরে যাবে)">
                          <XCircle className="w-4 h-4 text-[hsl(var(--amber))]" />
                        </button>
                        <button onClick={() => resetTransferBatchMutation.mutate(batch.id)} disabled={resetTransferBatchMutation.isPending} className="p-2 rounded-lg bg-primary/20 hover:bg-primary/40 transition" title="Reset Batch">
                          <RefreshCcw className="w-4 h-4 text-primary" />
                        </button>
                      </div>
                    </div>
                    {/* Rate info */}
                    {(batch as any).submitter_rate > 0 && (
                      <div className="bg-[hsl(var(--amber))]/10 border border-[hsl(var(--amber))]/20 rounded-lg px-3 py-1.5">
                        <p className="text-xs font-bold text-[hsl(var(--amber))]">💰 রেট: {(batch as any).submitter_rate} TK/ভেরিফাই</p>
                      </div>
                    )}
                    <div className="bg-[hsl(var(--emerald))]/10 border border-[hsl(var(--emerald))]/20 rounded-lg px-3 py-2">
                      <p className="text-xs font-bold text-[hsl(var(--emerald))] mb-1">🧑 যে সাবমিট করেছে:</p>
                      <p className="text-sm font-bold">{batch.target_guest_id} <span className="text-xs text-muted-foreground font-normal">({batch.target_display_name || "Unknown"})</span></p>
                      <p className="text-xs text-muted-foreground">Name: {batch.submitted_to_admin_by}</p>
                      {(batch.submitter_payment_number || batch.submitter_payment_method) && (
                      <p className="text-xs font-bold text-[hsl(var(--emerald))] mt-1 flex items-center gap-1.5">💳 {batch.submitter_payment_method?.toUpperCase() || "N/A"} — {batch.submitter_payment_number || "N/A"}
                        {batch.submitter_payment_number && (
                          <button onClick={() => { navigator.clipboard.writeText(batch.submitter_payment_number!); toast({ title: "কপি হয়েছে" }); }}
                            className="p-0.5 hover:bg-[hsl(var(--emerald))]/20 rounded transition-colors"><Copy className="w-3 h-3" /></button>
                        )}
                      </p>
                      )}
                    </div>
                    {batch.requests && batch.requests.length > 0 && (
                      <div className="space-y-2 border-t border-border pt-2">
                        <p className="text-xs font-bold text-muted-foreground">📨 যারা রিকুয়েস্ট পাঠিয়েছে:</p>
                        {batch.requests.map((req) => (
                          <div key={req.id} className="flex items-center justify-between bg-background/50 border border-border rounded-lg px-3 py-2">
                            <div>
                              <p className="text-sm font-mono font-bold">{req.requester_guest_id}</p>
                              <p className="text-xs text-muted-foreground">Verified: {req.requester_verified_count}</p>
                              {(req.requester_payment_number || req.requester_payment_method) && (
                                <p className="text-xs font-bold text-[hsl(var(--amber))] flex items-center gap-1.5">💳 {req.requester_payment_method?.toUpperCase() || "N/A"} — {req.requester_payment_number || "N/A"}
                                  {req.requester_payment_number && (
                                    <button onClick={() => { navigator.clipboard.writeText(req.requester_payment_number); toast({ title: "কপি হয়েছে" }); }}
                                      className="p-0.5 hover:bg-[hsl(var(--amber))]/20 rounded transition-colors"><Copy className="w-3 h-3" /></button>
                                  )}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => resetTransferRequestMutation.mutate(req.id)} disabled={resetTransferRequestMutation.isPending} className="p-1.5 rounded bg-primary/20 hover:bg-primary/40" title="Reset"><RefreshCcw className="w-3.5 h-3.5 text-primary" /></button>
                              <button onClick={() => dismissTransferRequestMutation.mutate(req.id)} disabled={dismissTransferRequestMutation.isPending} className="p-1.5 rounded bg-destructive/20 hover:bg-destructive/40" title="Dismiss"><XCircle className="w-3.5 h-3.5 text-destructive" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">কোনো active submission নেই</p>
            )}
          </div>
        </Section>

        {/* Submitted Numbers */}
        <Section icon={FileText} title="সাবমিটেড নম্বর" count={submittedNumbers?.length} color="purple">
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[hsl(var(--purple))]">মোট ভেরিফাইড: {submittedNumbers?.reduce((sum, s) => {
                const u = users?.find(u => u.guest_id === s.phone_number);
                return sum + (u?.key_count || 0);
              }, 0) || 0}</p>
              <button onClick={() => clearSubmittedMutation.mutate()} disabled={clearSubmittedMutation.isPending} className="px-3 py-1.5 bg-destructive text-destructive-foreground font-bold rounded-lg text-xs flex items-center gap-1">
                {clearSubmittedMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><RefreshCcw className="w-3 h-3" /> Reset All</>}
              </button>
            </div>
            {submittedNumbers?.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl border border-border">
                <div><p className="font-mono text-sm font-bold">{item.phone_number}</p><p className="text-[10px] text-muted-foreground">{item.submitted_by} {item.payment_number ? `| ${item.payment_method?.toUpperCase()}: ${item.payment_number}` : ""}</p></div>
                <div className="flex items-center gap-2">
                  <span className="text-primary font-bold text-sm bg-primary/10 px-2 py-1 rounded-lg">{users?.find(u => u.guest_id === item.phone_number)?.key_count || 0} টা</span>
                  <button onClick={async () => {
                    if (item.submitted_by?.startsWith("Request→")) {
                      const { data: activeRequest } = await supabase.from("user_transfer_requests").select("id").eq("requester_guest_id", item.phone_number).eq("status", "submitted").limit(1).maybeSingle();
                      if (activeRequest?.id) { await resetTransferRequestMutation.mutateAsync(Number(activeRequest.id)); return; }
                    }
                    const user = users?.find(u => u.guest_id === item.phone_number);
                    await addResetHistory(item.phone_number, user?.key_count || item.verified_count, item.submitted_by, item.payment_number || undefined, item.payment_method || undefined);
                    if (user) await resetUserKeyCount(user.id);
                    await deleteSubmittedNumber(item.id);
                    queryClient.invalidateQueries({ queryKey: ["admin-submitted"] });
                    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
                    queryClient.invalidateQueries({ queryKey: ["admin-reset-history"] });
                    toast({ title: "রিসেট হয়ে হিস্ট্রিতে সেভ হয়েছে" });
                  }} className="px-2 py-1 bg-[hsl(var(--cyan))]/20 text-[hsl(var(--cyan))] font-bold rounded-lg text-xs">Reset</button>
                  <button onClick={() => deleteSubmittedMutation.mutate(item.id)} className="p-1 hover:bg-destructive/20 rounded text-destructive"><XCircle className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ═══════════════════════════════════════ */}
        {/* 🔍 SECTION 3: সার্চ ও হিস্ট্রি */}
        {/* ═══════════════════════════════════════ */}
        <div className="pt-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Search className="w-4 h-4" /> সার্চ ও হিস্ট্রি
          </h2>
        </div>

        {/* User Search */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="User ID দিয়ে সার্চ..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-12 h-12 bg-secondary/50 border-primary/20 focus:border-primary" />
        </div>

        {/* Payment Number Search */}
        <Section icon={Search} title="পেমেন্ট নম্বর দিয়ে সার্চ" color="amber">
          <div className="mt-4 space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="bKash/Nagad নম্বর দিন..." value={paymentNumberSearch} onChange={(e) => setPaymentNumberSearch(e.target.value)} className="input-field pl-10 text-sm" />
            </div>
            {paymentNumberSearch.trim() && (
              <>
                {/* Search in user_request_submissions by submitter payment number */}
                {(() => {
                  const q = paymentNumberSearch.trim();
                  const matchedBatches = userRequestSubmissions.filter(b =>
                    b.submitter_payment_number?.includes(q) ||
                    b.target_guest_id.includes(q) ||
                    b.submitted_to_admin_by?.includes(q)
                  );
                  if (matchedBatches.length > 0) {
                    const totalBatchNumbers = matchedBatches.reduce((s, b) => s + (b.requests?.length || 0), 0);
                    const totalBatchVerified = matchedBatches.reduce((s, b) => s + (b.requests?.reduce((rs, r) => rs + (r.requester_verified_count || 0), 0) || 0), 0);
                    return (
                      <div className="space-y-3">
                        <p className="text-sm font-bold text-primary">📋 Active Submissions ({matchedBatches.length} ব্যাচ)</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-primary/10 border border-primary/20 rounded-xl p-2 text-center">
                            <p className="text-lg font-black text-primary">{totalBatchNumbers}</p>
                            <p className="text-[9px] text-muted-foreground font-bold">মোট নম্বর</p>
                          </div>
                          <div className="bg-[hsl(var(--emerald))]/10 border border-[hsl(var(--emerald))]/20 rounded-xl p-2 text-center">
                            <p className="text-lg font-black text-[hsl(var(--emerald))]">{totalBatchVerified}</p>
                            <p className="text-[9px] text-muted-foreground font-bold">মোট ভেরিফাইড</p>
                          </div>
                        </div>
                        {matchedBatches.map(batch => (
                          <div key={batch.id} className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-bold">{batch.target_guest_id} <span className="text-xs text-muted-foreground">({batch.target_display_name || "Unknown"})</span></p>
                              <span className="text-xs font-bold px-2 py-1 rounded-lg bg-primary/20 text-primary">{batch.request_count} টি</span>
                            </div>
                            {batch.submitter_payment_number && (
                              <p className="text-xs font-bold text-[hsl(var(--emerald))] flex items-center gap-1.5">💳 {batch.submitter_payment_method?.toUpperCase() || "N/A"} — {batch.submitter_payment_number}
                                <button onClick={() => { navigator.clipboard.writeText(batch.submitter_payment_number!); toast({ title: "কপি হয়েছে" }); }}
                                  className="p-0.5 hover:bg-[hsl(var(--emerald))]/20 rounded transition-colors"><Copy className="w-3 h-3" /></button>
                              </p>
                            )}
                            {batch.requests && batch.requests.length > 0 && (
                              <div className="space-y-1.5 border-t border-border/50 pt-2">
                                {batch.requests.map(req => (
                                  <div key={req.id} className="flex items-center justify-between bg-background/50 border border-border/60 rounded-lg px-3 py-1.5">
                                    <div>
                                      <span className="text-sm font-mono font-bold">{req.requester_guest_id}</span>
                                      {req.requester_payment_number && (
                                        <p className="text-[10px] text-[hsl(var(--amber))] font-bold">💳 {req.requester_payment_method?.toUpperCase()} — {req.requester_payment_number}</p>
                                      )}
                                    </div>
                                    <span className="text-xs font-bold text-primary">{req.requester_verified_count} ✓</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Search in submitted_numbers */}
                {(() => {
                  const q = paymentNumberSearch.trim();
                  const results = submittedNumbers?.filter(s => s.payment_number?.includes(q) || s.phone_number.includes(q) || s.submitted_by?.includes(q)) || [];
                  if (results.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-[hsl(var(--amber))]">সাবমিটেড ({results.length}টি)</p>
                      {results.map(item => (
                        <div key={item.id} className="bg-secondary/50 border border-[hsl(var(--amber))]/20 rounded-xl p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm font-bold">{item.phone_number}</span>
                            <span className="text-primary font-bold text-sm bg-primary/10 px-2 py-1 rounded-lg">{users?.find(u => u.guest_id === item.phone_number)?.key_count || 0} টা</span>
                          </div>
                          <p className="text-xs text-muted-foreground">অ্যাডমিন: <span className="text-foreground font-bold">{item.submitted_by}</span></p>
                          <p className="text-xs text-muted-foreground">পেমেন্ট: <span className="text-foreground font-bold">{item.payment_method?.toUpperCase()} - {item.payment_number}</span></p>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Search in reset_history */}
                {(() => {
                  const q = paymentNumberSearch.trim();
                  const results = resetHistoryData?.filter(r => r.payment_number?.includes(q) || r.phone_number.includes(q) || r.submitted_by?.includes(q)) || [];
                  if (results.length === 0) return null;
                  const totalResetVerified = results.reduce((s, r) => s + (r.verified_count || 0), 0);
                  return (
                    <div className="space-y-2 mt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[hsl(var(--cyan))]">রিসেট রেকর্ড ({results.length}টি)</p>
                        <p className="text-xs font-bold text-[hsl(var(--emerald))] bg-[hsl(var(--emerald))]/10 px-2 py-1 rounded-lg">মোট {totalResetVerified} ভেরিফাইড</p>
                      </div>
                      {results.map(item => (
                        <div key={item.id} className="bg-secondary/50 border border-[hsl(var(--cyan))]/20 rounded-xl p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm font-bold">{item.phone_number}</span>
                            <span className="text-[hsl(var(--cyan))] font-bold text-sm bg-[hsl(var(--cyan))]/10 px-2 py-1 rounded-lg">{item.verified_count} টা</span>
                          </div>
                          <p className="text-xs text-muted-foreground">অ্যাডমিন: <span className="text-foreground font-bold">{item.submitted_by}</span></p>
                          {item.payment_number && <p className="text-xs text-muted-foreground">পেমেন্ট: <span className="text-foreground font-bold">{item.payment_method?.toUpperCase()} - {item.payment_number}</span></p>}
                          <p className="text-[10px] text-muted-foreground">{new Date(item.reset_at || "").toLocaleString("bn-BD")}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </Section>

        {/* Reset History */}
        <Section icon={History} title="পেমেন্ট হিস্ট্রি (পেইড)" count={resetHistoryData?.length} color="emerald">
          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="নম্বর / অ্যাডমিন / পেমেন্ট নম্বর দিয়ে সার্চ..." value={resetHistorySearch} onChange={(e) => setResetHistorySearch(e.target.value)} className="input-field pl-10 text-sm" />
            </div>
            {resetHistorySearch.trim() && (() => {
              const q = resetHistorySearch.trim().toLowerCase();
              const filtered = resetHistoryData?.filter(i =>
                i.phone_number.toLowerCase().includes(q) ||
                i.submitted_by?.toLowerCase().includes(q) ||
                i.payment_number?.toLowerCase().includes(q)
              ) || [];
              const totalVerified = filtered.reduce((sum, i) => sum + (i.verified_count || 0), 0);
              return filtered.length > 0 ? (
                <div className="bg-[hsl(var(--cyan))]/10 border border-[hsl(var(--cyan))]/20 rounded-xl p-3 flex items-center justify-between">
                  <p className="text-sm font-bold text-[hsl(var(--cyan))]">📊 {filtered.length} টি রেকর্ড</p>
                  <p className="text-sm font-bold text-[hsl(var(--emerald))]">মোট {totalVerified} ভেরিফাইড</p>
                </div>
              ) : null;
            })()}
            {resetHistoryData?.filter(i => {
              if (!resetHistorySearch.trim()) return true;
              const q = resetHistorySearch.trim().toLowerCase();
              return i.phone_number.toLowerCase().includes(q) ||
                i.submitted_by?.toLowerCase().includes(q) ||
                i.payment_number?.toLowerCase().includes(q);
            }).map(item => {
              const matchedUser = users?.find(u => u.guest_id === item.phone_number);
              return (
                <div key={item.id} className="bg-secondary/50 border border-[hsl(var(--cyan))]/10 rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-secondary border border-border flex-shrink-0 flex items-center justify-center">
                      {matchedUser?.avatar_url ? <img src={matchedUser.avatar_url} alt="" className="w-full h-full object-cover" /> : <Users className="w-4 h-4 text-muted-foreground" />}
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
                      {item.payment_number && (
                        <p className="text-[10px] font-bold text-[hsl(var(--amber))] mt-0.5 flex items-center gap-1">
                          💳 {item.payment_method?.toUpperCase() || "N/A"} — {item.payment_number}
                          <button onClick={() => { navigator.clipboard.writeText(item.payment_number!); toast({ title: "কপি হয়েছে" }); }}
                            className="p-0.5 hover:bg-[hsl(var(--amber))]/20 rounded transition-colors"><Copy className="w-3 h-3" /></button>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* User Audit */}
        <Section icon={FileText} title="ইউজার অডিট রিপোর্ট" color="purple">
          <UserAuditCard />
        </Section>

        {/* ═══════════════════════════════════════ */}
        {/* ⚙️ SECTION 4: সেটিংস ও ম্যানেজমেন্ট */}
        {/* ═══════════════════════════════════════ */}
        <div className="pt-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4" /> সেটিংস ও ম্যানেজমেন্ট
          </h2>
        </div>

        {/* System Settings */}
        <Section icon={Settings} title="সিস্টেম সেটিংস" color="primary">
          <div className="mt-4 space-y-5">
            {/* Buy Status */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold">Key Buy স্ট্যাটাস</label>
              <div className="flex items-center gap-1 bg-secondary p-1 rounded-xl border border-border">
                <button onClick={() => rateMutation.mutate({ status: "on" })} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${buyStatus === "on" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"}`}>ON</button>
                <button onClick={() => rateMutation.mutate({ status: "off" })} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${buyStatus === "off" ? "bg-destructive text-destructive-foreground shadow" : "text-muted-foreground"}`}>OFF</button>
              </div>
            </div>

            {/* Reward Rate (standalone) */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Reward Rate (TK per Key)</label>
              <div className="flex gap-2">
                <input type="number" value={rewardRate} onChange={(e) => setRewardRate(e.target.value)} className="input-field text-sm" />
                <button onClick={() => rateMutation.mutate({ rate: parseInt(rewardRate) })} className="btn-primary w-auto text-sm" disabled={rateMutation.isPending}>Update</button>
              </div>
            </div>

            {/* Bonus */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">বোনাস</label>
                <select value={bonusStatus} onChange={(e) => setBonusStatus(e.target.value)} className="input-field text-sm">
                  <option value="on">On</option><option value="off">Off</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">বোনাস টার্গেট</label>
                <input type="number" value={bonusTarget} onChange={(e) => setBonusTarget(e.target.value)} className="input-field text-sm" />
              </div>
            </div>

            {/* Notice */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">নোটিশ</label>
              <textarea value={customNotice} onChange={(e) => setCustomNotice(e.target.value)} className="input-field h-20 text-sm" placeholder="নোটিশ লিখুন..." />
            </div>

            {/* Video URL */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ভিডিও লিঙ্ক</label>
              <input type="text" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="input-field text-sm" placeholder="https://youtube.com/..." />
            </div>

            <button onClick={() => rateMutation.mutate({ customNotice, bonusStatus, bonusTarget: parseInt(bonusTarget), videoUrl })}
              disabled={rateMutation.isPending} className="btn-primary py-3 text-sm">
              {rateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "সেটিংস সেভ করুন"}
            </button>
          </div>
        </Section>

        {/* Request Controls */}
        <Section icon={Lock} title="রিকুয়েস্ট কন্ট্রোল" color="cyan">
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">সাবমিট পাসওয়ার্ড</label>
                <input type="text" value={requestSubmitPasswordSetting} onChange={(e) => setRequestSubmitPasswordSetting(e.target.value)} className="input-field text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">সর্বনিম্ন Verified</label>
                <input type="number" value={minRequestVerifiedSetting} onChange={(e) => setMinRequestVerifiedSetting(e.target.value)} className="input-field text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">সর্বনিম্ন Request টার্গেট (List Submit এ)</label>
              <input type="number" value={minRequestTargetSetting} onChange={(e) => setMinRequestTargetSetting(e.target.value)} className="input-field text-sm" placeholder="0 = কোনো লিমিট নেই" />
              <p className="text-[10px] text-muted-foreground mt-1">এর কম request থাকলে List Submit করতে পারবে না</p>
            </div>
            <button onClick={() => rateMutation.mutate({ requestSubmitPassword: requestSubmitPasswordSetting, minRequestVerified: parseInt(minRequestVerifiedSetting) || 10, minRequestTarget: parseInt(minRequestTargetSetting) || 0 })}
              disabled={rateMutation.isPending} className="btn-primary py-2.5 bg-[hsl(var(--cyan))] text-sm">
              {rateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "রিকুয়েস্ট সেটিংস সেভ"}
            </button>

            {/* App Version - Force Refresh */}
            <div className="pt-2 border-t border-border/50 space-y-3">
              <div className="flex items-center gap-2">
                <RefreshCcw className="w-4 h-4 text-[hsl(var(--amber))]" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Force Page Refresh</p>
              </div>
              <p className="text-[10px] text-muted-foreground">এটি চাপলে সব ইউজারের পেজ অটো রিফ্রেশ হবে</p>
              <button
                onClick={async () => {
                  const currentVersion = settingsData?.appVersion || 0;
                  await updateSetting("appVersion", String(currentVersion + 1));
                  queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
                  toast({ title: "সব ইউজারের পেজ রিফ্রেশ হবে" });
                }}
                className="btn-primary py-2.5 bg-[hsl(var(--amber))] text-sm w-full"
              >
                🔄 Force Refresh All Users
              </button>
            </div>

            <div className="pt-2 border-t border-border/50 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[hsl(var(--cyan))]" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Request Countdown Lock</p>
              </div>
              <input
                type="datetime-local"
                value={requestLockUntilSetting}
                onChange={(e) => setRequestLockUntilSetting(e.target.value)}
                className="input-field text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => rateMutation.mutate({ requestLockUntil: datetimeLocalToIso(requestLockUntilSetting) })}
                  disabled={rateMutation.isPending}
                  className="btn-primary py-2.5 bg-[hsl(var(--cyan))] text-sm"
                >
                  {rateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "টাইম সেভ"}
                </button>
                <button
                  onClick={() => {
                    setRequestLockUntilSetting("");
                    rateMutation.mutate({ requestLockUntil: "" });
                  }}
                  className="px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-colors font-bold text-sm"
                  disabled={rateMutation.isPending}
                >
                  ক্লিয়ার
                </button>
              </div>
            </div>
          </div>
        </Section>

        {/* ═══════════════════════════════════════ */}
        {/* 🔑 SECTION 5: পুল ও ইউজার */}
        {/* ═══════════════════════════════════════ */}
        <div className="pt-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Key className="w-4 h-4" /> পুল ও ইউজার
          </h2>
        </div>

        {/* Add Keys Link */}
        <a href="/add-keys" className="glass-card p-5 rounded-2xl flex items-center justify-between hover:bg-secondary/20 transition-colors block">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10"><Key className="w-5 h-5 text-primary" /></div>
            <div><h3 className="font-bold">পুলে কি যোগ করুন</h3><p className="text-[10px] text-muted-foreground">আলাদা পেজে গিয়ে কি যোগ করুন</p></div>
          </div>
          <ChevronDown className="w-5 h-5 -rotate-90 text-muted-foreground" />
        </a>

        {/* Duplicate Key Detection */}
        <Section icon={AlertCircle} title="ডুপ্লিকেট কী সনাক্ত" count={duplicateAttempts.length} color="pink" defaultOpen={duplicateAttempts.length > 0}>
          <div className="mt-4 space-y-3">
            {duplicateAttempts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">কোনো ডুপ্লিকেট প্রচেষ্টা নেই</p>
            ) : (
              <>
                <p className="text-xs text-destructive font-bold">⚠️ এই ইউজাররা ডুপ্লিকেট কী সাবমিট করার চেষ্টা করেছে (সিস্টেম ব্লক করেছে):</p>
                {(() => {
                  const byUser = new Map<string, { guest_id: string; display_name: string | null; user_id: number; attempts: { details: string; created_at: string | null }[] }>();
                  duplicateAttempts.forEach(a => {
                    const key = a.guest_id;
                    if (!byUser.has(key)) byUser.set(key, { guest_id: a.guest_id, display_name: a.display_name, user_id: a.user_id, attempts: [] });
                    byUser.get(key)!.attempts.push({ details: a.details, created_at: a.created_at });
                  });
                  return Array.from(byUser.values()).map(u => (
                    <div key={u.guest_id} className="bg-destructive/5 border border-destructive/20 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <a href={`/user/${u.user_id}`} className="text-sm font-bold text-primary hover:underline">{u.display_name || "Unknown"}</a>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-mono text-foreground/80">{u.guest_id}</p>
                            <button onClick={() => { navigator.clipboard.writeText(u.guest_id); toast({ title: "কপি হয়েছে" }); }}
                              className="text-muted-foreground hover:text-foreground"><Copy className="w-3 h-3" /></button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">User ID: {u.user_id}</p>
                        </div>
                        <span className="bg-destructive/20 text-destructive text-xs font-bold px-2.5 py-1.5 rounded-lg">
                          {u.attempts.length} বার
                        </span>
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {u.attempts.map((a, i) => (
                          <div key={i} className="bg-background/50 rounded-lg p-2 space-y-1">
                            <div className="flex items-center gap-1">
                              <p className="text-[10px] font-mono text-foreground/70 break-all flex-1">
                                {a.details?.replace("Duplicate Key: ", "")}
                              </p>
                              <button onClick={() => { navigator.clipboard.writeText(a.details?.replace("Duplicate Key: ", "") || ""); toast({ title: "কপি হয়েছে" }); }}
                                className="text-muted-foreground hover:text-foreground shrink-0"><Copy className="w-3 h-3" /></button>
                            </div>
                            <p className="text-[9px] text-muted-foreground">
                              {a.created_at ? new Date(a.created_at).toLocaleString("bn-BD") : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </>
            )}
          </div>
        </Section>




        <Section icon={Key} title="পুল কি লিস্ট" count={pool?.length} color="primary">
          <div className="mt-4">
            {poolPassword !== POOL_SECRET ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-muted-foreground">পাসওয়ার্ড দিন:</p>
                <input type="password" placeholder="পাসওয়ার্ড..." className="input-field max-w-sm mx-auto text-sm" onChange={(e) => setPoolPassword(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(pool?.map(i => i.private_key).join("\n") || ""); toast({ title: "সব Key কপি হয়েছে" }); }}
                    className="btn-primary bg-[hsl(var(--emerald))] text-xs py-2"><Copy className="w-3 h-3" /> সব কপি ({pool?.length || 0})</button>
                  {pool && pool.length > 0 && (
                    <button onClick={() => { if (confirm("সত্যিই সব Key ডিলিট করতে চান?")) deleteAllKeysMutation.mutate(); }} disabled={deleteAllKeysMutation.isPending}
                      className="btn-primary bg-destructive text-xs py-2">
                      {deleteAllKeysMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Trash2 className="w-3 h-3" /> সব ডিলিট ({pool?.length})</>}
                    </button>
                  )}
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {pool?.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-2.5 bg-secondary/50 rounded-xl border border-border">
                      <div className="flex-1 truncate mr-3">
                        <div className="flex items-center gap-1.5">
                          {item.is_used ? (
                            <span className="text-[9px] bg-[hsl(var(--emerald))]/20 text-[hsl(var(--emerald))] px-1.5 py-0.5 rounded font-bold shrink-0">USED</span>
                          ) : (
                            <span className="text-[9px] bg-[hsl(var(--amber))]/20 text-[hsl(var(--amber))] px-1.5 py-0.5 rounded font-bold shrink-0">READY</span>
                          )}
                          <p className="text-xs font-mono truncate">{item.private_key}</p>
                          <button onClick={() => { navigator.clipboard.writeText(item.private_key); toast({ title: "কপি হয়েছে" }); }}
                            className="text-muted-foreground hover:text-foreground shrink-0"><Copy className="w-3 h-3" /></button>
                        </div>
                        {item.added_by !== "Unknown" && <span className="text-[9px] bg-[hsl(var(--blue))]/20 text-[hsl(var(--blue))] px-1.5 py-0.5 rounded font-bold mt-0.5 inline-block">{item.added_by}</span>}
                      </div>
                      <button onClick={() => deletePoolMutation.mutate(item.id)} className="text-destructive hover:bg-destructive/10 p-1 rounded shrink-0"><XCircle className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* User Management */}
        <Section icon={Users} title={`ইউজার ম্যানেজমেন্ট (${users?.length || 0})`} color="emerald">
          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="ফোন নম্বর দিয়ে সার্চ..." value={userMgmtSearch} onChange={(e) => setUserMgmtSearch(e.target.value)} className="input-field pl-10 text-sm" />
            </div>
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto">
              {users?.filter(u => !userMgmtSearch || u.guest_id.includes(userMgmtSearch)).map(u => (
                <div key={u.id} className="bg-secondary/50 border border-border rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm font-bold">{u.guest_id}</p>
                      <p className="text-xs text-muted-foreground">{u.display_name || "Unknown"} • Verified: <span className="text-primary font-bold">{u.key_count || 0}</span></p>
                      {u.email && <p className="text-[10px] text-muted-foreground">Email: {u.email}</p>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setEditingKeyCountUserId(u.id); setNewKeyCountValue(String(u.key_count || 0)); }}
                        className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-[hsl(var(--amber))] transition-colors"
                        title="Verified count এডিট করুন"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => verifiedBadgeMutation.mutate({ id: u.id, isVerifiedBadge: !(u as any).is_verified_badge })}
                        className={`p-1.5 rounded-lg transition-colors ${(u as any).is_verified_badge ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}
                        title="Verified badge"
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </button>
                      <button onClick={() => blockMutation.mutate({ id: u.id, isBlocked: !u.is_blocked })}
                        className={`p-1.5 rounded-lg transition-colors ${u.is_blocked ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"}`}>
                        {u.is_blocked ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                      </button>
                      <button onClick={() => resetCountMutation.mutate(u.id)} className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-primary transition-colors">
                        <RefreshCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {editingKeyCountUserId === u.id && (
                    <div className="flex items-center gap-2">
                      <input type="number" value={newKeyCountValue} onChange={(e) => setNewKeyCountValue(e.target.value)}
                        placeholder="Verified count দিন..." className="input-field text-sm flex-1" min="0" />
                      <button
                        disabled={updateKeyCountMutation.isPending || newKeyCountValue === ""}
                        onClick={() => updateKeyCountMutation.mutate({ id: u.id, keyCount: parseInt(newKeyCountValue) || 0 })}
                        className="px-3 py-2 bg-primary text-primary-foreground font-bold rounded-xl text-xs">
                        {updateKeyCountMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "সেভ"}
                      </button>
                      <button onClick={() => { setEditingKeyCountUserId(null); setNewKeyCountValue(""); }} className="p-1.5 text-muted-foreground hover:text-destructive"><XCircle className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                  {editingPasswordUserId === u.id ? (
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input type={showPassword[u.id] ? "text" : "password"} value={newPasswordValue} onChange={(e) => setNewPasswordValue(e.target.value)}
                          placeholder="নতুন পাসওয়ার্ড..." className="input-field pr-10 text-sm" />
                        <button onClick={() => setShowPassword(p => ({ ...p, [u.id]: !p[u.id] }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {showPassword[u.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                      <button disabled={resettingPassword || !newPasswordValue || newPasswordValue.length < 6}
                        onClick={async () => {
                          if (!u.auth_id) { toast({ title: "এই ইউজারের auth ID নেই", variant: "destructive" }); return; }
                          setResettingPassword(true);
                          try {
                            const { data, error } = await supabase.functions.invoke("admin-reset-password", { body: { auth_id: u.auth_id, new_password: newPasswordValue, admin_password: "Anamul-963050" } });
                            if (error) throw error;
                            if (data?.error) throw new Error(data.error);
                            toast({ title: "পাসওয়ার্ড পরিবর্তন হয়েছে ✓" });
                            setEditingPasswordUserId(null); setNewPasswordValue("");
                          } catch (err: any) { toast({ title: "ব্যর্থ", description: err.message, variant: "destructive" }); } finally { setResettingPassword(false); }
                        }}
                        className="px-3 py-2 bg-primary text-primary-foreground font-bold rounded-xl text-xs">
                        {resettingPassword ? <Loader2 className="w-3 h-3 animate-spin" /> : "সেভ"}
                      </button>
                      <button onClick={() => { setEditingPasswordUserId(null); setNewPasswordValue(""); }} className="p-1.5 text-muted-foreground hover:text-destructive"><XCircle className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingPasswordUserId(u.id); setNewPasswordValue(""); }}
                      className="text-[10px] text-[hsl(var(--cyan))] hover:underline flex items-center gap-1">
                      <Lock className="w-3 h-3" /> পাসওয়ার্ড পরিবর্তন
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ═══════════════════════════════════════ */}
        {/* 🎬 YouTube API Keys */}
        <Section icon={Youtube} title={`YouTube API Keys${savedYoutubeKeys.length ? ` (${savedYoutubeKeys.length})` : ""}`} color="destructive">
          <div className="space-y-4 pt-3">
            <p className="text-xs text-muted-foreground">প্রতিটি API key আলাদা লাইনে দিন। একাধিক key দিলে কোটা শেষ হলে অটো পরের key ব্যবহার হবে।</p>
            
            {/* Show saved keys (masked) */}
            {savedYoutubeKeys.length > 0 && (
              <div className="bg-secondary/30 rounded-xl p-3 space-y-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-bold text-muted-foreground">সেভ করা কীগুলো:</p>
                  <button
                    onClick={() => setShowFullYoutubeKeys((p) => !p)}
                    className="text-[10px] font-bold text-primary hover:opacity-80"
                  >
                    {showFullYoutubeKeys ? "Hide" : "Show"}
                  </button>
                </div>
                {savedYoutubeKeys.map((k, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <span>{showFullYoutubeKeys ? k : maskYoutubeKey(k)}</span>
                    <button onClick={async () => {
                      setYoutubeKeysLoading(true);
                      try {
                        const next = savedYoutubeKeys.filter((_, idx) => idx !== i);
                        await persistYoutubeKeys(next);
                        setSavedYoutubeKeys(next);
                        setYoutubeKeyStatus(null);
                        toast({ title: "API key ডিলিট হয়েছে" });
                      } catch {
                        toast({ title: "ডিলিট ব্যর্থ", variant: "destructive" });
                      } finally {
                        setYoutubeKeysLoading(false);
                      }
                    }} className="text-destructive hover:text-destructive/80 ml-auto" disabled={youtubeKeysLoading}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={youtubeApiKeyInput}
              onChange={(e) => setYoutubeApiKeyInput(e.target.value)}
              placeholder={"AIzaSy...\nAIzaSy...\nAIzaSy..."}
              className="input-field min-h-[100px] font-mono text-xs"
              rows={4}
            />
            <div className="flex gap-2">
              <button
                disabled={youtubeKeysLoading}
                onClick={async () => {
                  setYoutubeKeysLoading(true);
                  try {
                    const { data } = await supabase.from("settings").select("value").eq("key", "youtube_api_keys").maybeSingle();
                    const keys = parseYoutubeKeys(data?.value || "");
                    setSavedYoutubeKeys(keys);
                    setYoutubeApiKeyInput("");
                    toast({ title: keys.length > 0 ? "লোড হয়েছে" : "কোনো key সেভ নেই" });
                  } catch { toast({ title: "লোড ব্যর্থ", variant: "destructive" }); }
                  finally { setYoutubeKeysLoading(false); }
                }}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-xl text-sm font-bold"
              >
                {youtubeKeysLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "🔄 লোড"}
              </button>
              <button
                disabled={youtubeKeysLoading}
                onClick={async () => {
                  setYoutubeKeysLoading(true);
                  try {
                    const newKeys = parseYoutubeKeys(youtubeApiKeyInput);
                    if (newKeys.length === 0) {
                      toast({ title: "valid YouTube API key দিন", variant: "destructive" });
                      return;
                    }
                    const merged = Array.from(new Set([...savedYoutubeKeys, ...newKeys]));
                    await persistYoutubeKeys(merged);
                    setSavedYoutubeKeys(merged);
                    setYoutubeApiKeyInput("");
                    setYoutubeKeyStatus(null);
                    toast({ title: `${newKeys.length} টি নতুন key সেভ হয়েছে ✓` });
                  } catch (e: any) { toast({ title: "সেভ ব্যর্থ", description: e.message, variant: "destructive" }); }
                  finally { setYoutubeKeysLoading(false); }
                }}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold flex-1"
              >
                💾 সেভ করুন
              </button>
            </div>

            {/* Key Status Check */}
            <button
              onClick={async () => {
                try {
                  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
                  const res = await fetch(`${supabaseUrl}/functions/v1/youtube-search?action=key-status&probe=1`, {
                    headers: { "Authorization": `Bearer ${supabaseKey}` },
                  });
                  const data = await res.json();
                  setYoutubeKeyStatus(data);
                } catch { toast({ title: "স্ট্যাটাস চেক ব্যর্থ", variant: "destructive" }); }
              }}
              className="w-full px-4 py-2 bg-secondary/60 rounded-xl text-xs font-bold hover:bg-secondary transition-colors"
            >
              🔍 Key স্ট্যাটাস চেক করুন (লাইভ)
            </button>
            {youtubeKeyStatus && (
                <div className="bg-secondary/50 rounded-xl p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-bold">মোট: {youtubeKeyStatus.totalKeys} টি key</p>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${youtubeKeyStatus.available > 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                    {youtubeKeyStatus.available > 0 ? `${youtubeKeyStatus.available} টি সক্রিয় ✓` : "সব শেষ ✗"}
                  </span>
                </div>
                {youtubeKeyStatus.keys?.map((k: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 py-1 border-t border-border/30">
                    <span className={`w-2.5 h-2.5 rounded-full ${k.available ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                    <span className="font-mono text-[11px]">{k.prefix}</span>
                    <span className="ml-auto text-[10px]">
                      {k.available 
                        ? <span className="text-green-400">✓ সক্রিয়</span>
                        : <span className="text-red-400">✗ {k.status || "inactive"}{k.cooldownMinutes ? ` (~${k.cooldownMinutes}m)` : ""}</span>
                      }
                    </span>
                  </div>
                ))}
                {youtubeKeyStatus.keys?.map((k: any, i: number) => (
                  <div key={`msg-${i}`} className="text-[10px] text-muted-foreground leading-relaxed">
                    {k.prefix}: {k.message || (k.available ? "ready" : "unavailable")}
                  </div>
                ))}
                {youtubeKeyStatus.available === 0 && (
                  <p className="text-[10px] text-amber-400 mt-1">⚠️ সব API key এর কোটা শেষ। নতুন key যোগ করুন অথবা ১ ঘন্টা অপেক্ষা করুন।</p>
                )}
              </div>
            )}
          </div>
        </Section>

      </div>
    </div>
  );
}
