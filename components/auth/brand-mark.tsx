import Link from "next/link";

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "size-12 text-base" : size === "sm" ? "size-8 text-xs" : "size-10 text-sm";
  const title = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  const sub = size === "lg" ? "text-sm" : "text-xs";
  return (
    <Link href="/" className="inline-flex items-center gap-3 group">
      <div className={`flex ${box} items-center justify-center rounded-xl bg-[#5B45E0] text-white font-bold shadow-lg shadow-[#5B45E0]/20 transition-transform group-hover:scale-105`}>
        W
      </div>
      <div>
        <div className={`font-bold ${title} leading-none tracking-tight text-[#231D4F] dark:text-white`}>
          SEO <span className="text-[#5B45E0]">we360</span>
        </div>
        <div className={`${sub} text-muted-foreground`}>Internal SEO Dashboard</div>
      </div>
    </Link>
  );
}
