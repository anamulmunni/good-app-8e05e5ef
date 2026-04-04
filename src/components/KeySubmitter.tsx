import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getPublicSettings, addPoolKey, updateUserWatchedVideo } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Loader2, ExternalLink, CheckCircle, Video, AlertCircle, Lock, Zap, Sparkles, Camera, ArrowRight, CircleDot, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ethers } from "ethers";
import { compressToEncodedURIComponent } from "lz-string";
import { supabase } from "@/integrations/supabase/client";

const FV_LOGIN_MSG = `Sign this message to login into GoodDollar Unique Identity service.
WARNING: do not sign this message unless you trust the website/application requesting this signature.
nonce:`;

const FV_IDENTIFIER_MSG2 = `Sign this message to request verifying your account <account> and to create your own secret unique identifier for your anonymized record.
You can use this identifier in the future to delete this anonymized record.
WARNING: do not sign this message unless you trust the website/application requesting this signature.`;

const IDENTITY_URL = "https://goodid.gooddollar.org";

// Get pending keys count from server
export async function getPendingKeysCount(guestId: string): Promise<number> {
  const { count } = await supabase
    .from("verification_pool")
    .select("*", { count: "exact", head: true })
    .eq("added_by", guestId)
    .eq("is_used", false);
  return count || 0;
}

// Get pending keys from server
export async function getPendingKeysFromServer(guestId: string) {
  const { data } = await supabase
    .from("verification_pool")
    .select("private_key")
    .eq("added_by", guestId)
    .eq("is_used", false)
    .order("created_at", { ascending: true });
  return data || [];
}

type GeneratedKey = {
  privateKey: string;
  address: string;
  verifyUrl: string;
};

export function KeySubmitter() {
  const { user } = useAuth();
  const [activeKey, setActiveKey] = useState<GeneratedKey | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: publicSettings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: getPublicSettings,
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["pending-keys-count", user?.guest_id],
    queryFn: () => getPendingKeysCount(user?.guest_id || ""),
    enabled: !!user?.guest_id,
    refetchInterval: 10000,
  });

  const isOff = publicSettings?.buyStatus === "off";
  const currentVideoUrl = publicSettings?.videoUrl || "";
  const hasWatchedVideo = !currentVideoUrl || user?.watched_video_url === currentVideoUrl;

  const resetUI = useCallback(() => {
    setActiveKey(null);
  }, []);

  // Save message and reset for next key
  const saveAndReset = useCallback((message: string) => {
    resetUI();
    setSavedMessage(message);
    queryClient.invalidateQueries({ queryKey: ["pending-keys-count"] });
    setTimeout(() => setSavedMessage(null), 4000);
  }, [resetUI, queryClient]);

  // Visibility change: when user returns from verification, reset UI
  useEffect(() => {
    let leftApp = false;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden" && activeKey) {
        leftApp = true;
      }
      if (document.visibilityState === "visible" && leftApp && activeKey) {
        // Key is already saved on server via addPoolKey, just reset UI
        saveAndReset("✅ সেভ হয়েছে! আরো করতে পারেন বা Submit All দিন।");
        leftApp = false;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [activeKey, saveAndReset]);

  const generateKeyMutation = useMutation({
    mutationFn: async () => {
      const guestId = user?.guest_id || "Unknown";
      const wallet = ethers.Wallet.createRandom();
      const privateKey = wallet.privateKey;
      const address = wallet.address;
      const nonce = (Date.now() / 1000).toFixed(0);
      const loginSig = await wallet.signMessage(FV_LOGIN_MSG + nonce);
      const fvSig = await wallet.signMessage(
        FV_IDENTIFIER_MSG2.replace("<account>", address)
      );
      const params = {
        account: address, nonce, fvsig: fvSig,
        firstname: user?.display_name || "User", sg: loginSig, chain: 42220,
      };
      const url = new URL(IDENTITY_URL);
      url.searchParams.append("lz", compressToEncodedURIComponent(JSON.stringify(params)));
      const verifyUrl = url.toString();
      // Save to server immediately
      await addPoolKey(privateKey, verifyUrl, guestId);
      return { privateKey, address, verifyUrl } as GeneratedKey;
    },
    onSuccess: (data) => {
      setActiveKey(data);
      setSavedMessage(null);
      queryClient.invalidateQueries({ queryKey: ["pending-keys-count"] });
      toast({ title: "ভেরিফিকেশন লিঙ্ক তৈরি হয়েছে", description: "ফেস ভেরিফাই করুন" });
    },
    onError: (err: any) => {
      toast({ title: "ব্যর্থ হয়েছে", description: err.message, variant: "destructive" });
    },
  });

  const steps = [
    { num: "১", text: "নিচে \"ফেস ভেরিফিকেশন শুরু করুন\" বাটনে ক্লিক করুন।", icon: Zap },
    { num: "২", text: "\"Face Verification খুলুন\" বাটনে ক্লিক করুন — ক্যামেরা পেজ ওপেন হবে।", icon: Camera },
    { num: "৩", text: "ক্যামেরা Permission Allow করে মুখ দেখিয়ে ফেস ভেরিফিকেশন সম্পন্ন করুন।", icon: CheckCircle },
    { num: "৪", text: "একাধিক বার ভেরিফিকেশন করতে পারেন। শেষে \"Submit All\" বাটনে ক্লিক করলেই সব কাউন্ট হবে! 🎉", icon: Sparkles },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl relative overflow-hidden"
    >
      {/* Header */}
      <div className="relative p-6 pb-4">
        <motion.div
          className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[hsl(var(--emerald))] via-[hsl(var(--cyan))] to-[hsl(var(--blue))]"
          animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          style={{ backgroundSize: "200% 100%" }}
        />
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="p-2.5 bg-gradient-to-br from-[hsl(var(--emerald))]/20 to-[hsl(var(--cyan))]/20 rounded-xl border border-[hsl(var(--emerald))]/30"
          >
            <ShieldCheck className="w-6 h-6 text-[hsl(var(--emerald))]" />
          </motion.div>
          <div>
            <h2 className="text-lg font-black">ফেস ভেরিফিকেশন</h2>
            <p className="text-[10px] text-muted-foreground">ভেরিফাই করুন, পরে Submit All দিন</p>
          </div>
          {pendingCount > 0 && (
            <div className="ml-auto bg-[hsl(var(--amber))]/20 border border-[hsl(var(--amber))]/40 rounded-full px-3 py-1">
              <span className="text-xs font-black text-[hsl(var(--amber))]">{pendingCount} পেন্ডিং</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 pb-6">
        <AnimatePresence mode="wait">
          {/* Saved message */}
          {savedMessage && !activeKey && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 bg-[hsl(var(--emerald))]/10 border border-[hsl(var(--emerald))]/30 rounded-2xl p-4 flex items-start gap-3"
            >
              <CheckCircle className="w-5 h-5 text-[hsl(var(--emerald))] shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-[hsl(var(--emerald))]">{savedMessage}</p>
            </motion.div>
          )}

          {!activeKey ? (
            <motion.div
              key="fetch"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-5"
            >
              {/* UID Card */}
              <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-secondary/80 to-secondary/40 rounded-xl border border-border/60">
                <div className="flex-1 truncate">
                  <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">আপনার আইডি (UID)</p>
                  <p className="font-mono text-sm font-black text-primary">{user?.id}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                  <CircleDot className="w-4 h-4 text-primary" />
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-gradient-to-br from-[hsl(var(--blue))]/10 via-[hsl(var(--cyan))]/5 to-[hsl(var(--emerald))]/10 border border-[hsl(var(--cyan))]/20 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-[hsl(var(--cyan))]" />
                  <p className="text-sm font-black text-[hsl(var(--cyan))]">📋 ধাপে ধাপে নির্দেশনা</p>
                </div>
                <div className="space-y-2.5">
                  {steps.map((step, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-start gap-3 group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-[hsl(var(--cyan))]/15 border border-[hsl(var(--cyan))]/25 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-black text-[hsl(var(--cyan))]">{step.num}</span>
                      </div>
                      <p className="text-[11px] text-foreground/80 leading-relaxed">{step.text}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Video section */}
                <div className="pt-3 border-t border-[hsl(var(--cyan))]/15">
                  <p className="text-[10px] text-[hsl(var(--amber))] font-bold mb-2">🎥 কিভাবে করবেন ভিডিও দেখুন:</p>
                  <motion.a
                    href={currentVideoUrl || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={async (e) => {
                      if (!currentVideoUrl) { e.preventDefault(); return; }
                      if (user && !hasWatchedVideo) {
                        await updateUserWatchedVideo(user.id, currentVideoUrl);
                        queryClient.invalidateQueries({ queryKey: ["user"] });
                      }
                    }}
                    className="flex items-center justify-center gap-2 w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-bold py-2.5 px-4 rounded-xl transition-all"
                  >
                    <Video className="w-4 h-4" /> ভিডিও দেখুন
                  </motion.a>
                </div>
              </div>

              {isOff && (
                <div className="bg-destructive/10 border-2 border-destructive/20 rounded-2xl p-5 text-center">
                  <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
                  <p className="text-lg font-bold text-destructive mb-1">সাময়িক বিরতি</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    দুঃখিত, বর্তমানে সাময়িকভাবে বন্ধ আছে। দয়া করে কিছুক্ষণ পর আবার চেষ্টা করুন।
                  </p>
                </div>
              )}

              {/* Start Button */}
              <motion.button
                onClick={() => generateKeyMutation.mutate()}
                disabled={generateKeyMutation.isPending || isOff || !hasWatchedVideo}
                whileHover={!(isOff || !hasWatchedVideo) ? { scale: 1.03, y: -3 } : {}}
                whileTap={!(isOff || !hasWatchedVideo) ? { scale: 0.97 } : {}}
                className={`w-full relative py-5 rounded-2xl font-black text-base overflow-hidden transition-all duration-500 ${
                  isOff || !hasWatchedVideo
                    ? "bg-secondary/60 text-muted-foreground cursor-not-allowed border border-border/50"
                    : "text-primary-foreground shadow-2xl"
                }`}
              >
                {!(isOff || !hasWatchedVideo) && (
                  <>
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--purple))] via-[hsl(var(--pink))] to-[hsl(var(--amber))]"
                      animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                      style={{ backgroundSize: "200% 100%" }}
                    />
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                      animate={{ x: ["-100%", "200%"] }}
                      transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 0.8, ease: "easeInOut" }}
                    />
                    <div className="absolute inset-0 rounded-2xl border-2 border-white/25" />
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-[hsl(var(--pink))] blur-2xl opacity-50" />
                  </>
                )}
                <span className="relative z-10 flex items-center justify-center gap-3">
                  {generateKeyMutation.isPending ? (
                    <Loader2 className="animate-spin w-6 h-6" />
                  ) : !hasWatchedVideo ? (
                    <><Lock className="w-5 h-5" /> আগে ভিডিও দেখুন</>
                  ) : (
                    <><ShieldCheck className="w-6 h-6" /> ফেস ভেরিফিকেশন শুরু করুন</>
                  )}
                </span>
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="verify"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-5"
            >
              {/* Active verification link */}
              <div className="bg-gradient-to-br from-[hsl(var(--emerald))]/15 to-[hsl(var(--cyan))]/10 border border-[hsl(var(--emerald))]/30 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-5 h-5 text-[hsl(var(--emerald))]" />
                  <p className="text-sm font-black text-[hsl(var(--emerald))]">ভেরিফিকেশন লিঙ্ক তৈরি হয়েছে</p>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  নিচের বাটনে ক্লিক করে ফেস ভেরিফিকেশন সম্পন্ন করুন। ভেরিফাই শেষে অ্যাপে ফিরে আসুন।
                </p>
                <motion.a
                  href={activeKey.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] text-primary-foreground font-black py-4 rounded-2xl shadow-lg"
                >
                  <ExternalLink className="w-5 h-5" /> Face Verification খুলুন
                </motion.a>
              </div>

              {/* Cancel button */}
              <motion.button
                onClick={() => saveAndReset("সেভ হয়েছে। পরে Submit All দিলে চেক হবে।")}
                whileTap={{ scale: 0.97 }}
                className="w-full py-3 rounded-xl border border-border/60 text-sm font-bold text-muted-foreground hover:bg-secondary/50 transition-all flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" /> ফিরে যান (পরে Submit All দিন)
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
