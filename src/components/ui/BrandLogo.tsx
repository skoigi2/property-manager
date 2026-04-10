interface BrandLogoProps {
  /** Pixel size for width & height. Default: 48 */
  size?: number;
  /** When true, wraps the logo in a white circle so the navy graphic reads on dark backgrounds */
  dark?: boolean;
  className?: string;
}

/**
 * Groundwork PM brand logo.
 * - Use `dark` on dark backgrounds (sidebar, auth header cards).
 * - Use without `dark` on light/white/cream backgrounds.
 */
export function BrandLogo({ size = 48, dark = false, className = "" }: BrandLogoProps) {
  if (dark) {
    return (
      <div
        className={`rounded-full bg-white flex items-center justify-center flex-shrink-0 ${className}`}
        style={{ width: size, height: size, padding: Math.round(size * 0.08) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Groundwork PM" width={size} height={size} className="block" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.svg"
      alt="Groundwork PM"
      width={size}
      height={size}
      className={`block flex-shrink-0 ${className}`}
    />
  );
}
