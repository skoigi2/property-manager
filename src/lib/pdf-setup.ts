import "server-only";
import { Font } from "@react-pdf/renderer";

// Shared react-pdf configuration. Import (side-effect) in every PDF generator.
//
// WHY: @react-pdf/renderer 4.3.x (layout 4.4.x) silently DROPS lines of
// wrapped text in two cases (verified by bisection against isolated renders):
//   1. When a word is hyphenated across lines, the line holding the
//      hyphenated fragment vanishes ("…water treat-/ment" loses line 1).
//   2. When a row's columns overflow their padded container and yoga shrinks
//      the text column, the wrapped Text can vanish entirely — so table
//      column widths must sum comfortably under 100% (≈97%) whenever the row
//      carries horizontal padding.
//
// The global registration below fixes (1) in plain Node, but the Next.js
// server bundle ends up with a different react-pdf font-store instance, where
// it has NO effect — so any Text that can wrap must ALSO pass
// `hyphenationCallback={noHyphenation}` directly (layout reads the prop
// first). Revisit if the upstream bug is fixed and the dependency upgraded.
Font.registerHyphenationCallback((word) => [word]);

/** Per-Text escape hatch — breaks lines at word boundaries only. */
export const noHyphenation = (word: string): string[] => [word];
