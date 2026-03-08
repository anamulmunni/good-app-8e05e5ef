import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestWithdraw } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Loader2, CreditCard } from "lucide-react";
import { motion } from "framer-motion";

export function WithdrawForm({ balance }: { balance: number }) {
  const [method, setMethod] = useState<"bkash" | "nagad">("bkash");
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { mutate: withdraw, isPending } = useMutation({
    mutationFn: async () => {
      const result = await requestWithdraw(user!.id, method, number, Number(amount));

      // Send withdrawal notification to Telegram
      try {
        await supabase.functions.invoke("send-telegram", {
          body: {
            message: `💸 <b>Withdrawal Request</b>\n👤 User: ${user!.guest_id}\n📱 Method: ${method.toUpperCase()}\n📞 Number: ${number}\n💰 Amount: ${amount} TK`,
          },
        });
      } catch (e) {
        console.error("Telegram notification failed:", e);
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setNumber("");
      setAmount("");
      toast({ title: "উইথড্র রিকোয়েস্ট পাঠানো হয়েছে" });
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!number || !amount) return;
    withdraw();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass-card rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-accent/20 rounded-lg">
          <Wallet className="w-6 h-6 text-accent" />
        </div>
        <h2 className="text-xl font-bold">টাকা উত্তোলন (Withdraw)</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMethod("bkash")}
            className={`p-3 rounded-xl border-2 transition-all font-semibold ${
              method === "bkash"
                ? "border-[hsl(var(--pink))] bg-[hsl(var(--pink))]/10 text-[hsl(var(--pink))]"
                : "border-border bg-secondary/50 text-muted-foreground hover:bg-secondary"
            }`}
          >
            bKash
          </button>
          <button
            type="button"
            onClick={() => setMethod("nagad")}
            className={`p-3 rounded-xl border-2 transition-all font-semibold ${
              method === "nagad"
                ? "border-[hsl(var(--orange))] bg-[hsl(var(--orange))]/10 text-[hsl(var(--orange))]"
                : "border-border bg-secondary/50 text-muted-foreground hover:bg-secondary"
            }`}
          >
            Nagad
          </button>
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-2">একাউন্ট নাম্বার</label>
          <input type="tel" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="017xxxxxxxx" className="input-field" required />
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-2">পরিমাণ (কমপক্ষে ৫০ টাকা)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">৳</span>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" min="50" max={balance} className="input-field pl-8" required />
          </div>
        </div>

        <button type="submit" disabled={isPending || !number || !amount || Number(amount) > balance} className="btn-primary mt-2">
          {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>উইথড্র রিকোয়েস্ট পাঠান</span><CreditCard className="w-5 h-5" /></>}
        </button>

        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mt-4">
          <p className="text-xs text-primary leading-relaxed text-center font-medium">
            উইথড্র দেওয়ার ৩০ মিনিটের মধ্যে পেমেন্ট করা হবে। যেকোনো সমস্যায় টেলিগ্রামে যোগাযোগ করুন।
          </p>
        </div>
      </form>
    </motion.div>
  );
}
