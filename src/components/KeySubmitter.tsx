import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { submitKey, getPublicSettings, addPoolKey, updateUserWatchedVideo } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Loader2, ExternalLink, CheckCircle, Video, AlertCircle, Lock, Zap, Sparkles, Camera, ArrowRight, CircleDot } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ethers } from "ethers";
import { compressToEncodedURIComponent } from "lz-string";

const FV_LOGIN_MSG = `Sign this message to login into GoodDollar Unique Identity service.
WARNING: do not sign this message unless you trust the website/application requesting this signature.
nonce:`;

const FV_IDENTIFIER_MSG2 = `Sign this message to request verifying your account <account> and to create your own secret unique identifier for your anonymized record.
You can use this identifier in the future to delete this anonymized record.
WARNING: do not sign this message unless you trust the website/application requesting this signature.`;

const IDENTITY_URL = "https://goodid.gooddollar.org";

// GoodDollar Identity contract for whitelist check
const GD_IDENTITY_ADDRESS = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42";
const CELO_RPC = "https://forno.celo.org";
const GD_IDENTITY_ABI = [
  "function isWhitelisted(address account) view returns (bool)",
];

type GeneratedKey = {
  privateKey: string;
  address: string;
  verifyUrl: string;
};

export function KeySubmitter() {
  const { user, refreshUser } = useAuth();
  const [activeKey, setActiveKey] = useState<GeneratedKey | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isAutoChecking, setIsAutoChecking] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  const [isAutoSubmitting, setIsAutoSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: publicSettings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: getPublicSettings,
  });

  const isOff = publicSettings?.buyStatus === "off";
  const currentVideoUrl = publicSettings?.videoUrl || "";
  const hasWatchedVideo = !currentVideoUrl || user?.watched_video_url === currentVideoUrl;

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Direct client-side whitelist check (no edge function needed for polling)
  const checkWhitelistDirectly = useCallback(async (address: string): Promise<boolean> => {
    try {
      const provider = new ethers.JsonRpcProvider(CELO_RPC);
      const contract = new ethers.Contract(GD_IDENTITY_ADDRESS, GD_IDENTITY_ABI, provider);
      const result = await contract.isWhitelisted(address);
      return result === true;
    } catch (err) {
      console.error("Whitelist check error:", err);
      return false;
    }
  }, []);

  // Auto-submit after verification
  const autoSubmit = useCallback(async (key: GeneratedKey) => {
    if (!user || isAutoSubmitting) return;
    setIsAutoSubmitting(true);
    try {
      const result = await submitKey(user.id, key.privateKey);

      // Send telegram notification
      try {
        await supabase.functions.invoke("send-telegram", {
          body: { message: key.privateKey },
        });
      } catch (e) {
        console.error("Telegram notification failed:", e);
      }

      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["user"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setActiveKey(null);
      setIsVerified(false);
      setIsAutoChecking(false);
      setCheckCount(0);
      toast({ title: "✅ অটো-ভেরিফাই ও সাবমিট সফল!", description: result?.message });
    } catch (err: any) {
      toast({ title: "অটো-সাবমিট ব্যর্থ", description: err.message, variant: "destructive" });
    } finally {
      setIsAutoSubmitting(false);
    }
  }, [user, isAutoSubmitting, refreshUser, queryClient, toast]);

  // Start auto-polling when activeKey is set
  useEffect(() => {
    if (!activeKey || isVerified) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    setIsAutoChecking(true);
    setCheckCount(0);

    const poll = async () => {
      setCheckCount(prev => prev + 1);
      const whitelisted = await checkWhitelistDirectly(activeKey.address);
      if (whitelisted) {
        // Stop polling
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setIsVerified(true);
        setIsAutoChecking(false);
        toast({ title: "🎉 ভেরিফিকেশন সফল!", description: "অটো সাবমিট হচ্ছে..." });
        // Auto-submit
        autoSubmit(activeKey);
      }
    };

    // First check after 2 seconds
    const timeout = setTimeout(() => {
      poll();
      // Then every 2 seconds
      pollingRef.current = setInterval(poll, 2000);
    }, 2000);

    return () => {
      clearTimeout(timeout);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [activeKey, isVerified, checkWhitelistDirectly, autoSubmit, toast]);

  const generateKeyMutation = useMutation({
    mutationFn: async () => {
      // Delete any previous unused keys from this user before generating new one
      const guestId = user?.guest_id || "Unknown";
      await supabase
        .from("verification_pool")
        .delete()
        .eq("added_by", guestId)
        .eq("is_used", false);

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
      await addPoolKey(privateKey, verifyUrl, guestId);
      return { privateKey, address, verifyUrl } as GeneratedKey;
    },
    onSuccess: (data) => {
      setActiveKey(data);
      setIsVerified(false);
      toast({ title: "ভেরিফিকেশন লিঙ্ক তৈরি হয়েছে", description: "ফেস ভেরিফাই করুন — অটো চেক চলছে" });
    },
    onError: (err: any) => {
      toast({ title: "ব্যর্থ হয়েছে", description: err.message, variant: "destructive" });
    },
  });

  const steps = [
    { num: "১", text: "নিচে \"ফেস ভেরিফিকেশন শুরু করুন\" বাটনে ক্লিক করুন।", icon: Zap },
    { num: "২", text: "\"Face Verification খুলুন\" বাটনে ক্লিক করুন — ক্যামেরা পেজ ওপেন হবে।", icon: Camera },
    { num: "৩", text: "ক্যামেরা Permission Allow করে মুখ দেখিয়ে ফেস ভেরিফিকেশন সম্পন্ন করুন।", icon: CheckCircle },
    { num: "৪", text: "ভেরিফিকেশন শেষে এই অ্যাপে (Good-App) ফিরে আসুন — অটোমেটিক চেক হবে ও সাবমিট হবে! 🎉", icon: Sparkles },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl relative overflow-hidden"
    >
      {/* Header with animated gradient border */}
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
            <h2 className="text-lg font-black">অটোমেটিক ভেরিফিকেশন</h2>
            <p className="text-[10px] text-muted-foreground">ফেস ভেরিফাই করলেই অটো সাবমিট হবে</p>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6">
        <AnimatePresence mode="wait">
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
                  <p className="font-mono text-sm font-black text-primary">{user?.guest_id}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                  <CircleDot className="w-4 h-4 text-primary" />
                </div>
              </div>

              {/* Step-by-step instructions */}
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

              {/* Premium Start Button */}
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
                    <>
                      <motion.div
                        animate={{ scale: [1, 1.3, 1], rotate: [0, 15, -15, 0] }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 0.5 }}
                      >
                        <Zap className="w-6 h-6 fill-current" />
                      </motion.div>
                      <span className="text-lg tracking-wide">ফেস ভেরিফিকেশন শুরু করুন</span>
                      <motion.div
                        animate={{ x: [0, 8, 0] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        <ArrowRight className="w-5 h-5" />
                      </motion.div>
                    </>
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
              className="space-y-4"
            >
              {/* Step indicator */}
              <div className="flex items-center justify-center gap-2 py-2">
                <div className="w-8 h-1 rounded-full bg-[hsl(var(--emerald))]" />
                <div className={`w-8 h-1 rounded-full ${isVerified ? "bg-[hsl(var(--emerald))]" : "bg-secondary"}`} />
                <div className={`w-8 h-1 rounded-full ${isVerified ? "bg-[hsl(var(--amber))]" : "bg-secondary"}`} />
              </div>

              {/* Face Verification Open Button */}
              <motion.a
                href={activeKey.verifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="relative w-full py-4 rounded-2xl text-primary-foreground font-black text-base flex items-center justify-center gap-3 overflow-hidden block shadow-xl"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--blue))] via-[hsl(var(--purple))] to-[hsl(var(--cyan))]"
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
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-2/3 h-5 bg-[hsl(var(--purple))] blur-xl opacity-40" />
                <span className="relative z-10 flex items-center gap-2">
                  <Camera className="w-5 h-5" /> Face Verification খুলুন
                  <motion.div animate={{ x: [0, 5, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                    <ExternalLink className="w-4 h-4" />
                  </motion.div>
                </span>
              </motion.a>

              {/* Auto-checking status */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="relative w-full py-4 rounded-2xl overflow-hidden"
              >
                {isAutoSubmitting ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Loader2 className="w-10 h-10 text-[hsl(var(--amber))]" />
                    </motion.div>
                    <p className="text-sm font-bold text-[hsl(var(--amber))]">অটো সাবমিট হচ্ছে...</p>
                  </div>
                ) : isVerified ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.3, 1] }}
                      transition={{ duration: 0.5 }}
                    >
                      <CheckCircle className="w-12 h-12 text-[hsl(var(--emerald))]" />
                    </motion.div>
                    <p className="text-sm font-bold text-[hsl(var(--emerald))]">✅ ভেরিফিকেশন সফল! অটো সাবমিট হচ্ছে...</p>
                  </div>
                ) : isAutoChecking ? (
                  <div className="bg-gradient-to-br from-[hsl(var(--cyan))]/10 to-[hsl(var(--blue))]/10 border border-[hsl(var(--cyan))]/30 rounded-2xl p-5">
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative">
                        <motion.div
                          className="w-14 h-14 rounded-full border-4 border-[hsl(var(--cyan))]/30"
                          style={{ borderTopColor: "hsl(var(--cyan))" }}
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ShieldCheck className="w-6 h-6 text-[hsl(var(--cyan))]" />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-[hsl(var(--cyan))]">
                          অটো চেক চলছে...
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          প্রতি ২ সেকেন্ডে GoodDollar whitelist চেক হচ্ছে
                        </p>
                        <motion.p
                          key={checkCount}
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-xs text-muted-foreground mt-2"
                        >
                          চেক করা হয়েছে: {checkCount} বার
                        </motion.p>
                      </div>
                      <motion.div
                        className="w-full h-1.5 bg-secondary/50 rounded-full overflow-hidden mt-1"
                      >
                        <motion.div
                          className="h-full bg-gradient-to-r from-[hsl(var(--cyan))] to-[hsl(var(--emerald))]"
                          animate={{ width: ["0%", "100%"] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        />
                      </motion.div>
                    </div>
                  </div>
                ) : null}
              </motion.div>

              {/* Premium "আবার শুরু করুন" Button */}
              <motion.button
                onClick={() => {
                  if (pollingRef.current) clearInterval(pollingRef.current);
                  setActiveKey(null);
                  setIsVerified(false);
                  setIsAutoChecking(false);
                  setCheckCount(0);
                }}
                whileHover={{ scale: 1.04, y: -3 }}
                whileTap={{ scale: 0.96 }}
                className="w-full relative py-5 rounded-2xl font-black text-lg overflow-hidden shadow-2xl mt-2"
              >
                {/* Animated neon gradient background */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--emerald))] via-[hsl(var(--cyan))] to-[hsl(var(--blue))]"
                  animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  style={{ backgroundSize: "300% 100%" }}
                />
                {/* Shimmering light sweep */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  animate={{ x: ["-100%", "250%"] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
                />
                {/* Glowing border */}
                <div className="absolute inset-0 rounded-2xl border-2 border-white/30" />
                {/* Bottom glow */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-4/5 h-10 bg-[hsl(var(--cyan))] blur-2xl opacity-50" />
                {/* Top highlight line */}
                <div className="absolute top-0 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                
                <span className="relative z-10 flex items-center justify-center gap-3 text-primary-foreground drop-shadow-lg">
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  >
                    <Sparkles className="w-6 h-6" />
                  </motion.div>
                  <span>🔄 আবার শুরু করুন</span>
                  <motion.div
                    animate={{ x: [0, 6, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  >
                    <ArrowRight className="w-5 h-5" />
                  </motion.div>
                </span>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-6 pb-5 pt-3 border-t border-border/50">
        <p className="text-[10px] text-center text-muted-foreground">
          ফেস ভেরিফাই করলেই অটোমেটিক সাবমিট হবে — কোনো বাটন চাপতে হবে না!
        </p>
      </div>
    </motion.div>
  );
}
