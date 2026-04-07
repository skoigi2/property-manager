import { clsx } from "clsx";
import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  help?: string;
  error?: string;
  prefix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, help, error, prefix, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-gray-600 font-sans">
            {label}
          </label>
        )}
        <div className="relative">
          {prefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono pointer-events-none">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={clsx(
              "w-full border rounded-lg text-sm font-sans transition-colors focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold bg-cream/50",
              "px-3 py-2.5",
              prefix && "pl-10",
              error
                ? "border-red-300 focus:ring-red-300 focus:border-red-400"
                : "border-gray-200",
              className
            )}
            {...props}
          />
        </div>
        {help && !error && <p className="text-xs text-gray-400 font-sans">{help}</p>}
        {error && <p className="text-xs text-expense font-sans">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
