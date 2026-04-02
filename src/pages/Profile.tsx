import { useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { TransactionList } from "@/components/TransactionList";
import { ArrowLeft, Camera, User, Copy, Check, Pencil, X, Save, Key, Calendar, Phone, MessageCircle, Send, Headphones, ChevronDown, ChevronUp, History, Sparkles, Shield, Zap } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { getUserRequestHistory, getUserSubmittedBatches } from "@/lib/user-requests";

// Floating particle component
const FloatingParticle = ({ delay, x, size, color }: { delay: number; x: string; size: number; color: string }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{ left: x, width: size, height: size, background: color }}
    initial={{ y: "110vh", opacity: 0 }}
    animate={{ y: "-10vh", opacity: [0, 0.6, 0.6, 0] }}
    transition={{ duration: 8 + Math.random() * 6, delay, repeat: Infinity, ease: "linear" }}
  />
);

export default function Profile() {
  const { user, isLoading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [showSentRequests, setShowSentRequests] = useState(false);
  const [showSubmittedBatches, setShowSubmittedBatches] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingCover(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `cover-${user.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      await (supabase.from("users").update({ cover_url: urlData.publicUrl } as any).eq("id", user.id) as any);
      await refreshUser();
      toast({ title: "কভার ফটো আপডেট হয়েছে" });
    } catch {
      toast({ title: "আপলোড ব্যর্থ হয়েছে", variant: "destructive" });
    } finally {
      setUploadingCover(false);
    }
  };

  const { data: sentRequests = [] } = useQuery({
    queryKey: ["user-sent-requests", user?.guest_id],
    queryFn: () => getUserRequestHistory(user?.guest_id || ""),
    enabled: !!user?.guest_id && showSentRequests,
  });

  const { data: submittedBatches = [] } = useQuery({
    queryKey: ["user-submitted-batches", user?.guest_id],
    queryFn: () => getUserSubmittedBatches(user?.guest_id || ""),
    enabled: !!user?.guest_id && showSubmittedBatches,
  });

  const copyId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(String(user.id));
      setCopied(true);
      toast({ title: "কপি করা হয়েছে" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `${user.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      await supabase.from("users").update({ avatar_url: urlData.publicUrl }).eq("id", user.id);
      await refreshUser();
      toast({ title: "প্রোফাইল ছবি আপডেট হয়েছে" });
    } catch {
      toast({ title: "আপলোড ব্যর্থ হয়েছে", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveName = async () => {
    if (!user || !newName.trim() || newName.trim() === user.display_name) {
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await supabase.from("users").update({ display_name: newName.trim() }).eq("id", user.id);
      await refreshUser();
      setIsEditingName(false);
      toast({ title: "নাম আপডেট হয়েছে" });
    } catch {
      toast({ title: "আপডেট ব্যর্থ", variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  const joinDate = user.created_at ? new Date(user.created_at).toLocaleDateString("bn-BD", { year: "numeric", month: "long", day: "numeric" }) : "—";

  const requestStatusLabel: Record<string, { text: string; className: string }> = {
    pending: { text: "Pending", className: "bg-[hsl(var(--amber))]/20 text-[hsl(var(--amber))]" },
    submitted: { text: "Submitted", className: "bg-primary/20 text-primary" },
    reset: { text: "পেইড ✅", className: "bg-[hsl(var(--emerald))]/20 text-[hsl(var(--emerald))]" },
    cancelled: { text: "Cancelled", className: "bg-destructive/20 text-destructive" },
    dismissed: { text: "Dismissed", className: "bg-muted text-muted-foreground" },
  };

  return (
    <div className="min-h-screen bg-background pb-24 overflow-hidden">
      {/* Simplified background for performance */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-[-20%] right-[-20%] w-[600px] h-[600px] rounded-full blur-[120px]"
          style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.1), transparent 70%)" }}
        />
        <div
          className="absolute bottom-[-15%] left-[-15%] w-[500px] h-[500px] rounded-full blur-[120px]"
          style={{ background: "radial-gradient(circle, hsl(var(--purple) / 0.08), transparent 70%)" }}
        />
      </div>

      {/* Header */}
      <motion.header
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 20 }}
        className="sticky top-0 z-50 border-b border-border/50 bg-background/60 backdrop-blur-xl"
      >
        <div className="max-w-md mx-auto px-4 py-3.5 flex items-center gap-3">
          <motion.button
            onClick={() => navigate("/dashboard")}
            className="p-2.5 hover:bg-secondary rounded-xl transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h1 className="font-bold text-lg bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">প্রোফাইল</h1>
          </div>
        </div>
      </motion.header>

      <main className="max-w-md mx-auto px-4 pt-6 space-y-5 relative z-10">
        {/* Avatar & Name Card */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", damping: 15, delay: 0.1 }}
          className="rounded-3xl overflow-hidden relative"
        >
          {/* Animated border glow */}
          <motion.div
            className="absolute -inset-[1px] rounded-3xl z-0"
            style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.5), hsl(var(--cyan) / 0.3), hsl(var(--purple) / 0.5), hsl(var(--primary) / 0.5))", backgroundSize: "300% 300%" }}
            animate={{ backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"] }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          />
          <div className="relative z-10 bg-card rounded-3xl overflow-hidden">
            {/* Cover Photo */}
            <div className="h-32 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-[hsl(var(--purple))]/25 to-[hsl(var(--cyan))]/20" />
              {(user as any).cover_url && (
                <img src={(user as any).cover_url} alt="Cover" className="w-full h-full object-cover object-center" />
              )}
              {/* Cover shimmer */}
              <motion.div
                className="absolute inset-0 opacity-30"
                style={{ background: "linear-gradient(120deg, transparent 30%, hsl(var(--primary) / 0.2) 50%, transparent 70%)", backgroundSize: "200% 100%" }}
                animate={{ backgroundPosition: ["200% 0%", "-200% 0%"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              />
              <motion.button
                onClick={() => coverInputRef.current?.click()}
                className="absolute bottom-2 right-2 bg-background/70 backdrop-blur-sm text-foreground px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 border border-border/50"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {uploadingCover ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Camera className="w-3 h-3" />}
                কভার ফটো
              </motion.button>
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
            </div>

            <div className="px-8 pb-8 pt-4 text-center">
              {/* Animated avatar ring */}
              <div className="relative inline-block mb-4 -mt-16">
                <motion.div
                  className="absolute -inset-[3px] rounded-full z-0"
                  style={{ background: "conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--cyan)), hsl(var(--purple)), hsl(var(--pink)), hsl(var(--primary)))" }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                />
                <motion.button
                  onClick={handleAvatarClick}
                  disabled={uploading}
                  className="relative z-10 group"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-background bg-secondary flex items-center justify-center shadow-2xl">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-12 h-12 text-muted-foreground" />
                    )}
                  </div>
                  <motion.div
                    className="absolute bottom-1 right-1 bg-primary text-primary-foreground w-9 h-9 rounded-full flex items-center justify-center border-3 border-background shadow-lg shadow-primary/30"
                    whileHover={{ rotate: 15 }}
                  >
                    {uploading ? (
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                  </motion.div>
                </motion.button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>

              {/* Name */}
              <AnimatePresence mode="wait">
                {isEditingName ? (
                  <motion.div key="editing" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="flex items-center justify-center gap-2 mb-3">
                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="input-field text-center text-lg font-bold max-w-[200px] py-2"
                      autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setIsEditingName(false); }} />
                    <motion.button onClick={handleSaveName} disabled={savingName} className="p-2 bg-primary text-primary-foreground rounded-full" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                      {savingName ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                    </motion.button>
                    <motion.button onClick={() => setIsEditingName(false)} className="p-2 bg-secondary text-muted-foreground rounded-full" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                      <X className="w-4 h-4" />
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div key="display" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="flex items-center justify-center gap-2 mb-3">
                    <h2 className="text-xl font-black inline-flex items-center gap-1.5 bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text">
                      {user.display_name || "Unknown"}{user.is_verified_badge && <VerifiedBadge className="h-5 w-5" />}
                    </h2>
                    <motion.button
                      onClick={() => { setNewName(user.display_name || ""); setIsEditingName(true); }}
                      className="p-1.5 hover:bg-primary/20 rounded-full text-muted-foreground hover:text-primary transition-all"
                      whileHover={{ scale: 1.15, rotate: 15 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Pencil className="w-4 h-4" />
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Guest ID */}
              <motion.div
                className="inline-flex items-center gap-2 bg-secondary/60 backdrop-blur-sm px-4 py-1.5 rounded-full border border-border/50"
                whileHover={{ scale: 1.02 }}
              >
                <p className="text-xs text-muted-foreground font-mono">{user.guest_id}</p>
                <motion.button
                  onClick={copyId}
                  className="p-1 hover:bg-primary/20 rounded transition-colors"
                  whileTap={{ scale: 0.8 }}
                >
                  {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                </motion.button>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", damping: 15, delay: 0.2 }}
            className="relative rounded-2xl p-5 text-center space-y-1.5 overflow-hidden"
          >
            <motion.div
              className="absolute -inset-[1px] rounded-2xl z-0"
              style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.6), hsl(var(--cyan) / 0.3), hsl(var(--primary) / 0.6))", backgroundSize: "200% 200%" }}
              animate={{ backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            />
            <div className="relative z-10 bg-card rounded-2xl p-5 space-y-1.5">
              <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 1 }}>
                <Key className="w-7 h-7 text-primary mx-auto" />
              </motion.div>
              <motion.p
                className="text-3xl font-black text-primary"
                key={user.key_count}
                initial={{ scale: 1.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring" }}
              >
                {user.key_count || 0}
              </motion.p>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">ভেরিফাইড কি</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", damping: 15, delay: 0.3 }}
            className="relative rounded-2xl p-5 text-center space-y-1.5 overflow-hidden"
          >
            <motion.div
              className="absolute -inset-[1px] rounded-2xl z-0"
              style={{ background: "linear-gradient(135deg, hsl(var(--cyan) / 0.6), hsl(var(--emerald) / 0.3), hsl(var(--cyan) / 0.6))", backgroundSize: "200% 200%" }}
              animate={{ backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear", delay: 1 }}
            />
            <div className="relative z-10 bg-card rounded-2xl p-5 space-y-1.5">
              <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}>
                <Calendar className="w-7 h-7 text-[hsl(var(--cyan))] mx-auto" />
              </motion.div>
              <p className="text-sm font-bold text-foreground">{joinDate}</p>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">জয়েন তারিখ</p>
            </div>
          </motion.div>
        </div>

        {/* Sent Request History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 15, delay: 0.35 }}
        >
          <div className="rounded-3xl overflow-hidden relative">
            <motion.div
              className="absolute -inset-[1px] rounded-3xl z-0 opacity-50"
              style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.4), transparent 50%, hsl(var(--purple) / 0.4))" }}
            />
            <div className="relative z-10 bg-card rounded-3xl overflow-hidden">
              <motion.button
                onClick={() => setShowSentRequests(!showSentRequests)}
                className="w-full p-5 flex items-center justify-between hover:bg-secondary/20 transition-colors"
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    className="p-2.5 rounded-xl bg-primary/10"
                    animate={{ rotate: showSentRequests ? 360 : 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Send className="w-5 h-5 text-primary" />
                  </motion.div>
                  <h3 className="text-lg font-bold">পাঠানো Request ইতিহাস</h3>
                </div>
                <motion.div animate={{ rotate: showSentRequests ? 180 : 0 }} transition={{ duration: 0.3 }}>
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                </motion.div>
              </motion.button>
              <AnimatePresence>
                {showSentRequests && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 space-y-3">
                      {sentRequests.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">কোনো request পাঠানো হয়নি।</p>
                      ) : (
                        sentRequests.map((req, i) => (
                          <motion.div
                            key={req.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="bg-secondary/40 border border-border rounded-xl p-4 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-mono font-bold">→ {req.target_guest_id}</p>
                              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${requestStatusLabel[req.status]?.className || "bg-secondary text-muted-foreground"}`}>
                                {requestStatusLabel[req.status]?.text || req.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                                req.requester_payment_method === "bkash"
                                  ? "bg-[hsl(var(--pink))]/20 text-[hsl(var(--pink))]"
                                  : "bg-[hsl(var(--orange))]/20 text-[hsl(var(--orange))]"
                              }`}>
                                {req.requester_payment_method?.toUpperCase() || "N/A"}
                              </span>
                              <span className="text-sm font-mono font-bold">{req.requester_payment_number}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Verified: <span className="text-primary font-bold">{req.requester_verified_count}</span> • {new Date(req.created_at).toLocaleString("bn-BD")}
                            </p>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Submitted Batches History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 15, delay: 0.4 }}
        >
          <div className="rounded-3xl overflow-hidden relative">
            <motion.div
              className="absolute -inset-[1px] rounded-3xl z-0 opacity-50"
              style={{ background: "linear-gradient(135deg, hsl(var(--cyan) / 0.4), transparent 50%, hsl(var(--emerald) / 0.4))" }}
            />
            <div className="relative z-10 bg-card rounded-3xl overflow-hidden">
              <motion.button
                onClick={() => setShowSubmittedBatches(!showSubmittedBatches)}
                className="w-full p-5 flex items-center justify-between hover:bg-secondary/20 transition-colors"
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    className="p-2.5 rounded-xl bg-[hsl(var(--cyan))]/10"
                    animate={{ rotate: showSubmittedBatches ? 360 : 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <History className="w-5 h-5 text-[hsl(var(--cyan))]" />
                  </motion.div>
                  <h3 className="text-lg font-bold">Submit করা লিস্ট ইতিহাস</h3>
                </div>
                <motion.div animate={{ rotate: showSubmittedBatches ? 180 : 0 }} transition={{ duration: 0.3 }}>
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                </motion.div>
              </motion.button>
              <AnimatePresence>
                {showSubmittedBatches && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 space-y-4">
                      {submittedBatches.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">কোনো submission নেই।</p>
                      ) : (
                        submittedBatches.map((batch, i) => (
                          <motion.div
                            key={batch.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="bg-secondary/40 border border-border rounded-xl p-4 space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground">{new Date(batch.submitted_at).toLocaleString("bn-BD")}</p>
                                <p className="text-sm font-bold">{batch.request_count} টি request</p>
                              </div>
                              <motion.span
                                className="text-xs font-bold px-2 py-1 rounded-lg bg-primary/20 text-primary"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", delay: i * 0.08 + 0.2 }}
                              >
                                Submitted
                              </motion.span>
                            </div>

                            <div className="space-y-2 border-t border-border pt-3">
                              {batch.requests.map((req) => (
                                <div key={req.id} className="bg-background/50 border border-border/60 rounded-lg p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-mono font-bold">{req.requester_guest_id}</span>
                                    <span className="text-xs font-bold text-primary">{req.requester_verified_count} verified</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                                      req.requester_payment_method === "bkash"
                                        ? "bg-[hsl(var(--pink))]/20 text-[hsl(var(--pink))]"
                                        : "bg-[hsl(var(--orange))]/20 text-[hsl(var(--orange))]"
                                    }`}>
                                      {req.requester_payment_method?.toUpperCase() || "N/A"}
                                    </span>
                                    <span className="text-sm font-mono">{req.requester_payment_number}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Support Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 15, delay: 0.45 }}
        >
          <div className="rounded-3xl overflow-hidden relative">
            <motion.div
              className="absolute -inset-[1px] rounded-3xl z-0 opacity-40"
              style={{ background: "linear-gradient(135deg, hsl(var(--amber) / 0.5), transparent 50%, hsl(var(--pink) / 0.5))" }}
            />
            <div className="relative z-10 bg-card rounded-3xl p-6 space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <motion.div animate={{ y: [0, -2, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                  <Headphones className="w-5 h-5 text-primary" />
                </motion.div>
                সাপোর্ট
              </h3>
              <div className="space-y-3">
                <motion.div
                  className="flex items-center gap-3 p-3.5 bg-secondary/50 rounded-xl border border-border/50"
                  whileHover={{ scale: 1.02, x: 4 }}
                  transition={{ type: "spring", damping: 15 }}
                >
                  <div className="p-2 rounded-lg bg-primary/10">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ডেভেলপার</p>
                    <p className="font-bold text-sm">Md Anamul Haque</p>
                  </div>
                </motion.div>
                <motion.a
                  href="https://wa.me/8801892564963" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3.5 bg-[hsl(var(--emerald))]/8 border border-[hsl(var(--emerald))]/20 rounded-xl"
                  whileHover={{ scale: 1.02, x: 4 }}
                  transition={{ type: "spring", damping: 15 }}
                >
                  <div className="p-2 rounded-lg bg-[hsl(var(--emerald))]/15">
                    <MessageCircle className="w-4 h-4 text-[hsl(var(--emerald))]" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">WhatsApp</p>
                    <p className="font-bold text-sm text-[hsl(var(--emerald))]">01892564963</p>
                  </div>
                </motion.a>
                <motion.a
                  href="https://t.me/+6a3iUf1_GAhiMWY1" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3.5 bg-[hsl(var(--blue))]/8 border border-[hsl(var(--blue))]/20 rounded-xl"
                  whileHover={{ scale: 1.02, x: 4 }}
                  transition={{ type: "spring", damping: 15 }}
                >
                  <div className="p-2 rounded-lg bg-[hsl(var(--blue))]/15">
                    <Send className="w-4 h-4 text-[hsl(var(--blue))]" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Telegram Group</p>
                    <p className="font-bold text-sm text-[hsl(var(--blue))]">Join Telegram Group</p>
                  </div>
                </motion.a>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Transaction History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 15, delay: 0.5 }}
        >
          <h3 className="text-lg font-bold mb-4 px-2 flex items-center gap-2">
            <Zap className="w-5 h-5 text-[hsl(var(--amber))]" />
            লেনদেনের ইতিহাস
          </h3>
          <TransactionList />
        </motion.div>
      </main>
    </div>
  );
}
