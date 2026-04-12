import { clsx } from "clsx";
import { forwardRef } from "react";
import { HelpTip } from "./HelpTip";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  /** Short contextual tip shown in a hover tooltip next to the label */
  tooltip?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, tooltip, className, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-gray-600 font-sans flex items-center gap-1.5">
            {label}
            {tooltip && <HelpTip text={tooltip} />}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={clsx(
            "w-full border rounded-lg text-sm font-sans px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold bg-cream/50 cursor-pointer",
            error
              ? "border-red-300 focus:ring-red-300 focus:border-red-400"
              : "border-gray-200",
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="">{placeholder}</option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-expense font-sans">{error}</p>}
      </div>
    );
  }
);
Select.displayName = "Select";
