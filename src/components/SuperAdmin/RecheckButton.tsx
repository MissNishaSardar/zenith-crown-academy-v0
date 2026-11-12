"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/shadcnui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/shadcnui/tooltip";

import { MIN_LOAD_MS } from "@/lib/auth/withMinimumLoad";

const RecheckButton = () => {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onRecheck = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    const startedAt = Date.now();
    router.refresh();
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOAD_MS) {
      await new Promise((resolve) =>
        window.setTimeout(resolve, MIN_LOAD_MS - elapsed),
      );
    }
    setPending(false);
  };

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void onRecheck()}>
              <RefreshCwIcon
                aria-hidden="true"
                className={pending ? "animate-spin" : undefined}
              />
              {pending ? "Rechecking" : "Recheck"}
            </Button>
          }
        />
        <TooltipContent side="bottom">
          Re-run every check on this page
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default RecheckButton;
