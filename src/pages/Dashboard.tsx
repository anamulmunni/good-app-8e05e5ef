import { useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { KeySubmitter } from "@/components/KeySubmitter";
import { WithdrawForm } from "@/components/WithdrawForm";
import { TransactionList } from "@/components/TransactionList";
import { LogOut, User, Wallet, Copy, Check, Bell, Send, Loader2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPublicSettings, updateUserPaymentStatus, addSubmittedNumbers, getExistingPhoneNumbers, getAllUsers } from "@/lib/api";

export default function Dashboard() {
  const { user, logout, isLoading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [showTelegramAdmin, setShowTelegramAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [batchNumbers, setBatchNumbers] = useState("");
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [isNameSet, setIsNameSet] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("bkash");
  const [paymentNumber, setPaymentNumber] = useState("");
  const [serverDuplicates, setServerDuplicates] = useState<string[]>([]);
  const [lookupResults, setLookupResults] = useState<any[]>([]);

  const lookupTimerRef = useRef<any>(null);
  const dupCheckTimerRef = useRef<any>(null);

  const { data: publicSettings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: getPublicSettings,
  });

  const { data: allUsers } = useQuery({
    queryKey: ["all-users"],
    queryFn: getAllUsers,
    enabled: isPasswordVerified,
  });

  const checkServerDuplicates = async (nums: string[]) => {
    try {
      const existing = await getExistingPhoneNumbers();
      setServerDuplicates(nums.filter(n => existing.includes(n)));
    } catch { setServerDuplicates([]); }
  };

  const handleBatchNumbersChange = (val: string) => {
    setBatchNumbers(val);
    const lines = val.split("\n").map(l => l.trim()).filter(Boolean);
    const seen = new Set<string>();
    const dups = new Set<string>();
    lines.forEach(num => {
      if (seen.has(num)) dups.add(num);
      seen.add(num);
    });
    setDuplicates(Array.from(dups));
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    if (dupCheckTimerRef.current) clearTimeout(dupCheckTimerRef.current);
    if (lines.length > 0) {
      lookupTimerRef.current = setTimeout(() => lookupNumbers(lines), 500);
      dupCheckTimerRef.current = setTimeout(() => checkServerDuplicates(lines), 500);
    } else {
      setLookupResults([]);
      setServerDuplicates([]);
    }
  };

  const removeDuplicate = (num: string) => {
    const lines = batchNumbers.split("\n").map(l => l.trim()).filter(Boolean);
    const firstIndex = lines.indexOf(num);
    const filtered = lines.filter((l, idx) => l !== num || idx === firstIndex);
    setBatchNumbers(filtered.join("\n"));
    setDuplicates(duplicates.filter(d => d !== num));
  };

  const lookupNumbers = (nums: string[]) => {
    if (!allUsers) return;
    const results = nums.map(num => {
      const u = allUsers.find(u => u.guest_id === num);
      return { guestId: num, keyCount: u?.key_count || 0, balance: u?.balance || 0 };
    });
    setLookupResults(results);
  };

  const submitNumbersMutation = useMutation({
    mutationFn: async (numbers: string[]) => {
      await addSubmittedNumbers(numbers, adminName, paymentNumber || undefined, paymentNumber ? paymentMethod : undefined);
    },
    onSuccess: () => {
      setBatchNumbers("");
      setPaymentNumber("");
      setServerDuplicates([]);
      toast({ title: "সফলভাবে সাবমিট করা হয়েছে" });
    },
    onError: () => {
      toast({ title: "সাবমিট ব্যর্থ হয়েছে", variant: "destructive" });
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

  const getBatchInfo = () => {
    const lines = batchNumbers.split("\n").map(l => l.trim()).filter(Boolean);
    let totalVerified = 0;
    const details = lines.map(num => {
      const u = lookupResults?.find((u: any) => u.guestId === num);
      totalVerified += u?.keyCount || 0;
      return { num, count: u?.keyCount || 0 };
    });
    return { totalVerified, details };
  };

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
        {/* Telegram Admin Section */}
        <section className="glass-card p-6 rounded-3xl border-2 border-primary/30">
          <button onClick={() => setShowTelegramAdmin(!showTelegramAdmin)} className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3 text-primary">
              <Send className="w-6 h-6" />
              <h2 className="text-xl font-bold">Payment Request Only Telegram Admin</h2>
            </div>
          </button>

          <AnimatePresence>
            {showTelegramAdmin && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-6 space-y-4">
                {!isPasswordVerified ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">পাসওয়ার্ড দিন:</p>
                    <input type="password" placeholder="পাসওয়ার্ড..." className="input-field" value={adminPassword}
                      onChange={(e) => { setAdminPassword(e.target.value); if (e.target.value === "anamul984516") setIsPasswordVerified(true); }} />
                  </div>
                ) : !isNameSet ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">আপনার নাম লিখুন:</p>
                    <input type="text" placeholder="আপনার নাম..." className="input-field" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
                    <button onClick={() => { if (adminName.trim()) setIsNameSet(true); }} className="btn-primary py-3 font-black" disabled={!adminName.trim()}>এগিয়ে যান</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-secondary/50 p-4 rounded-xl border border-border">
                      <p className="text-sm font-bold mb-2">Total Verified: <span className="text-primary">{getBatchInfo().totalVerified}</span></p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {getBatchInfo().details.map((d, i) => (
                          <p key={i} className="text-xs flex justify-between"><span>{d.num}</span><span className="text-primary font-bold">{d.count} টা</span></p>
                        ))}
                      </div>
                    </div>
                    <textarea placeholder="ইউজার নম্বরগুলো দিন (প্রতি লাইনে একটি)..." className={`input-field min-h-[120px] font-mono text-sm ${duplicates.length > 0 ? "border-destructive" : ""}`}
                      value={batchNumbers} onChange={(e) => handleBatchNumbersChange(e.target.value)} />
                    {duplicates.length > 0 && (
                      <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 space-y-2">
                        <p className="text-xs text-destructive font-bold flex items-center gap-1"><XCircle className="w-3 h-3" /> ডুপ্লিকেট নম্বর পাওয়া গেছে:</p>
                        <div className="flex flex-wrap gap-2">
                          {duplicates.map(num => (
                            <div key={num} className="bg-destructive/20 text-destructive text-[10px] px-2 py-1 rounded-md flex items-center gap-1">
                              {num}<button onClick={() => removeDuplicate(num)} className="hover:text-foreground"><XCircle className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {serverDuplicates.length > 0 && (
                      <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 space-y-2">
                        <p className="text-xs text-accent font-bold flex items-center gap-1"><XCircle className="w-3 h-3" /> আগেই সাবমিট করা হয়েছে:</p>
                        <div className="flex flex-wrap gap-2">
                          {serverDuplicates.map(num => (<div key={num} className="bg-accent/20 text-accent text-[10px] px-2 py-1 rounded-md font-mono font-bold">{num}</div>))}
                        </div>
                      </div>
                    )}
                    <div className="bg-secondary/50 p-4 rounded-xl border border-border space-y-3">
                      <p className="text-sm font-bold text-muted-foreground">পেমেন্ট নম্বর (bKash/Nagad)</p>
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1 bg-secondary p-1 rounded-xl border border-border">
                          <button onClick={() => setPaymentMethod("bkash")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${paymentMethod === "bkash" ? "bg-[hsl(var(--pink))] text-foreground shadow-lg" : "text-muted-foreground"}`}>bKash</button>
                          <button onClick={() => setPaymentMethod("nagad")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${paymentMethod === "nagad" ? "bg-[hsl(var(--orange))] text-foreground shadow-lg" : "text-muted-foreground"}`}>Nagad</button>
                        </div>
                        <input type="text" placeholder="01XXXXXXXXX" value={paymentNumber} onChange={(e) => setPaymentNumber(e.target.value)} className="input-field flex-1" />
                      </div>
                    </div>
                    {(duplicates.length > 0 || serverDuplicates.length > 0) ? (
                      <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-center">
                        <p className="text-sm text-destructive font-bold">ডুপ্লিকেট নম্বর সরান, তারপর সাবমিট করুন</p>
                      </div>
                    ) : (
                      <button onClick={() => submitNumbersMutation.mutate(batchNumbers.split("\n").map(l => l.trim()).filter(Boolean))}
                        className="btn-primary py-4 font-black" disabled={submitNumbersMutation.isPending || !batchNumbers.trim()}>
                        {submitNumbersMutation.isPending ? <Loader2 className="animate-spin" /> : <><Send className="w-5 h-5" /> Submit Request</>}
                      </button>
                    )}
                  </div>
                )}
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
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-gradient-to-r from-accent/20 to-[hsl(var(--amber))]/20 border-2 border-accent/50 rounded-2xl p-6 text-center shadow-lg shadow-accent/10">
              <p className="text-xl font-black text-accent mb-2">🔥 ধামাকা বোনাস অফার! 🔥</p>
              <p className="text-sm font-bold leading-relaxed">
                ১ দিনে {targetAmount}টি অ্যাকাউন্ট ভেরিফাই করতে পারলে বর্তমান দামের সাথে আরও <span className="text-accent text-lg">২০% বোনাস</span> দেওয়া হবে!
              </p>
            </motion.div>

            <div className="glass-card p-5 rounded-3xl border border-border">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm font-bold">আজকের টার্গেট (Bonus)</p>
                <p className="text-xs font-mono bg-primary/20 text-primary px-2 py-1 rounded-lg">{user.key_count}/{targetAmount}</p>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: targetAmount }, (_, i) => {
                  const done = i < user.key_count;
                  return (
                    <motion.div key={i} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.05 }}
                      className={`aspect-square rounded-xl flex items-center justify-center border-2 transition-all ${done ? "bg-primary/20 border-primary shadow-lg shadow-primary/20" : "bg-secondary border-border"}`}>
                      {done ? <Check className="w-5 h-5 text-primary" /> : <span className="text-xs text-muted-foreground font-bold">{i + 1}</span>}
                    </motion.div>
                  );
                })}
              </div>
              {user.key_count >= targetAmount ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-3 bg-primary/20 border border-primary/40 rounded-xl text-center">
                  <p className="text-primary font-bold text-sm">🎉 আপনি বোনাসের জন্য এলিজিবল হয়েছেন!</p>
                </motion.div>
              ) : (
                <p className="text-[10px] text-muted-foreground mt-3 text-center">{targetAmount}টি টার্গেট পূর্ণ হলে বোনাস আনলক হবে</p>
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
    </div>
  );
}
