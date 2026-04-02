import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Loader2, Copy, CheckCircle, Clock, Users, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

type AuditPhase = {
  label: string;
  dateRange: string;
  count: number;
  status: "paid" | "unpaid";
  resetId?: number;
  resetDate?: string;
  paymentNumber?: string;
  paymentMethod?: string;
};

type AuditData = {
  user: {
    id: number;
    guest_id: string;
    display_name: string | null;
    avatar_url: string | null;
    key_count: number;
    balance: number;
    created_at: string | null;
  };
  phases: AuditPhase[];
  totalEarnings: number;
  totalPaid: number;
  totalUnpaid: number;
  duplicateAttempts: number;
  correctKeyCount: number;
};

async function fetchUserAudit(guestId: string): Promise<AuditData | null> {
  const searchTerm = guestId.trim();
  
  // Try exact guest_id match first
  let { data: userData, error: userError } = await supabase
    .from("users")
    .select("*")
    .eq("guest_id", searchTerm)
    .maybeSingle();

  // If not found, try numeric ID match
  if (!userData && /^\d+$/.test(searchTerm)) {
    const numId = parseInt(searchTerm);
    const { data: byId, error: byIdErr } = await supabase
      .from("users")
      .select("*")
      .eq("id", numId)
      .maybeSingle();
    if (byIdErr) throw byIdErr;
    userData = byId;
  }

  // If still not found, try partial guest_id match
  if (!userData) {
    const { data: partial, error: partialErr } = await supabase
      .from("users")
      .select("*")
      .ilike("guest_id", `%${searchTerm}%`)
      .limit(1)
      .maybeSingle();
    if (partialErr) throw partialErr;
    userData = partial;
  }

  // If still not found, try display_name match
  if (!userData) {
    const { data: byName, error: nameErr } = await supabase
      .from("users")
      .select("*")
      .ilike("display_name", `%${searchTerm}%`)
      .limit(1)
      .maybeSingle();
    if (nameErr) throw nameErr;
    userData = byName;
  }

  if (userError) throw userError;
  if (!userData) return null;

  // Fetch earnings
  const { data: earnings, error: earningsError } = await supabase
    .from("transactions")
    .select("id, created_at, type")
    .eq("user_id", userData.id)
    .eq("type", "earning")
    .order("created_at", { ascending: true });

  if (earningsError) throw earningsError;

  // Fetch duplicate attempts
  const { data: dupes, error: dupesError } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", userData.id)
    .eq("type", "duplicate_attempt");

  if (dupesError) throw dupesError;

  // Fetch reset history
  const { data: resets, error: resetsError } = await supabase
    .from("reset_history")
    .select("*")
    .eq("phone_number", userData.guest_id)
    .order("reset_at", { ascending: true });

  if (resetsError) throw resetsError;

  // Build phases
  const phases: AuditPhase[] = [];
  let totalPaid = 0;
  const allEarnings = earnings || [];
  const allResets = resets || [];

  let prevDate = userData.created_at || allEarnings[0]?.created_at || new Date().toISOString();

  allResets.forEach((reset, index) => {
    const resetDate = reset.reset_at || "";
    const phaseEarnings = allEarnings.filter(e => {
      const ct = new Date(e.created_at || "").getTime();
      const start = new Date(prevDate).getTime();
      const end = new Date(resetDate).getTime();
      return ct >= start && ct < end;
    });

    phases.push({
      label: `পর্যায় ${toBanglaNum(index + 1)}`,
      dateRange: `${formatDateBn(prevDate)} — ${formatDateBn(resetDate)}`,
      count: phaseEarnings.length,
      status: "paid",
      resetId: reset.id,
      resetDate: resetDate,
      paymentNumber: reset.payment_number || undefined,
      paymentMethod: reset.payment_method || undefined,
    });

    totalPaid += phaseEarnings.length;
    prevDate = resetDate;
  });

  // Current phase (unpaid)
  const currentEarnings = allEarnings.filter(e => {
    const ct = new Date(e.created_at || "").getTime();
    const start = new Date(prevDate).getTime();
    return ct >= start;
  });

  if (currentEarnings.length > 0 || allResets.length === 0) {
    phases.push({
      label: `পর্যায় ${toBanglaNum(allResets.length + 1)} (বর্তমান)`,
      dateRange: `${formatDateBn(prevDate)} — বর্তমান`,
      count: currentEarnings.length,
      status: "unpaid",
    });
  }

  const totalUnpaid = currentEarnings.length;

  return {
    user: {
      id: userData.id,
      guest_id: userData.guest_id,
      display_name: userData.display_name,
      avatar_url: userData.avatar_url,
      key_count: userData.key_count || 0,
      balance: userData.balance || 0,
      created_at: userData.created_at,
    },
    phases,
    totalEarnings: allEarnings.length,
    totalPaid,
    totalUnpaid,
    duplicateAttempts: dupes?.length || 0,
    correctKeyCount: totalUnpaid,
  };
}

function toBanglaNum(n: number): string {
  const banglaDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(n).replace(/\d/g, d => banglaDigits[parseInt(d)]);
}

function formatDateBn(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

const phaseColors = [
  { bg: "bg-[hsl(var(--cyan))]/10", border: "border-[hsl(var(--cyan))]/30", text: "text-[hsl(var(--cyan))]", dot: "bg-[hsl(var(--cyan))]" },
  { bg: "bg-[hsl(var(--purple))]/10", border: "border-[hsl(var(--purple))]/30", text: "text-[hsl(var(--purple))]", dot: "bg-[hsl(var(--purple))]" },
  { bg: "bg-[hsl(var(--blue))]/10", border: "border-[hsl(var(--blue))]/30", text: "text-[hsl(var(--blue))]", dot: "bg-[hsl(var(--blue))]" },
  { bg: "bg-[hsl(var(--emerald))]/10", border: "border-[hsl(var(--emerald))]/30", text: "text-[hsl(var(--emerald))]", dot: "bg-[hsl(var(--emerald))]" },
  { bg: "bg-[hsl(var(--pink))]/10", border: "border-[hsl(var(--pink))]/30", text: "text-[hsl(var(--pink))]", dot: "bg-[hsl(var(--pink))]" },
];

export function UserAuditCard() {
  const [searchInput, setSearchInput] = useState("");
  const [searchGuestId, setSearchGuestId] = useState("");
  const { toast } = useToast();

  const { data: audit, isLoading, error } = useQuery({
    queryKey: ["user-audit", searchGuestId],
    queryFn: () => fetchUserAudit(searchGuestId),
    enabled: searchGuestId.length > 0,
  });

  const handleSearch = () => {
    const trimmed = searchInput.trim();
    if (trimmed) setSearchGuestId(trimmed);
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
          <input
            type="text"
            placeholder="নম্বর / নাম / User ID লিখুন..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full pl-10 pr-3 py-3 rounded-xl bg-secondary/80 border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <button 
          onClick={handleSearch} 
          className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm whitespace-nowrap disabled:opacity-50"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "খুঁজুন"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          ❌ ত্রুটি: {(error as Error).message}
        </div>
      )}

      {/* No result */}
      {searchGuestId && !isLoading && audit === null && (
        <div className="p-4 rounded-xl bg-secondary/50 border border-border text-center text-muted-foreground text-sm">
          এই নম্বরে কোনো ইউজার পাওয়া যায়নি
        </div>
      )}

      {/* Audit Card */}
      <AnimatePresence mode="wait">
        {audit && (
          <motion.div
            key={audit.user.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-3"
          >
            {/* User Info */}
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-secondary/50 border border-border">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-primary to-[hsl(var(--cyan))] flex items-center justify-center flex-shrink-0">
                {audit.user.avatar_url ? (
                  <img src={audit.user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-black text-foreground">{(audit.user.display_name || audit.user.guest_id)[0]?.toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-lg truncate">{audit.user.display_name || audit.user.guest_id}</p>
                <p className="text-xs text-muted-foreground">ID: {audit.user.id} • {audit.user.guest_id}</p>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl border-2 border-[hsl(var(--cyan))]/30 text-center" style={{ background: "hsl(var(--cyan) / 0.08)" }}>
                <p className="text-2xl font-black text-[hsl(var(--cyan))]">{toBanglaNum(audit.totalEarnings)}</p>
                <p className="text-[10px] text-muted-foreground font-semibold">সর্বমোট আর্নিং</p>
              </div>
              <div className="p-3 rounded-xl border-2 border-[hsl(var(--emerald))]/30 text-center" style={{ background: "hsl(var(--emerald) / 0.08)" }}>
                <p className="text-2xl font-black text-[hsl(var(--emerald))]">{toBanglaNum(audit.totalPaid)}</p>
                <p className="text-[10px] text-muted-foreground font-semibold">পেইড ✅</p>
              </div>
              <div className="p-3 rounded-xl border-2 border-[hsl(var(--amber))]/30 text-center" style={{ background: "hsl(var(--amber) / 0.08)" }}>
                <p className="text-2xl font-black text-[hsl(var(--amber))]">{toBanglaNum(audit.totalUnpaid)}</p>
                <p className="text-[10px] text-muted-foreground font-semibold">আনপেইড</p>
              </div>
            </div>

            {/* Phase Breakdown */}
            <div className="rounded-2xl border border-border bg-secondary/30 overflow-hidden">
              <div className="p-3 border-b border-border bg-secondary/50">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  পর্যায়ভিত্তিক বিস্তারিত হিসাব
                </h3>
              </div>
              <div className="divide-y divide-border/50">
                {audit.phases.map((phase, i) => {
                  const colors = phaseColors[i % phaseColors.length];
                  const isUnpaid = phase.status === "unpaid";
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="p-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${isUnpaid ? "bg-[hsl(var(--amber))]" : colors.dot}`} />
                          <div>
                            <p className={`font-bold text-sm ${isUnpaid ? "text-[hsl(var(--amber))]" : colors.text}`}>
                              {phase.label}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{phase.dateRange}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm">{toBanglaNum(phase.count)}টা</p>
                          <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isUnpaid
                              ? "bg-[hsl(var(--amber))]/15 text-[hsl(var(--amber))]"
                              : "bg-[hsl(var(--emerald))]/15 text-[hsl(var(--emerald))]"
                          }`}>
                            {isUnpaid ? "⏳ আনপেইড" : "✅ পেইড"}
                          </span>
                        </div>
                      </div>
                      {phase.paymentNumber && (
                        <div className="mt-1.5 ml-4.5 flex items-center gap-1">
                          <p className="text-[10px] text-[hsl(var(--amber))] font-bold">
                            💳 {phase.paymentMethod?.toUpperCase() || "N/A"} — {phase.paymentNumber}
                          </p>
                          <button
                            onClick={() => { navigator.clipboard.writeText(phase.paymentNumber!); toast({ title: "কপি হয়েছে" }); }}
                            className="p-0.5 hover:bg-[hsl(var(--amber))]/20 rounded transition-colors"
                          >
                            <Copy className="w-3 h-3 text-[hsl(var(--amber))]" />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Summary Footer */}
            <div className="rounded-2xl border border-border bg-secondary/30 p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">🚫 ডুপ্লিকেট চেষ্টা</span>
                <span className={`font-bold ${audit.duplicateAttempts > 0 ? "text-destructive" : "text-[hsl(var(--emerald))]"}`}>
                  {toBanglaNum(audit.duplicateAttempts)}টা
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">📱 বর্তমান Key Count</span>
                <span className={`font-bold ${audit.user.key_count !== audit.correctKeyCount ? "text-[hsl(var(--amber))]" : "text-[hsl(var(--emerald))]"}`}>
                  {toBanglaNum(audit.user.key_count)}
                  {audit.user.key_count !== audit.correctKeyCount && (
                    <span className="text-[10px] ml-1">(সঠিক: {toBanglaNum(audit.correctKeyCount)})</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">✅ সব কী ব্লকচেইনে ভেরিফাইড</span>
                <span className="font-bold text-[hsl(var(--emerald))]">হ্যাঁ</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
