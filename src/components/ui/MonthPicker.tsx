"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";

interface MonthPickerProps {
  value: Date;
  onChange: (date: Date) => void;
  max?: Date;
}

export function MonthPicker({ value, onChange, max }: MonthPickerProps) {
  const isAtMax = max ? value >= max : false;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(subMonths(value, 1))}
        className="p-1.5 rounded-lg hover:bg-cream-dark transition-colors text-gray-500 hover:text-header"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="font-sans font-medium text-sm text-header min-w-[110px] text-center">
        {format(value, "MMMM yyyy")}
      </span>
      <button
        onClick={() => onChange(addMonths(value, 1))}
        disabled={isAtMax}
        className="p-1.5 rounded-lg hover:bg-cream-dark transition-colors text-gray-500 hover:text-header disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
