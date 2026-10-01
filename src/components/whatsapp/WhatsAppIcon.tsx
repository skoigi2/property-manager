/** WhatsApp glyph (lucide has no brand icons): a chat bubble with a handset, in WhatsApp green. */
export function WhatsAppIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      style={className?.includes("text-") ? undefined : { color: "#25D366" }}
    >
      <path
        d="M12 2.2a9.8 9.8 0 0 0-8.4 14.8L2.3 21.8l4.9-1.3A9.8 9.8 0 1 0 12 2.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8.7 7.3c.2-.4.4-.4.7-.4h.6c.2 0 .4.1.5.4l.8 1.9c.1.2 0 .4-.1.6l-.5.6c-.2.2-.2.4-.1.6.6 1 1.4 1.8 2.4 2.4.2.1.4.1.6-.1l.6-.6c.2-.2.4-.2.6-.1l1.8.8c.3.1.4.3.4.5 0 .5-.2 1.1-.6 1.4-.5.4-1.1.6-1.8.5-1.6-.3-3-1.1-4.2-2.3-1.2-1.2-2-2.6-2.3-4.1-.1-.8.1-1.5.6-2.1z"
        fill="currentColor"
      />
    </svg>
  );
}
