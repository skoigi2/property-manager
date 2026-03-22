import { clsx } from "clsx";

type BadgeVariant = "green" | "red" | "amber" | "gray" | "gold" | "blue";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  gray: "bg-gray-100 text-gray-500",
  gold: "bg-yellow-100 text-yellow-700",
  blue: "bg-blue-100 text-blue-700",
};

export function Badge({ variant = "gray", children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium font-sans",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
