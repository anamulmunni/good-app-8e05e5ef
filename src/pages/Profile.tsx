import { useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { TransactionList } from "@/components/TransactionList";
import { ArrowLeft, Camera, User, Copy, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function Profile() {
  const { user, isLoading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copyId = () => {
    if (user?.guest_id) {
      navigator.clipboard.writeText(user.guest_id);
      setCopied(true);
      toast({ title: "ID কপি করা হয়েছে" });
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

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      await supabase
        .from("users")
        .update({ avatar_url: urlData.publicUrl })
        .eq("id", user.id);

      await refreshUser();
      toast({ title: "প্রোফাইল ছবি আপডেট হয়েছে" });
    } catch (err) {
      toast({ title: "আপলোড ব্যর্থ হয়েছে", variant: "destructive" });
    } finally {
      setUploading(false);
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

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-50 glass-card border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="p-2 hover:bg-secondary rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">প্রোফাইল</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-8 space-y-6">
        {/* Avatar & Info */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-3xl p-8 text-center space-y-4">
          <div className="relative inline-block">
            <button onClick={handleAvatarClick} disabled={uploading} className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-primary/30 bg-secondary flex items-center justify-center">
                {(user as any).avatar_url ? (
                  <img src={(user as any).avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-muted-foreground" />
                )}
              </div>
              <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center border-2 border-background group-hover:scale-110 transition-transform">
                {uploading ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          <div>
            <h2 className="text-xl font-bold">{user.display_name || "Unknown"}</h2>
            <div className="flex items-center justify-center gap-2 mt-1">
              <p className="text-sm text-muted-foreground font-mono">ID: {user.guest_id}</p>
              <button onClick={copyId} className="p-1 hover:bg-secondary rounded transition-colors">
                {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
              </button>
            </div>
          </div>

          <div className="pt-4">
            <div className="bg-secondary/50 rounded-xl p-4 border border-border text-center">
              <p className="text-xs text-muted-foreground">ভেরিফাইড কি</p>
              <p className="text-2xl font-black text-primary">{user.key_count || 0}</p>
            </div>
          </div>
        </motion.div>

        {/* Transaction History */}
        <div>
          <h3 className="text-lg font-bold mb-4 px-2">লেনদেনের ইতিহাস</h3>
          <TransactionList />
        </div>
      </main>
    </div>
  );
}
