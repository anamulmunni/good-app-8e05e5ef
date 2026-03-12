import { useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { TransactionList } from "@/components/TransactionList";
import { ArrowLeft, Camera, User, Copy, Check, Pencil, X, Save, Key, Calendar, Phone, MessageCircle, Send, Headphones } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function Profile() {
  const { user, isLoading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copyId = () => {
    if (user?.guest_id) {
      navigator.clipboard.writeText(user.guest_id);
      setCopied(true);
      toast({ title: "কপি করা হয়েছে" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `${user.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      await supabase.from("users").update({ avatar_url: urlData.publicUrl }).eq("id", user.id);
      await refreshUser();
      toast({ title: "প্রোফাইল ছবি আপডেট হয়েছে" });
    } catch {
      toast({ title: "আপলোড ব্যর্থ হয়েছে", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveName = async () => {
    if (!user || !newName.trim() || newName.trim() === user.display_name) {
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await supabase.from("users").update({ display_name: newName.trim() }).eq("id", user.id);
      await refreshUser();
      setIsEditingName(false);
      toast({ title: "নাম আপডেট হয়েছে" });
    } catch {
      toast({ title: "আপডেট ব্যর্থ", variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  const joinDate = user.created_at ? new Date(user.created_at).toLocaleDateString("bn-BD", { year: "numeric", month: "long", day: "numeric" }) : "—";

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Decorative background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-15%] right-[-15%] w-[500px] h-[500px] bg-primary/15 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-[hsl(var(--purple))]/10 rounded-full blur-[100px]" />
      </div>

      <header className="sticky top-0 z-50 glass-card border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="p-2 hover:bg-secondary rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">প্রোফাইল</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-8 space-y-6 relative z-10">
        {/* Avatar & Name Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-3xl overflow-hidden">
          {/* Cover gradient */}
          <div className="h-24 bg-gradient-to-br from-primary/30 via-[hsl(var(--purple))]/20 to-[hsl(var(--cyan))]/20 relative" />

          <div className="px-8 pb-8 -mt-12 text-center">
            {/* Avatar */}
            <div className="relative inline-block mb-4">
              <button onClick={handleAvatarClick} disabled={uploading} className="relative group">
                <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-background bg-secondary flex items-center justify-center shadow-xl shadow-primary/10">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-12 h-12 text-muted-foreground" />
                  )}
                </div>
                <div className="absolute bottom-1 right-1 bg-primary text-primary-foreground w-9 h-9 rounded-full flex items-center justify-center border-3 border-background group-hover:scale-110 transition-transform shadow-lg">
                  {uploading ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>

            {/* Name with edit */}
            <AnimatePresence mode="wait">
              {isEditingName ? (
                <motion.div key="editing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2 mb-2">
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="input-field text-center text-lg font-bold max-w-[200px] py-2"
                    autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setIsEditingName(false); }} />
                  <button onClick={handleSaveName} disabled={savingName} className="p-2 bg-primary text-primary-foreground rounded-full hover:opacity-80 transition-all">
                    {savingName ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setIsEditingName(false)} className="p-2 bg-secondary text-muted-foreground rounded-full hover:bg-destructive/20 transition-all">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ) : (
                <motion.div key="display" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2 mb-2">
                  <h2 className="text-xl font-bold">{user.display_name || "Unknown"}</h2>
                  <button onClick={() => { setNewName(user.display_name || ""); setIsEditingName(true); }}
                    className="p-1.5 hover:bg-primary/20 rounded-full text-muted-foreground hover:text-primary transition-all">
                    <Pencil className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ID */}
            <div className="flex items-center justify-center gap-2">
              <p className="text-xs text-muted-foreground font-mono bg-secondary/50 px-3 py-1 rounded-full">{user.guest_id}</p>
              <button onClick={copyId} className="p-1 hover:bg-secondary rounded transition-colors">
                {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 gap-3">
          <div className="glass-card rounded-2xl p-5 text-center space-y-1">
            <Key className="w-6 h-6 text-primary mx-auto" />
            <p className="text-2xl font-black text-primary">{user.key_count || 0}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">ভেরিফাইড কি</p>
          </div>
          <div className="glass-card rounded-2xl p-5 text-center space-y-1">
            <Calendar className="w-6 h-6 text-[hsl(var(--cyan))] mx-auto" />
            <p className="text-sm font-bold text-foreground">{joinDate}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">জয়েন তারিখ</p>
          </div>
        </motion.div>

        {/* Support Section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <div className="glass-card rounded-3xl p-6 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Headphones className="w-5 h-5 text-primary" /> সাপোর্ট
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl">
                <User className="w-5 h-5 text-primary flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">ডেভেলপার</p>
                  <p className="font-bold text-sm">Md Anamul Haque</p>
                </div>
              </div>
              <a href="https://wa.me/8801892564963" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-[hsl(var(--emerald))]/10 border border-[hsl(var(--emerald))]/20 rounded-xl hover:bg-[hsl(var(--emerald))]/20 transition-colors">
                <MessageCircle className="w-5 h-5 text-[hsl(var(--emerald))] flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">WhatsApp</p>
                  <p className="font-bold text-sm text-[hsl(var(--emerald))]">01892564963</p>
                </div>
              </a>
              <a href="https://t.me/+6a3iUf1_GAhiMWY1" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-[hsl(var(--blue))]/10 border border-[hsl(var(--blue))]/20 rounded-xl hover:bg-[hsl(var(--blue))]/20 transition-colors">
                <Send className="w-5 h-5 text-[hsl(var(--blue))] flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Telegram Group</p>
                  <p className="font-bold text-sm text-[hsl(var(--blue))]">Join Telegram Group</p>
                </div>
              </a>
            </div>
          </div>
        </motion.div>

        {/* Transaction History */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h3 className="text-lg font-bold mb-4 px-2">লেনদেনের ইতিহাস</h3>
          <TransactionList />
        </motion.div>
      </main>
    </div>
  );
}
