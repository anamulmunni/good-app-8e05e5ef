import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Loader2, ArrowRight, Lock, Phone } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !password) return;

    setIsSubmitting(true);
    try {
      const fakeEmail = `${phone.trim()}@goodapp.local`;

      let { error } = await supabase.auth.signInWithPassword({
        email: fakeEmail,
        password,
      });

      // If failed, try looking up the old email from users table
      if (error && error.message === "Invalid login credentials") {
        const { data: userData } = await supabase
          .from("users")
          .select("email")
          .eq("guest_id", phone.trim())
          .single();

        if (userData?.email && userData.email !== fakeEmail) {
          const retryResult = await supabase.auth.signInWithPassword({
            email: userData.email,
            password,
          });
          error = retryResult.error;
        }
      }

      if (error) {
        if (error.message === "Invalid login credentials") {
          throw new Error("ফোন নম্বর বা পাসওয়ার্ড ভুল");
        }
        throw error;
      }

      navigate("/dashboard");
    } catch (err: any) {
      toast({
        title: "লগইন ব্যর্থ",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[hsl(var(--purple))]/10 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <img src="/logo.png" alt="Good App" className="w-20 h-20 mx-auto mb-6 drop-shadow-2xl" />
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60 mb-2">
            Good App
          </h1>
          <p className="text-muted-foreground text-lg">
            আপনার অ্যাকাউন্টে লগইন করুন
          </p>
        </div>

        <div className="glass-card p-8 rounded-3xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2 ml-1 flex items-center gap-2">
                <Phone className="w-4 h-4" /> ফোন নম্বর
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="input-field text-lg py-4"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2 ml-1 flex items-center gap-2">
                <Lock className="w-4 h-4" /> পাসওয়ার্ড
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="আপনার পাসওয়ার্ড..."
                className="input-field text-lg py-4"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !phone || !password}
              className="btn-primary py-4 text-lg"
            >
              {isSubmitting ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  লগইন করুন <ArrowRight className="w-6 h-6" />
                </>
              )}
            </button>
          </form>




          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              অ্যাকাউন্ট নেই?{" "}
              <button onClick={() => navigate("/register")} className="text-primary font-bold hover:underline">
                রেজিস্টার করুন
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
