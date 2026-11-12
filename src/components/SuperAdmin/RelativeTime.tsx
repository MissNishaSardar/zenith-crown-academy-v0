"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/shadcnui/tooltip";

import { cn } from "@/lib/utils";
import { dateTimeFmt, relativeTime } from "@/lib/time";

type RelativeTimeProps = {
  className?: string;
  iso: string;
  nowMs: number;
};

/**
 * Relative timestamp with the absolute date and time in a tooltip
 * on hover and keyboard focus. Carries its own TooltipProvider so
 * server components can use it standalone.
 */
const RelativeTime = ({ className, iso, nowMs }: RelativeTimeProps) => (
  <TooltipProvider delay={150}>
    <Tooltip>
      <TooltipTrigger
        render={
          <time
            dateTime={iso}
            tabIndex={0}
            className={cn(
              "text-muted-foreground decoration-muted-foreground/60 cursor-help text-xs tabular-nums underline decoration-dotted underline-offset-2",
              className,
            )}>
            {relativeTime(iso, nowMs)}
          </time>
        }
      />
      <TooltipContent side="top">
        {dateTimeFmt.format(new Date(iso))}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default RelativeTime;
