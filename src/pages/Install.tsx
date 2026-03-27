import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Check, Smartphone, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export default function Install() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => setIsInstalled(true);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <button onClick={() => navigate("/dashboard")} className="absolute top-4 left-4 text-muted-foreground hover:text-foreground">
        <ArrowLeft size={24} />
      </button>

      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-sm">
        <div className="w-24 h-24 mx-auto mb-6 rounded-2xl overflow-hidden shadow-2xl shadow-primary/30">
          <img src="/icon-192.png" alt="Good App" className="w-full h-full object-cover" />
        </div>

        <h1 className="text-2xl font-black text-foreground mb-2">Good App ইনস্টল করুন</h1>
        <p className="text-muted-foreground text-sm mb-8">
          আপনার ফোনে অ্যাপ হিসেবে ইনস্টল করুন — Play Store লাগবে না, সম্পূর্ণ ফ্রি!
        </p>

        {isInstalled ? (
          <div className="flex items-center justify-center gap-2 text-[hsl(var(--emerald))] font-bold text-lg">
            <Check className="w-6 h-6" />
            <span>ইনস্টল হয়ে গেছে! ✅</span>
          </div>
        ) : deferredPrompt ? (
          <motion.button whileTap={{ scale: 0.95 }} onClick={handleInstall}
            className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-xl shadow-primary/30">
            <Download className="w-6 h-6" />
            এখনই ইনস্টল করুন
          </motion.button>
        ) : (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-5 text-left space-y-3">
              <p className="font-bold text-foreground flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-primary" /> Android এ ইনস্টল করুন:
              </p>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Chrome ব্রাউজারে এই ওয়েবসাইট ওপেন করুন</li>
                <li>উপরে ⋮ (তিনটি ডট) মেনুতে ক্লিক করুন</li>
                <li><strong className="text-foreground">"Install app"</strong> বা <strong className="text-foreground">"Add to Home screen"</strong> এ ক্লিক করুন</li>
                <li>Install বাটনে ক্লিক করুন — ব্যস! 🎉</li>
              </ol>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-6">
          ইনস্টল করলে হোম স্ক্রিনে অ্যাপ আইকন আসবে, ফুলস্ক্রিনে চলবে!
        </p>
      </motion.div>
    </div>
  );
}
