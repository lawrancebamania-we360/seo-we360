import Image from "next/image";
import Link from "next/link";

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const logoH = size === "lg" ? 36 : size === "sm" ? 22 : 28;
  const logoW = Math.round(logoH * (128 / 25)); // aspect ratio of we360-logo.webp
  const sub = size === "lg" ? "text-sm" : "text-xs";
  return (
    <Link href="/" className="inline-flex items-center gap-3 group">
      <Image
        src="/we360-logo.webp"
        alt="we360.ai"
        width={logoW}
        height={logoH}
        priority
        className="w-auto transition-transform group-hover:scale-[1.02] dark:brightness-0 dark:invert"
        style={{ height: logoH }}
      />
      <div className={`${sub} text-muted-foreground`}>Internal SEO Dashboard</div>
    </Link>
  );
}
