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

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-muted-foreground/20" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-3 text-muted-foreground">অথবা</span></div>
          </div>

          <button
            type="button"
            onClick={async () => {
              try {
                const result = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: `${window.location.origin}/dashboard`,
                });
                if (result?.error) {
                  toast({ title: "Google লগইন ব্যর্থ", description: String(result.error.message || result.error), variant: "destructive" });
                }
              } catch (err: any) {
                toast({ title: "Google লগইন ব্যর্থ", description: err.message, variant: "destructive" });
              }
            }}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-muted-foreground/20 bg-card hover:bg-muted transition-colors text-foreground font-medium"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>

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
