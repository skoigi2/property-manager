"use client";

interface HelpTipProps {
  /** The help text shown in the tooltip */
  text: string;
  /** Where the tooltip appears relative to the icon. Defaults to "above". */
  position?: "above" | "below";
}

/**
 * A small ℹ icon that reveals a contextual tooltip on hover.
 * Keep tooltip text to 1–2 short sentences — no jargon, no instructions.
 *
 * Usage:
 *   <label className="flex items-center gap-1.5">
 *     Net Profit <HelpTip text="What's left after all costs." />
 *   </label>
 */
export function HelpTip({ text, position = "above" }: HelpTipProps) {
  const isAbove = position === "above";

  return (
    <span className="relative inline-flex items-center group">
      {/* ℹ icon */}
      <span
        role="img"
        aria-label="Help"
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[9px] font-bold leading-none cursor-help select-none hover:bg-gold/20 hover:text-gold-dark transition-colors duration-150"
      >
        i
      </span>

      {/* Tooltip bubble */}
      <span
        className={[
          "pointer-events-none absolute left-1/2 -translate-x-1/2 w-56 rounded-xl bg-gray-800 px-3 py-2.5",
          "text-[11px] text-white font-sans leading-relaxed font-normal normal-case tracking-normal",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-xl",
          isAbove ? "bottom-full mb-2" : "top-full mt-2",
        ].join(" ")}
      >
        {text}
        {/* Arrow */}
        <span
          className={[
            "absolute left-1/2 -translate-x-1/2 border-4 border-transparent",
            isAbove ? "top-full border-t-gray-800" : "bottom-full border-b-gray-800",
          ].join(" ")}
        />
      </span>
    </span>
  );
}
