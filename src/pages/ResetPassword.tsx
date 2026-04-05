import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Lock, Loader2, CheckCircle2 } from "lucide-react";

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check if this is a recovery flow from email link
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    } else {
      // Also check for session with recovery event
      supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          setIsRecovery(true);
        }
      });
    }
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "পাসওয়ার্ড মিলছে না", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setDone(true);
      toast({ title: "✅ পাসওয়ার্ড পরিবর্তন হয়েছে!" });
      setTimeout(() => navigate("/dashboard"), 2000);
    } catch (err: any) {
      toast({ title: "ব্যর্থ", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isRecovery && !done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">লোড হচ্ছে...</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-4"
        >
          <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
          <h2 className="text-xl font-black">পাসওয়ার্ড পরিবর্তন হয়েছে!</h2>
          <p className="text-muted-foreground text-sm">ড্যাশবোর্ডে নিয়ে যাওয়া হচ্ছে...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm glass-card rounded-3xl p-6 border border-border/30 space-y-5"
      >
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-black">নতুন পাসওয়ার্ড সেট করুন</h1>
          <p className="text-xs text-muted-foreground">আপনার নতুন লগইন পাসওয়ার্ড দিন</p>
        </div>

        <form onSubmit={handleReset} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 ml-1">নতুন পাসওয়ার্ড</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="কমপক্ষে ৬ অক্ষর..."
              className="input-field text-base py-3"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 ml-1">পাসওয়ার্ড নিশ্চিত করুন</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="আবার পাসওয়ার্ড দিন..."
              className="input-field text-base py-3"
            />
          </div>
          <motion.button
            type="submit"
            disabled={isSubmitting || newPassword.length < 6}
            className="w-full py-4 rounded-2xl font-black text-lg bg-gradient-to-r from-primary to-[hsl(var(--cyan))] text-primary-foreground"
            whileTap={{ scale: 0.95 }}
          >
            {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "✅ পাসওয়ার্ড সেভ করুন"}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
