/**
 * Shared shield artwork for the generated PNG icons (app/icon.tsx,
 * app/apple-icon.tsx, app/icon-*.png routes). Mirrors public/icon.svg:
 * violet diagonal gradient, white shield outline, cyan check. The
 * push path stores text only, so binary icon files can't be shipped
 * directly — Next's ImageResponse renders these PNGs at runtime
 * instead (verified byte-for-byte in production after deploy).
 */
export function shieldSvg(size: number, rounded: boolean): React.ReactNode {
  const rx = rounded ? size * (112 / 512) : 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="0.55" stopColor="#6d28d9" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx={rx} fill="url(#g)" />
      <path
        d="M256 96l120 48v96c0 84-52 148-120 176-68-28-120-92-120-176v-96l120-48z"
        fill="none"
        stroke="#fff"
        strokeWidth="32"
        strokeLinejoin="round"
      />
      <path
        d="M208 256l32 32 72-80"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
