"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface HelpTipProps {
  /** The help text shown in the tooltip */
  text: string;
  /** Where the tooltip appears relative to the icon. Defaults to "above". */
  position?: "above" | "below";
}

/** Tooltip width (Tailwind w-56) and the gap kept from the boundary's edge. */
const TIP_WIDTH = 224;
const EDGE_GAP = 8;

/**
 * A small ℹ icon that reveals a contextual tooltip on hover.
 * Keep tooltip text to 1–2 short sentences — no jargon, no instructions.
 *
 * The bubble is only rendered while shown (a hidden one still takes layout
 * and made dialogs scroll sideways), and is centred on the icon unless that
 * would cross the edge of its dialog or the screen — then it lines up with
 * the icon's nearer side instead.
 *
 * Usage:
 *   <label className="flex items-center gap-1.5">
 *     Net Profit <HelpTip text="What's left after all costs." />
 *   </label>
 */
export function HelpTip({ text, position = "above" }: HelpTipProps) {
  const isAbove = position === "above";
  const iconRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"center" | "left" | "right">("center");

  useLayoutEffect(() => {
    if (!open || !iconRef.current) return;
    const icon = iconRef.current.getBoundingClientRect();
    const box = iconRef.current.closest("dialog")?.getBoundingClientRect();
    const left = Math.max(box?.left ?? 0, 0) + EDGE_GAP;
    const right = Math.min(box?.right ?? window.innerWidth, window.innerWidth) - EDGE_GAP;
    const centre = icon.left + icon.width / 2;
    if (centre + TIP_WIDTH / 2 > right) setAlign("right");
    else if (centre - TIP_WIDTH / 2 < left) setAlign("left");
    else setAlign("center");
  }, [open]);

  const bubbleAlign =
    align === "right" ? "right-0" : align === "left" ? "left-0" : "left-1/2 -translate-x-1/2";
  const arrowAlign =
    align === "right" ? "right-1" : align === "left" ? "left-1" : "left-1/2 -translate-x-1/2";

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* ℹ icon */}
      <span
        ref={iconRef}
        role="img"
        aria-label={`Help: ${text}`}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-label font-semibold cursor-help select-none hover:bg-gold/20 hover:text-gold-dark transition-colors duration-150"
      >
        i
      </span>

      {/* Tooltip bubble — rendered only while shown */}
      {open && (
        <span
          role="tooltip"
          className={[
            "pointer-events-none absolute w-56 rounded-xl bg-gray-800 px-3 py-2.5",
            "text-caption text-white normal-case z-50 shadow-xl",
            bubbleAlign,
            isAbove ? "bottom-full mb-2" : "top-full mt-2",
          ].join(" ")}
        >
          {text}
          {/* Arrow */}
          <span
            className={[
              "absolute border-4 border-transparent",
              arrowAlign,
              isAbove ? "top-full border-t-gray-800" : "bottom-full border-b-gray-800",
            ].join(" ")}
          />
        </span>
      )}
    </span>
  );
}
