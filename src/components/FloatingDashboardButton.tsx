import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Home } from "lucide-react";

const SHOW_ON_ROUTES = ["/feed", "/reels", "/short-reels"];

export default function FloatingDashboardButton() {
  const location = useLocation();
  const navigate = useNavigate();

  const show = SHOW_ON_ROUTES.some((r) => location.pathname.startsWith(r));

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, y: 30, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.8 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          onClick={() => navigate("/dashboard")}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-5 py-2.5 rounded-full shadow-2xl"
          style={{
            background: "linear-gradient(135deg, #22c55e, #16a34a)",
            color: "#fff",
            boxShadow: "0 4px 24px rgba(34,197,94,0.4)",
          }}
        >
          <Home className="w-4 h-4" />
          <span className="text-[13px] font-bold tracking-wide">ড্যাশবোর্ডে ফিরে যান</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
