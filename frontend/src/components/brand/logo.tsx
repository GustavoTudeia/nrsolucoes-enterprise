import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/config/brand";

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  nameClassName?: string;
  descriptionClassName?: string;
  /** When true, only the icon/mark is rendered */
  markOnly?: boolean;
  /** When true, wraps the brand in a link to home */
  linked?: boolean;
};

export function BrandLogo({
  className,
  markClassName,
  nameClassName,
  descriptionClassName,
  markOnly,
  linked = true,
}: BrandLogoProps) {
  const content = (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-sm ring-1 ring-border",
          markClassName
        )}
        aria-hidden
      >
        <ShieldCheck className="h-5 w-5" />
      </span>

      {!markOnly && (
        <div className="leading-tight">
          <div className={cn("font-display text-sm font-semibold tracking-tight", nameClassName)}>{BRAND.name}</div>
          <div className={cn("text-xs text-muted-foreground", descriptionClassName)}>{BRAND.shortTagline}</div>
        </div>
      )}
    </div>
  );

  if (!linked) return content;
  return (
    <Link href="/" className="no-underline">
      {content}
      <span className="sr-only">{BRAND.name}</span>
    </Link>
  );
}
