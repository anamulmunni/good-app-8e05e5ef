import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowRight, Lock, User, Phone, PlayCircle, CheckCircle2, MessageCircle, Video, Users, Shield, Sparkles, ChevronDown, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import loginBg from "@/assets/login-bg.jpg";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { getPublicSettings } from "@/lib/api";

function mapAuthErrorToBnMessage(input: unknown, fallback = "সার্ভার সমস্যার কারণে এখন লগইন/রেজিস্ট্রেশন হচ্ছে না, কিছুক্ষণ পর আবার চেষ্টা করুন") {
  const raw = String(
    (input as any)?.message ||
    (input as any)?.error_description ||
    (input as any)?.details ||
    "",
  ).toLowerCase();
  const status = Number((input as any)?.status || 0);

  if (raw.includes("invalid login credentials")) return "ফোন নম্বর বা পাসওয়ার্ড ভুল";
  if (
    status === 504 ||
    raw.includes("timeout") ||
    raw.includes("failed to fetch") ||
    raw.includes("network") ||
    raw.includes("upstream request timeout") ||
    raw.trim() === "{}"
  ) {
    return fallback;
  }

  return (input as any)?.message || fallback;
}


const FEATURES = [
  { icon: MessageCircle, title: "মেসেঞ্জার", desc: "বন্ধুদের সাথে ফ্রি চ্যাট, ইমোজি, থিম কাস্টমাইজ করুন" },
  { icon: Video, title: "ভিডিও কল", desc: "ফ্রি ভিডিও ও অডিও কল করুন যেকোনো সময়" },
  { icon: Users, title: "সোশ্যাল ফিড", desc: "পোস্ট করুন, লাইক দিন, কমেন্ট করুন বন্ধুদের সাথে" },
  { icon: PlayCircle, title: "শর্ট ভিডিও ও রিলস", desc: "মজার ভিডিও দেখুন এবং শেয়ার করুন" },
  { icon: Shield, title: "ভেরিফাইড ব্যাজ", desc: "কী সংগ্রহ করে ভেরিফাইড ব্যাজ অর্জন করুন" },
  { icon: Sparkles, title: "আয় করুন", desc: "অ্যাপ ব্যবহার করে ব্যালেন্স অর্জন ও উইথড্র করুন" },
];

const TERMS = [
  "আমাদের অ্যাপে কাজ করতে হলে অবশ্যই একজন নির্দিষ্ট অ্যাডমিনের মাধ্যমে কাজ শিখে তারপর কাজ করতে হবে। কোনো অ্যাডমিন না পেলে আমাদের টেলিগ্রাম গ্রুপে জয়েন করে অ্যাডমিনকে মেসেজ দিতে পারবেন। সেখানে অনেক অ্যাডমিন আছেন যারা আপনাকে সাহায্য করবে।",
  "সকল ব্যবহারকারীকে অ্যাপের নিয়ম-কানুন মানতে হবে। অ্যাপ কর্তৃপক্ষের সব সিদ্ধান্ত মানতে হবে।",
  "একটি ডিভাইসে একাধিক অ্যাকাউন্ট তৈরি করা যায়, তবে নিয়ম লঙ্ঘন করলে অ্যাডমিন অ্যাকাউন্ট ব্লক করতে পারেন।",
  "কোনো প্রকার প্রতারণা, হ্যাকিং, বা অসৎ উপায়ে ব্যালেন্স অর্জনের চেষ্টা করলে অ্যাকাউন্ট স্থায়ীভাবে বন্ধ করা হবে।",
  "অ্যাপ কর্তৃপক্ষ যেকোনো সময় নিয়ম পরিবর্তন করার অধিকার রাখে।",
];

export default function Login() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: publicSettings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: getPublicSettings,
  });
  const videoUrl = publicSettings?.videoUrl;

  const normalizePhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    const local = digits.startsWith("88") ? digits.slice(2) : digits;
    return /^01\d{9}$/.test(local) ? local : null;
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate("/dashboard");
  }, [isAuthenticated, isLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedPhone = normalizePhone(phone.trim());
    if (!normalizedPhone || !password) {
      toast({ title: "লগইন ব্যর্থ", description: "সঠিক ফোন নম্বর ও পাসওয়ার্ড দিন", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    const tryLogin = async (attempt: number): Promise<void> => {
      try {
        // Check if user is blocked BEFORE attempting login
        const { data: userData } = await supabase
          .from("users")
          .select("is_blocked, guest_id")
          .eq("guest_id", normalizedPhone)
          .maybeSingle();

        if (userData?.is_blocked) {
          toast({
            title: "🚫 অ্যাকাউন্ট ব্লক করা হয়েছে",
            description: "আপনার অ্যাকাউন্টটি স্থায়ীভাবে ব্লক করা হয়েছে। কারণ: নিয়ম লঙ্ঘন করা হয়েছে। সমস্যা সমাধানের জন্য অ্যাডমিনের সাথে যোগাযোগ করুন।",
            variant: "destructive",
          });
          return;
        }

        const fakeEmail = `${normalizedPhone}@goodapp.local`;
        let { error } = await supabase.auth.signInWithPassword({ email: fakeEmail, password });
        if (error && error.message === "Invalid login credentials") {
          const { data: emailData } = await supabase.from("users").select("email").eq("guest_id", normalizedPhone).single();
          if (emailData?.email && emailData.email !== fakeEmail) {
            const retryResult = await supabase.auth.signInWithPassword({ email: emailData.email, password });
            error = retryResult.error;
          }
        }
        if (error) throw error;
        
        navigate("/dashboard");
      } catch (err: unknown) {
        const msg = String((err as any)?.message || "").toLowerCase();
        const isNetwork = msg.includes("failed to fetch") || msg.includes("timeout") || msg.includes("network");
        if (isNetwork && attempt < 2) {
          await new Promise(r => setTimeout(r, 1500));
          return tryLogin(attempt + 1);
        }
        toast({ title: "লগইন ব্যর্থ", description: mapAuthErrorToBnMessage(err), variant: "destructive" });
      }
    };

    await tryLogin(0);
    setIsSubmitting(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedTerms) {
      toast({ title: "শর্তাবলী", description: "রেজিস্ট্রেশন করতে শর্তাবলীতে সম্মতি দিন", variant: "destructive" });
      return;
    }
    const normalizedPhone = normalizePhone(regPhone.trim());
    if (!normalizedPhone) {
      toast({ title: "রেজিস্ট্রেশন ব্যর্থ", description: "সঠিক ফোন নম্বর দিন (01XXXXXXXXX)", variant: "destructive" });
      return;
    }
    if (regPassword.length < 6) {
      toast({ title: "রেজিস্ট্রেশন ব্যর্থ", description: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: existingUser } = await supabase.from("users").select("id").eq("guest_id", normalizedPhone).maybeSingle();
      if (existingUser) throw new Error("এই ফোন নম্বর দিয়ে আগেই অ্যাকাউন্ট তৈরি হয়েছে");

      const fakeEmail = `${normalizedPhone}@goodapp.local`;
      const { error } = await supabase.auth.signUp({
        email: fakeEmail,
        password: regPassword,
        options: { data: { display_name: displayName.trim(), phone: normalizedPhone } },
      });
      if (error) {
        if (error.message.includes("already registered")) throw new Error("এই ফোন নম্বর দিয়ে আগেই অ্যাকাউন্ট তৈরি হয়েছে");
        throw error;
      }
      toast({
        title: "রেজিস্ট্রেশন সফল!",
        description: "আপনার অ্যাকাউন্ট তৈরি হয়েছে।",
      });
      navigate("/dashboard");
    } catch (err: unknown) {
      toast({ title: "রেজিস্ট্রেশন ব্যর্থ", description: mapAuthErrorToBnMessage(err), variant: "destructive" });
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
    <div className="min-h-screen relative overflow-hidden">
      {/* Premium background image */}
      <div className="fixed inset-0 z-0">
        <img src={loginBg} alt="" className="w-full h-full object-cover" width={1080} height={1920} />
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      </div>

      {/* Floating particles - faster */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            animate={{
              y: [0, -40, 0],
              x: [0, (i % 2 === 0 ? 15 : -15), 0],
              opacity: [0.3, 0.7, 0.3],
            }}
            transition={{ duration: 2.5 + i * 0.6, repeat: Infinity, delay: i * 0.3 }}
            className="absolute w-2 h-2 rounded-full bg-primary/40"
            style={{ top: `${15 + i * 14}%`, left: `${10 + i * 15}%` }}
          />
        ))}
        <motion.div
          animate={{ y: [0, -20, 0], opacity: [0.03, 0.08, 0.03] }}
          transition={{ duration: 5, repeat: Infinity }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="text-[120px] md:text-[200px] font-black text-foreground/[0.03] select-none tracking-tighter leading-none">
            good-app
          </span>
        </motion.div>
      </div>

      <div className="relative z-10 max-w-md mx-auto px-4 py-4 min-h-screen flex flex-col">
        {/* Logo & Header - compact */}
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center pt-2 pb-3"
        >
          <motion.img
            src="/logo.png"
            alt="Good App"
            className="w-16 h-16 mx-auto mb-2 drop-shadow-2xl rounded-2xl"
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: "spring", stiffness: 300 }}
          />
          <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-primary via-primary/80 to-accent">
            Good App
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">আপনার বিশ্বস্ত সোশ্যাল ও আর্নিং প্ল্যাটফর্ম</p>
        </motion.div>

        {/* Tab Switcher - unique pill style */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.25 }}
          className="flex rounded-2xl p-1.5 mb-4 backdrop-blur-xl border border-border/50 shadow-2xl relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, hsl(222 47% 10% / 0.9), hsl(222 47% 12% / 0.9))" }}
        >
          {(["login", "register"] as const).map((t) => (
            <motion.button
              key={t}
              onClick={() => setTab(t)}
              whileTap={{ scale: 0.92 }}
              className={`flex-1 py-3.5 rounded-xl text-sm font-black tracking-wide transition-all duration-200 relative overflow-hidden z-10 ${
                tab === t
                  ? "text-white shadow-xl"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={tab === t ? {
                background: t === "login" 
                  ? "linear-gradient(135deg, hsl(210 100% 45%), hsl(220 95% 55%), hsl(230 85% 60%))"
                  : "linear-gradient(135deg, hsl(340 80% 50%), hsl(350 85% 58%), hsl(0 80% 60%))",
                boxShadow: t === "login"
                  ? "0 4px 20px -4px hsl(220 95% 55% / 0.6), 0 0 30px -8px hsl(220 95% 55% / 0.3)"
                  : "0 4px 20px -4px hsl(340 80% 50% / 0.6), 0 0 30px -8px hsl(340 80% 50% / 0.3)",
              } : {}}
            >
              {tab === t && (
                <motion.div
                  layoutId="tab-active-bg"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: "linear-gradient(90deg, transparent, hsla(0,0%,100%,0.15), transparent)" }}
                  transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
                />
              )}
              <motion.span
                initial={false}
                animate={tab === t ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={{ duration: 0.2 }}
                className="relative z-10 text-[15px]"
              >
                {t === "login" ? "🔑 লগইন" : "✨ রেজিস্ট্রেশন"}
              </motion.span>
            </motion.button>
          ))}
        </motion.div>


        {/* Form Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="glass-card rounded-3xl p-5 border border-border/30 backdrop-blur-md"
        >
          <AnimatePresence mode="wait">
            {tab === "login" ? (
              <motion.form
                key="login"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.15 }}
                onSubmit={handleLogin}
                className="space-y-3.5"
              >
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 ml-1 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> ফোন নম্বর
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="input-field text-base py-3.5"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 ml-1 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> পাসওয়ার্ড
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="আপনার পাসওয়ার্ড..."
                    className="input-field text-base py-3.5"
                  />
                </div>
                <motion.button
                  type="submit"
                  disabled={isSubmitting || !phone || !password}
                  className="login-btn-royal py-4 text-lg w-full rounded-2xl"
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.02, y: -2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                >
                  {isSubmitting ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}>
                      <Loader2 className="w-6 h-6" />
                    </motion.div>
                  ) : (
                    <span className="inline-flex items-center gap-2.5 text-lg font-black relative z-10">
                      🚀 লগইন করুন <ArrowRight className="w-5 h-5" />
                    </span>
                  )}
                </motion.button>
              </motion.form>
            ) : (
              <motion.form
                key="register"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.15 }}
                onSubmit={handleRegister}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 ml-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> আপনার নাম
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="আপনার নাম লিখুন..."
                    className="input-field text-base py-3"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 ml-1 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> ফোন নম্বর
                  </label>
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="input-field text-base py-3"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 ml-1 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> পাসওয়ার্ড
                  </label>
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="কমপক্ষে ৬ অক্ষর..."
                    className="input-field text-base py-3"
                  />
                </div>

                {/* Terms checkbox */}
                <div className="flex items-start gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setAgreedTerms(!agreedTerms)}
                    className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                      agreedTerms
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/40 hover:border-primary/60"
                    }`}
                  >
                    {agreedTerms && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    আমি{" "}
                    <button
                      type="button"
                      onClick={() => setShowTerms(true)}
                      className="text-primary font-bold underline underline-offset-2"
                    >
                      শর্তাবলী ও নীতিমালা
                    </button>{" "}
                    পড়েছি এবং সম্মতি দিচ্ছি
                  </p>
                </div>

                <motion.button
                  type="submit"
                  disabled={isSubmitting || !displayName.trim() || !regPhone || regPassword.length < 6 || !agreedTerms}
                  className="register-btn-rose py-4 text-lg w-full rounded-2xl"
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.02, y: -2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                >
                  {isSubmitting ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}>
                      <Loader2 className="w-6 h-6" />
                    </motion.div>
                  ) : (
                    <span className="inline-flex items-center gap-2.5 text-lg font-black relative z-10">
                      ✨ রেজিস্টার করুন <ArrowRight className="w-5 h-5" />
                    </span>
                  )}
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Video & Telegram Links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="flex flex-col gap-2.5 mt-4"
        >
          {videoUrl && (
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-destructive/10 border border-destructive/20 hover:bg-destructive/15 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center">
                <PlayCircle className="w-5 h-5 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-destructive">📹 ভিডিও দেখুন</p>
                <p className="text-xs text-muted-foreground">কিভাবে রেজিস্টার ও ব্যবহার করবেন</p>
              </div>
              <ExternalLink className="w-4 h-4 text-destructive/60" />
            </a>
          )}

          <a
            href="https://t.me/goodappbuy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[hsl(200,80%,50%)]/10 border border-[hsl(200,80%,50%)]/20 hover:bg-[hsl(200,80%,50%)]/15 transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-[hsl(200,80%,50%)]/20 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-[hsl(200,80%,50%)]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-[hsl(200,80%,50%)]">টেলিগ্রাম গ্রুপে জয়েন করুন</p>
              <p className="text-xs text-muted-foreground">অ্যাডমিনের সাথে যোগাযোগ করুন</p>
            </div>
            <ExternalLink className="w-4 h-4 text-[hsl(200,80%,50%)]/60" />
          </a>
        </motion.div>

        {/* Features Section - premium animated */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-5"
        >
          <motion.h2
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="text-lg font-bold mb-3 flex items-center gap-2"
          >
            <motion.span
              animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Sparkles className="w-5 h-5 text-[hsl(var(--amber))]" />
            </motion.span>
            <span className="bg-gradient-to-r from-[hsl(var(--amber))] via-[hsl(var(--orange))] to-[hsl(var(--pink))] bg-clip-text text-transparent font-black">
              আমাদের ফিচারসমূহ
            </span>
          </motion.h2>
          <div className="grid grid-cols-2 gap-2.5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.35 + i * 0.08, type: "spring", damping: 15 }}
                whileHover={{ scale: 1.05, y: -4 }}
                whileTap={{ scale: 0.95 }}
                className="p-3.5 rounded-2xl border border-border/30 backdrop-blur-sm relative overflow-hidden group cursor-pointer"
                style={{
                  background: `linear-gradient(135deg, ${
                    ['hsl(var(--cyan) / 0.12)', 'hsl(var(--pink) / 0.12)', 'hsl(var(--amber) / 0.12)', 'hsl(var(--emerald) / 0.12)', 'hsl(var(--purple) / 0.12)', 'hsl(var(--blue) / 0.12)'][i]
                  }, ${
                    ['hsl(var(--blue) / 0.06)', 'hsl(var(--purple) / 0.06)', 'hsl(var(--orange) / 0.06)', 'hsl(var(--cyan) / 0.06)', 'hsl(var(--pink) / 0.06)', 'hsl(var(--emerald) / 0.06)'][i]
                  })`
                }}
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100"
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 2 }}
                />
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                  transition={{ duration: 4, repeat: Infinity, delay: i * 0.3 }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-2"
                  style={{
                    background: `linear-gradient(135deg, ${
                      ['hsl(var(--cyan) / 0.3)', 'hsl(var(--pink) / 0.3)', 'hsl(var(--amber) / 0.3)', 'hsl(var(--emerald) / 0.3)', 'hsl(var(--purple) / 0.3)', 'hsl(var(--blue) / 0.3)'][i]
                    }, ${
                      ['hsl(var(--blue) / 0.2)', 'hsl(var(--purple) / 0.2)', 'hsl(var(--orange) / 0.2)', 'hsl(var(--cyan) / 0.2)', 'hsl(var(--pink) / 0.2)', 'hsl(var(--emerald) / 0.2)'][i]
                    })`
                  }}
                >
                  <f.icon className="w-4.5 h-4.5" style={{
                    color: ['hsl(var(--cyan))', 'hsl(var(--pink))', 'hsl(var(--amber))', 'hsl(var(--emerald))', 'hsl(var(--purple))', 'hsl(var(--blue))'][i]
                  }} />
                </motion.div>
                <p className="text-xs font-black" style={{
                  color: ['hsl(var(--cyan))', 'hsl(var(--pink))', 'hsl(var(--amber))', 'hsl(var(--emerald))', 'hsl(var(--purple))', 'hsl(var(--blue))'][i]
                }}>{f.title}</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* About Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-4"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowAbout(!showAbout)}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border border-[hsl(var(--cyan))]/20 relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, hsl(var(--cyan) / 0.08), hsl(var(--blue) / 0.06))" }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-[hsl(var(--cyan))]/10 to-transparent"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 4, repeat: Infinity, repeatDelay: 2 }}
            />
            <span className="text-sm font-black bg-gradient-to-r from-[hsl(var(--cyan))] to-[hsl(var(--blue))] bg-clip-text text-transparent relative z-10">📖 আমাদের সম্পর্কে</span>
            <motion.div animate={{ rotate: showAbout ? 180 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronDown className="w-4 h-4 text-[hsl(var(--cyan))]" />
            </motion.div>
          </motion.button>
          <AnimatePresence>
            {showAbout && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="px-4 py-3 text-xs text-muted-foreground leading-relaxed space-y-2">
                  <p>
                    <strong className="text-foreground">Good App</strong> হলো একটি সোশ্যাল মিডিয়া ও আর্নিং প্ল্যাটফর্ম যেখানে আপনি বন্ধুদের সাথে
                    চ্যাট, ভিডিও কল, পোস্ট শেয়ার করার পাশাপাশি ভেরিফিকেশন কী সংগ্রহ করে আয়ও করতে পারবেন।
                  </p>
                  <p>
                    আমাদের লক্ষ্য হলো বাংলাদেশের মানুষদের জন্য একটি নিরাপদ, সহজ এবং লাভজনক প্ল্যাটফর্ম তৈরি করা।
                    অ্যাপটি সম্পূর্ণ বাংলায় ডিজাইন করা হয়েছে যাতে সবাই সহজে ব্যবহার করতে পারেন।
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Terms Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="mt-3 mb-8"
        >
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowTerms(true)}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border border-[hsl(var(--amber))]/20 relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, hsl(var(--amber) / 0.08), hsl(var(--orange) / 0.06))" }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-[hsl(var(--amber))]/10 to-transparent"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 4, repeat: Infinity, repeatDelay: 3 }}
            />
            <span className="text-sm font-black bg-gradient-to-r from-[hsl(var(--amber))] to-[hsl(var(--orange))] bg-clip-text text-transparent relative z-10">📜 শর্তাবলী ও নীতিমালা</span>
            <motion.div
              animate={{ x: [0, 4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <ArrowRight className="w-4 h-4 text-[hsl(var(--amber))]" />
            </motion.div>
          </motion.button>
        </motion.div>

        {/* Footer */}
        <div className="text-center pb-6 mt-auto">
          <p className="text-[10px] text-muted-foreground/50">© {new Date().getFullYear()} Good App. সর্বস্বত্ব সংরক্ষিত।</p>
        </div>
      </div>

      {/* Terms Modal */}
      <AnimatePresence>
        {showTerms && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowTerms(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-background rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[80vh] overflow-y-auto border border-border/50"
            >
              <div className="sticky top-0 bg-background/95 backdrop-blur-md p-5 border-b border-border/30">
                <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-3 sm:hidden" />
                <h3 className="text-lg font-bold text-foreground text-center">📜 শর্তাবলী ও নীতিমালা</h3>
                <p className="text-xs text-muted-foreground text-center mt-1">রেজিস্ট্রেশনের আগে অবশ্যই পড়ুন</p>
              </div>

              <div className="p-5 space-y-4">
                {TERMS.map((term, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex gap-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{term}</p>
                  </motion.div>
                ))}

                {/* Telegram Join Link */}
                <div className="mt-4 p-3 rounded-2xl bg-[hsl(200,80%,50%)]/10 border border-[hsl(200,80%,50%)]/20">
                  <p className="text-sm text-foreground font-bold mb-2">👥 টেলিগ্রাম গ্রুপে জয়েন করুন:</p>
                  <a
                    href="https://t.me/goodappbuy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[hsl(200,80%,50%)] font-bold underline flex items-center gap-1"
                  >
                    t.me/goodappbuy <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <p className="text-xs text-muted-foreground mt-1">এখানে জয়েন করে অ্যাডমিনকে মেসেজ দিতে পারবেন</p>
                </div>
              </div>

              <div className="sticky bottom-0 bg-background/95 backdrop-blur-md p-4 border-t border-border/30">
                <button
                  onClick={() => {
                    setAgreedTerms(true);
                    setShowTerms(false);
                    if (tab === "login") setTab("register");
                  }}
                  className="btn-primary py-3 text-sm w-full"
                >
                  <CheckCircle2 className="w-4 h-4" /> আমি সম্মতি দিচ্ছি — রেজিস্ট্রেশন করি
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
