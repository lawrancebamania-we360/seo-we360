import { cn } from "@/lib/utils";
import { initials } from "@/lib/ui-helpers";

// Deterministic, playful avatar for an AI-inferred persona. Same label always
// renders the same avatar (a hash of the label seeds a two-tone gradient + a soft
// accent blob + the persona's initials). Pure/server-renderable: no hooks.

// FNV-1a: cheap, stable, well-spread hash so nearby labels get distinct colors.
function hashLabel(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function PersonaAvatar({
  label,
  size = 40,
  className,
}: {
  label: string;
  size?: number;
  className?: string;
}) {
  const seed = label?.trim() || "persona";
  const h = hashLabel(seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 35 + (h % 70)) % 360;
  const text = initials(seed) || seed.charAt(0).toUpperCase() || "?";
  const bx = 8 + ((h >> 3) % 12);
  const by = 6 + ((h >> 7) % 10);
  const gid = `pa-grad-${h.toString(36)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={label || "Persona"}
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue1} 68% 56%)`} />
          <stop offset="100%" stopColor={`hsl(${hue2} 66% 44%)`} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill={`url(#${gid})`} />
      <circle cx={bx} cy={by} r="10" fill="#ffffff" fillOpacity="0.16" />
      <text
        x="20"
        y="20"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="15"
        fontWeight="600"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="#ffffff"
      >
        {text}
      </text>
    </svg>
  );
}
