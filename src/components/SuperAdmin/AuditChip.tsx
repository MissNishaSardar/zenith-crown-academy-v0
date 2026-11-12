"use client";

import { Badge } from "@/components/shadcnui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/shadcnui/tooltip";

import { auditMeta } from "@/lib/auditSeverity";
import { statusTones } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

type AuditChipProps = {
  action: string;
  className?: string;
  details?: string | undefined;
};

/** Pretty printed details when the stored JSON is a non empty object. */
const detailsTooltip = (details: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(details);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.keys(parsed as Record<string, unknown>).length > 0
    ) {
      return JSON.stringify(parsed, null, 2);
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Icon and plain English label for one audit action, tone carried by color.
 * The raw action code shows on hover and keyboard focus, with the stored
 * JSON context below it when the action recorded a non empty object.
 */
const AuditChip = ({ action, className, details }: AuditChipProps) => {
  const meta = auditMeta(action);
  const Icon = meta.icon;
  const pretty =
    details !== undefined && details !== "" ? detailsTooltip(details) : null;

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              className={cn("w-fit cursor-help", className)}>
              <Badge
                variant="outline"
                className={cn("w-fit shrink-0", statusTones[meta.tone])}>
                <Icon
                  aria-hidden="true"
                  className="size-3.5"
                />
                {meta.label}
              </Badge>
            </span>
          }
        />
        <TooltipContent
          side="top"
          className="max-w-sm">
          <div className="flex flex-col gap-1.5">
            <code className="font-mono text-[11px] leading-snug">{action}</code>
            {pretty ?
              <>
                <div className="bg-background/25 h-px" />
                <pre className="font-mono text-[11px] leading-snug break-all whitespace-pre-wrap">
                  {pretty}
                </pre>
              </>
            : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default AuditChip;
