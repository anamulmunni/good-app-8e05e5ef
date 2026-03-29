import { Check } from "lucide-react";

type VerifiedBadgeProps = {
  className?: string;
};

export default function VerifiedBadge({ className = "" }: VerifiedBadgeProps) {
  return (
    <span
      className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-full shadow-[0_0_6px_rgba(59,130,246,0.5)] ${className}`}
      style={{
        background: "linear-gradient(135deg, #1877F2, #42a5f5)",
        animation: "badge-glow 2s ease-in-out infinite",
      }}
    >
      <Check className="h-3 w-3 text-white" strokeWidth={3.5} />
      <style>{`
        @keyframes badge-glow {
          0%, 100% { box-shadow: 0 0 4px rgba(24,119,242,0.4); }
          50% { box-shadow: 0 0 10px rgba(24,119,242,0.7), 0 0 20px rgba(24,119,242,0.3); }
        }
      `}</style>
    </span>
  );
}
