import { Check } from "lucide-react";

type VerifiedBadgeProps = {
  className?: string;
};

export default function VerifiedBadge({ className = "" }: VerifiedBadgeProps) {
  return (
    <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground ${className}`}>
      <Check className="h-2.5 w-2.5" strokeWidth={3} />
    </span>
  );
}
