import Link from "next/link";
import type { Route } from "next";

import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

type StatCardProps = {
  href?: Route;
  hint: string;
  icon: LucideIcon;
  label: string;
  tone?: "default" | "destructive";
  value: number;
};

const StatCard = ({
  href,
  hint,
  icon: Icon,
  label,
  tone = "default",
  value,
}: StatCardProps) => {
  const cardClassName = cn(
    "border-border bg-card text-card-foreground flex flex-col rounded-2xl border p-4 shadow-xs sm:p-5",
    href &&
      "group transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
  );

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted-foreground text-[11px] leading-tight font-semibold tracking-[0.08em] uppercase">
          {label}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-lg border p-2",
            tone === "destructive" ?
              "border-destructive/20 bg-destructive/10 text-destructive"
            : "border-border bg-secondary/60 text-muted-foreground",
          )}>
          <Icon
            className="size-4"
            aria-hidden="true"
          />
        </span>
      </div>
      <span className="font-heading mt-3 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
        {value.toLocaleString("en-IN")}
      </span>
      <span className="text-muted-foreground mt-1.5 flex items-center gap-1 text-[11px] font-medium sm:text-xs">
        {hint}
        {href ?
          <ArrowRight
            className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        : null}
      </span>
    </>
  );

  if (!href) {
    return <div className={cardClassName}>{content}</div>;
  }

  return (
    <Link
      href={href}
      className={cardClassName}>
      {content}
    </Link>
  );
};

export default StatCard;
