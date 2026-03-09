import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowRight, Mail, Lock, User, Phone } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

export default function Register() {
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 4) {
      setStep(step + 1);
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: displayName.trim(),
            phone: phone.trim(),
          },
        },
      });

      if (error) throw error;

      toast({
        title: "রেজিস্ট্রেশন সফল!",
        description: "আপনার অ্যাকাউন্ট তৈরি হয়েছে।",
      });
      navigate("/dashboard");
    } catch (err: any) {
      toast({
        title: "রেজিস্ট্রেশন ব্যর্থ",
        description: err.message || "আবার চেষ্টা করুন",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1: return displayName.trim().length >= 2;
      case 2: return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      case 3: return password.length >= 6;
      case 4: return phone.trim().length >= 10;
      default: return false;
    }
  };

  const stepLabels = ["আপনার নাম", "ইমেইল", "পাসওয়ার্ড", "ফোন নম্বর"];
  const stepIcons = [User, Mail, Lock, Phone];
  const StepIcon = stepIcons[step - 1];

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
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Good App" className="w-20 h-20 mx-auto mb-6 drop-shadow-2xl" />
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60 mb-2">
            নতুন অ্যাকাউন্ট
          </h1>
          <p className="text-muted-foreground">ধাপ {step}/4 — {stepLabels[step - 1]}</p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= step ? "bg-primary" : "bg-secondary"}`} />
          ))}
        </div>

        <div className="glass-card p-8 rounded-3xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <StepIcon className="w-5 h-5 text-primary" />
                </div>
                <label className="text-sm font-medium text-muted-foreground">{stepLabels[step - 1]}</label>
              </div>

              {step === 1 && (
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="আপনার নাম লিখুন..." className="input-field text-lg py-4" autoFocus />
              )}
              {step === 2 && (
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@gmail.com" className="input-field text-lg py-4" autoFocus />
              )}
              {step === 3 && (
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="কমপক্ষে ৬ অক্ষর..." className="input-field text-lg py-4" autoFocus />
              )}
              {step === 4 && (
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="01XXXXXXXXX" className="input-field text-lg py-4" autoFocus />
              )}
            </motion.div>

            <div className="flex gap-3">
              {step > 1 && (
                <button type="button" onClick={() => setStep(step - 1)}
                  className="px-6 py-4 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-all font-bold">
                  পিছনে
                </button>
              )}
              <button type="submit" disabled={!isStepValid() || isSubmitting}
                className="btn-primary py-4 text-lg flex-1">
                {isSubmitting ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : step < 4 ? (
                  <> পরবর্তী <ArrowRight className="w-5 h-5" /> </>
                ) : (
                  <> রেজিস্টার করুন <ArrowRight className="w-5 h-5" /> </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              ইতিমধ্যে অ্যাকাউন্ট আছে?{" "}
              <button onClick={() => navigate("/")} className="text-primary font-bold hover:underline">
                লগইন করুন
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
