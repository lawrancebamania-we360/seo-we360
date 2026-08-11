import { DomainFavicon } from "@/components/dashboard/domain-favicon";

// A competitor / brand logo that works whether or not we have a domain:
//   - domain present  -> the real logo (DomainFavicon's Logo.dev / favicon chain).
//   - name only       -> a deterministic colored initial keyed off the name, so a
//                        brand the AI merely NAMED (no URL) still reads as itself.
//
// Semantic wrapper over DomainFavicon so competitor surfaces express intent
// ("logo for this company") and there's a single place to evolve later (e.g. a
// client-side resolve). Server callers should resolve names -> domains up front
// via lib/logos/company-domain.ts and pass `domain` when known.
export function CompanyLogo({
  name,
  domain,
  size = 24,
  rounded = "rounded",
  className,
}: {
  name: string;
  domain?: string | null;
  size?: number;
  rounded?: string;
  className?: string;
}) {
  return (
    <DomainFavicon
      domain={domain ?? undefined}
      label={name}
      size={size}
      rounded={rounded}
      className={className}
    />
  );
}
