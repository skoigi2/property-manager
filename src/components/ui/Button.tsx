import { clsx } from "clsx";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "gold";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-2 font-sans font-medium rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-60 disabled:cursor-not-allowed";

  const variants: Record<Variant, string> = {
    primary: "bg-header text-white hover:bg-header/90 active:bg-header/80",
    secondary: "bg-cream-dark text-header border border-gray-200 hover:bg-cream-dark/80",
    danger: "bg-expense text-white hover:bg-expense/90",
    ghost: "text-header hover:bg-cream-dark",
    gold: "bg-gold text-white hover:bg-gold-dark",
  };

  const sizes: Record<Size, string> = {
    sm: "text-xs px-3 py-1.5",
    md: "text-sm px-4 py-2",
    lg: "text-base px-5 py-2.5",
  };

  return (
    <button
      disabled={disabled || loading}
      className={clsx(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
