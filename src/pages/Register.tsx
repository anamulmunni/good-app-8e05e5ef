import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowRight, Lock, User, Phone } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const DEVICE_ACCOUNTS_KEY = "goodapp_device_accounts";

function getDeviceAccounts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DEVICE_ACCOUNTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function addDeviceAccount(guestId: string) {
  const accounts = getDeviceAccounts();
  if (!accounts.includes(guestId)) {
    accounts.push(guestId);
    localStorage.setItem(DEVICE_ACCOUNTS_KEY, JSON.stringify(accounts));
  }
}

export default function Register() {
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const normalizePhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    const local = digits.startsWith("88") ? digits.slice(2) : digits;
    return /^01\d{9}$/.test(local) ? local : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) {
      setStep(step + 1);
      return;
    }

    setIsSubmitting(true);
    try {
      const normalizedPhone = normalizePhone(phone.trim());
      if (!normalizedPhone) {
        throw new Error("সঠিক ফোন নম্বর দিন (01XXXXXXXXX)");
      }

      // Check if this phone already has an account
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("guest_id", normalizedPhone)
        .maybeSingle();

      if (existingUser) {
        throw new Error("এই ফোন নম্বর দিয়ে আগেই অ্যাকাউন্ট তৈরি হয়েছে");
      }

      // Check if this device already has an account - if so, block the existing one
      const deviceAccounts = getDeviceAccounts();
      if (deviceAccounts.length > 0) {
        // Auto-block all previous accounts from this device
        for (const oldGuestId of deviceAccounts) {
          await supabase
            .from("users")
            .update({ is_blocked: true })
            .eq("guest_id", oldGuestId);
        }
      }

      const fakeEmail = `${normalizedPhone}@goodapp.local`;

      const { error } = await supabase.auth.signUp({
        email: fakeEmail,
        password,
        options: {
          data: {
            display_name: displayName.trim(),
            phone: normalizedPhone,
          },
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          throw new Error("এই ফোন নম্বর দিয়ে আগেই অ্যাকাউন্ট তৈরি হয়েছে");
        }
        throw error;
      }

      // Track this device account
      addDeviceAccount(normalizedPhone);

      if (deviceAccounts.length > 0) {
        toast({
          title: "⚠️ সতর্কতা!",
          description: "এই ডিভাইসে আগের অ্যাকাউন্ট ব্লক করা হয়েছে। একটি ডিভাইসে একটিই অ্যাকাউন্ট অনুমোদিত।",
          variant: "destructive",
        });
      } else {
        toast({
          title: "রেজিস্ট্রেশন সফল!",
          description: "আপনার অ্যাকাউন্ট তৈরি হয়েছে।",
        });
      }

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
      case 2: return password.length >= 6;
      case 3: return phone.trim().length >= 10;
      default: return false;
    }
  };

  const stepLabels = ["আপনার নাম", "পাসওয়ার্ড", "ফোন নম্বর"];
  const stepIcons = [User, Lock, Phone];
  const StepIcon = stepIcons[step - 1];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.15, 0.25, 0.15] }}
          transition={{ duration: 6, repeat: Infinity }}
          className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.08, 0.15, 0.08] }}
          transition={{ duration: 8, repeat: Infinity, delay: 2 }}
          className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-accent/10 rounded-full blur-[120px]"
        />
      </div>

      {/* Floating particles */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            animate={{ y: [0, -30, 0], x: [0, (i % 2 === 0 ? 12 : -12), 0], opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: 3 + i, repeat: Infinity, delay: i * 0.6 }}
            className="absolute w-1.5 h-1.5 rounded-full bg-primary/30"
            style={{ top: `${20 + i * 15}%`, left: `${15 + i * 16}%` }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <motion.img
            src="/logo.png" alt="Good App"
            className="w-20 h-20 mx-auto mb-6 drop-shadow-2xl rounded-2xl"
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: "spring", stiffness: 300 }}
          />
          <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-primary via-primary/80 to-accent mb-2">
            নতুন অ্যাকাউন্ট
          </h1>
          <p className="text-muted-foreground">ধাপ {step}/3 — {stepLabels[step - 1]}</p>
        </div>

        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <motion.div
              key={s}
              initial={false}
              animate={{ scaleX: s <= step ? 1 : 0.5, opacity: s <= step ? 1 : 0.3 }}
              className={`h-2 flex-1 rounded-full transition-all ${s <= step ? "bg-gradient-to-r from-primary to-primary/70" : "bg-secondary"}`}
            />
          ))}
        </div>

        <motion.div
          layout
          className="glass-card p-8 rounded-3xl border border-border/30 shadow-xl shadow-primary/5"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}>
                <div className="flex items-center gap-3 mb-4">
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center"
                  >
                    <StepIcon className="w-5 h-5 text-primary" />
                  </motion.div>
                  <label className="text-sm font-medium text-muted-foreground">{stepLabels[step - 1]}</label>
                </div>

                {step === 1 && (
                  <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="আপনার নাম লিখুন..." className="input-field text-lg py-4" autoFocus />
                )}
                {step === 2 && (
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="কমপক্ষে ৬ অক্ষর..." className="input-field text-lg py-4" autoFocus />
                )}
                {step === 3 && (
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="01XXXXXXXXX" className="input-field text-lg py-4" autoFocus />
                )}
              </motion.div>
            </AnimatePresence>

            <div className="flex gap-3">
              {step > 1 && (
                <motion.button type="button" onClick={() => setStep(step - 1)}
                  whileTap={{ scale: 0.95 }}
                  className="px-6 py-4 rounded-xl border border-border text-muted-foreground hover:bg-secondary transition-all font-bold">
                  পিছনে
                </motion.button>
              )}
              <motion.button type="submit" disabled={!isStepValid() || isSubmitting}
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.01 }}
                className="btn-primary py-4 text-lg flex-1">
                {isSubmitting ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : step < 3 ? (
                  <motion.span className="inline-flex items-center gap-2"
                    animate={{ x: [0, 3, 0] }} transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}>
                    পরবর্তী <ArrowRight className="w-5 h-5" />
                  </motion.span>
                ) : (
                  <motion.span className="inline-flex items-center gap-2"
                    animate={{ x: [0, 3, 0] }} transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}>
                    রেজিস্টার করুন <ArrowRight className="w-5 h-5" />
                  </motion.span>
                )}
              </motion.button>
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
        </motion.div>
      </motion.div>
    </div>
  );
}
