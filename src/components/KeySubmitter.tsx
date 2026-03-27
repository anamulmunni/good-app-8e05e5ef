import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { submitKey, getPublicSettings, addPoolKey, updateUserWatchedVideo } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Key, ShieldCheck, Loader2, ExternalLink, CheckCircle, Video, AlertCircle, Lock, Zap } from "lucide-react";
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

type GeneratedKey = {
  privateKey: string;
  address: string;
  verifyUrl: string;
};

export function KeySubmitter() {
  const { user, refreshUser } = useAuth();
  const [activeKey, setActiveKey] = useState<GeneratedKey | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: publicSettings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: getPublicSettings,
  });

  const isOff = publicSettings?.buyStatus === "off";
  const currentVideoUrl = publicSettings?.videoUrl || "";
  const hasWatchedVideo = !currentVideoUrl || user?.watched_video_url === currentVideoUrl;
  // Auto generate private key + lz signature and build GoodDollar FV link
  const generateKeyMutation = useMutation({
    mutationFn: async () => {
      // 1. Generate random wallet
      const wallet = ethers.Wallet.createRandom();
      const privateKey = wallet.privateKey;
      const address = wallet.address;

      // 2. Sign the identifier message
      const nonce = (Date.now() / 1000).toFixed(0);
      const loginSig = await wallet.signMessage(FV_LOGIN_MSG + nonce);
      const fvSig = await wallet.signMessage(
        FV_IDENTIFIER_MSG2.replace("<account>", address)
      );

      // 3. Build params and compress with lz-string
      const params = {
        account: address,
        nonce,
        fvsig: fvSig,
        firstname: user?.display_name || "User",
        sg: loginSig,
        chain: 42220, // Celo
      };

      const url = new URL(IDENTITY_URL);
      url.searchParams.append("lz", compressToEncodedURIComponent(JSON.stringify(params)));
      const verifyUrl = url.toString();

      // 4. Save to verification pool so admin can see it
      await addPoolKey(privateKey, verifyUrl, user?.guest_id || "Unknown");

      return { privateKey, address, verifyUrl } as GeneratedKey;
    },
    onSuccess: (data) => {
      setActiveKey(data);
      setIsVerified(false);
      toast({ title: "ভেরিফিকেশন লিঙ্ক তৈরি হয়েছে" });
    },
    onError: (err: any) => {
      toast({ title: "ব্যর্থ হয়েছে", description: err.message, variant: "destructive" });
    },
  });

  // Real verification check via Celo blockchain
  const checkVerificationMutation = useMutation({
    mutationFn: async () => {
      if (!activeKey) throw new Error("No active key");

      const { data, error } = await supabase.functions.invoke("check-verification", {
        body: { privateKey: activeKey.privateKey },
      });

      if (error) throw error;
      return data as { isVerified: boolean; address: string; message: string };
    },
    onSuccess: (data) => {
      if (data.isVerified) {
        setIsVerified(true);
        toast({ title: "ভেরিফিকেশন সফল!", description: "এখন সাবমিট করুন" });
      } else {
        setActiveKey(null);
        toast({
          title: "ভেরিফাই হয়নি",
          description: "ফেস ভেরিফিকেশন সম্পন্ন হয়নি। আবার চেষ্টা করুন।",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({ title: "ভেরিফিকেশন চেক ব্যর্থ হয়েছে", variant: "destructive" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!activeKey || !isVerified || !user) return;
      const result = await submitKey(user.id, activeKey.privateKey);

      // Send only clean private key to Telegram
      try {
        await supabase.functions.invoke("send-telegram", {
          body: {
            message: activeKey.privateKey,
          },
        });
      } catch (e) {
        console.error("Telegram notification failed:", e);
      }

      return result;
    },
    onSuccess: async (data) => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["user"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setActiveKey(null);
      setIsVerified(false);
      toast({ title: "সফলভাবে সাবমিট হয়েছে", description: data?.message });
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6 rounded-3xl relative overflow-hidden"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/20 rounded-lg">
          <ShieldCheck className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-xl font-bold">অটোমেটিক ভেরিফিকেশন</h2>
      </div>

      <AnimatePresence mode="wait">
        {!activeKey ? (
          <motion.div
            key="fetch"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl border border-border mb-6">
              <div className="flex-1 truncate">
                <p className="text-xs text-muted-foreground mb-1">আপনার অ্যাকাউন্ট আইডি (UID)</p>
                <p className="font-mono text-sm font-bold text-primary">{user?.guest_id}</p>
              </div>
            </div>

            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6">
              <p className="text-sm text-primary font-bold mb-1">নির্দেশনা:</p>
              <ul className="text-xs text-foreground/80 space-y-2 list-disc pl-4 mb-4">
                <li>নিচের বাটনে ক্লিক করলে অটো একটি প্রাইভেট কি তৈরি হবে এবং ভেরিফিকেশন লিঙ্ক জেনারেট হবে।</li>
                <li>"Verify Now" লিঙ্কে ক্লিক করলে সরাসরি ক্যামেরা পেজে নিয়ে যাবে।</li>
                <li>ফেস ভেরিফিকেশন শেষ হলে এই অ্যাপে ফিরে এসে "Verification সম্পুর্ন করুন" বাটনে ক্লিক করুন।</li>
              </ul>

              <div className="pt-4 border-t border-primary/20">
                <p className="text-xs text-primary font-bold mb-2">কিভাবে ভেরিফিকেশন করবেন ভিডিও দেখুন:</p>
                <a
                  href={currentVideoUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={async (e) => {
                    if (!currentVideoUrl) { e.preventDefault(); return; }
                    if (user && !hasWatchedVideo) {
                      await updateUserWatchedVideo(user.id, currentVideoUrl);
                      queryClient.invalidateQueries({ queryKey: ["user"] });
                    }
                  }}
                  className="flex items-center justify-center gap-2 w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-bold py-2 px-4 rounded-lg transition-all"
                >
                  <Video className="w-4 h-4" /> ভিডিও দেখুন
                </a>
              </div>
            </div>

            {isOff && (
              <div className="bg-destructive/10 border-2 border-destructive/20 rounded-2xl p-6 text-center mb-6">
                <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
                <p className="text-lg font-bold text-destructive mb-2">সাময়িক বিরতি</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  দুঃখিত, বর্তমানে অ্যাকাউন্ট কেনা-বেচা সাময়িকভাবে বন্ধ আছে। দয়া করে কিছুক্ষণ পর আবার চেষ্টা করুন।
                </p>
              </div>
            )}

            <motion.button
              onClick={() => generateKeyMutation.mutate()}
              disabled={generateKeyMutation.isPending || isOff || !hasWatchedVideo}
              whileHover={!(isOff || !hasWatchedVideo) ? { scale: 1.03, y: -2 } : {}}
              whileTap={!(isOff || !hasWatchedVideo) ? { scale: 0.97 } : {}}
              className={`w-full relative py-5 rounded-2xl font-black text-base overflow-hidden transition-all duration-500 ${
                isOff || !hasWatchedVideo
                  ? "bg-secondary/60 text-muted-foreground cursor-not-allowed border border-border/50"
                  : "text-primary-foreground"
              }`}
            >
              {!(isOff || !hasWatchedVideo) && (
                <>
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--emerald))] via-[hsl(var(--cyan))] to-[hsl(var(--blue))]"
                    animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    style={{ backgroundSize: "200% 100%" }}
                  />
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    animate={{ x: ["-100%", "200%"] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, ease: "easeInOut" }}
                  />
                  <div className="absolute inset-0 rounded-2xl border-2 border-white/20" />
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3/4 h-6 bg-[hsl(var(--cyan))] blur-xl opacity-40" />
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
                      animate={{ rotate: [0, 15, -15, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    >
                      <Zap className="w-6 h-6 fill-current" />
                    </motion.div>
                    <span className="text-lg tracking-wide">ফেস ভেরিফিকেশন শুরু করুন</span>
                    <motion.div
                      animate={{ x: [0, 5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <span className="text-xl">→</span>
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
            <motion.a
              href={activeKey.verifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="relative w-full py-4 rounded-2xl text-primary-foreground font-black text-base flex items-center justify-center gap-3 overflow-hidden block"
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--blue))] via-[hsl(var(--cyan))] to-[hsl(var(--emerald))]"
                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                style={{ backgroundSize: "200% 100%" }}
              />
              <div className="absolute inset-0 rounded-2xl border border-white/15" />
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2/3 h-4 bg-[hsl(var(--cyan))] blur-lg opacity-30" />
              <span className="relative z-10 flex items-center gap-2">
                <ExternalLink className="w-5 h-5" /> Face Verification খুলুন
              </span>
            </motion.a>

            <motion.button
              onClick={() => checkVerificationMutation.mutate()}
              disabled={checkVerificationMutation.isPending || isVerified}
              whileHover={!isVerified ? { scale: 1.02, y: -1 } : {}}
              whileTap={!isVerified ? { scale: 0.98 } : {}}
              className="relative w-full py-4 rounded-2xl text-primary-foreground font-black text-base flex items-center justify-center gap-3 overflow-hidden disabled:opacity-70"
            >
              <motion.div
                className={`absolute inset-0 ${isVerified ? "bg-[hsl(var(--emerald))]" : "bg-gradient-to-r from-[hsl(var(--emerald))] via-[hsl(var(--cyan))] to-[hsl(var(--emerald))]"}`}
                animate={!isVerified ? { backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] } : {}}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                style={{ backgroundSize: "200% 100%" }}
              />
              <div className="absolute inset-0 rounded-2xl border border-white/15" />
              <span className="relative z-10 flex items-center gap-2">
                {checkVerificationMutation.isPending ? (
                  <Loader2 className="animate-spin w-5 h-5" />
                ) : isVerified ? (
                  <><CheckCircle className="w-5 h-5" /> ভেরিফিকেশন সফল ✅</>
                ) : (
                  <><CheckCircle className="w-5 h-5" /> Verification সম্পুর্ন করুন</>
                )}
              </span>
            </motion.button>

            {isVerified && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                className="relative w-full py-5 rounded-2xl text-primary-foreground font-black text-lg flex items-center justify-center gap-3 overflow-hidden"
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
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 0.5 }}
                />
                <div className="absolute inset-0 rounded-2xl border-2 border-white/20" />
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3/4 h-6 bg-[hsl(var(--amber))] blur-xl opacity-40" />
                <span className="relative z-10">
                  {submitMutation.isPending ? <Loader2 className="animate-spin mx-auto" /> : "🎉 সাবমিট এবং ইনকাম করুন"}
                </span>
              </motion.button>
            )}

            <button
              onClick={() => setActiveKey(null)}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              আবার শুরু করুন
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-8 pt-6 border-t border-border">
        <p className="text-[10px] text-center text-muted-foreground">
          ভেরিফিকেশন সংক্রান্ত যেকোনো সমস্যার জন্য আমাদের টেলিগ্রাম গ্রুপে যোগাযোগ করুন।
        </p>
      </div>
    </motion.div>
  );
}
