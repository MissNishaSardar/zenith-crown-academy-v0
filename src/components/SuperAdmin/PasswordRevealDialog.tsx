"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon, LoaderIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcnui/dialog";
import { Button } from "@/components/shadcnui/button";
import { Input } from "@/components/shadcnui/input";
import { MIN_LOAD_MS } from "@/lib/auth/withMinimumLoad";

type PasswordRevealDialogProps = {
  onClose: () => void;
  open: boolean;
  password: string;
  userName: string;
};

const PasswordRevealDialog = ({
  onClose,
  open,
  password,
  userName,
}: PasswordRevealDialogProps) => {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  const onCopy = async () => {
    if (copying) {
      return;
    }
    setCopying(true);
    const startedAt = Date.now();
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable: leave the field selectable for manual copy.
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_LOAD_MS) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, MIN_LOAD_MS - elapsed),
        );
      }
      setCopying(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center sm:items-start sm:text-left">
          <span
            aria-hidden="true"
            className="border-border bg-secondary/60 text-muted-foreground inline-flex size-12 items-center justify-center rounded-2xl border">
            <KeyRoundIcon className="size-6" />
          </span>
          <DialogTitle className="font-heading text-lg">
            Save this password now
          </DialogTitle>
          <DialogDescription>
            This is the only time the password for{" "}
            <span className="text-foreground font-semibold">{userName}</span> is
            shown. Share it offline. Email is not set up yet, so it will not be
            delivered anywhere.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              readOnly
              aria-label="Generated password"
              value={password}
              onFocus={(event) => event.target.select()}
              className="pr-12 font-mono text-[15px] tracking-wide"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={copying}
              aria-label={copied ? "Copied" : "Copy password"}
              onClick={onCopy}
              className="absolute top-1/2 right-1.5 -translate-y-1/2">
              {copying ?
                <LoaderIcon
                  aria-hidden="true"
                  className="animate-spin"
                />
              : copied ?
                <CheckIcon aria-hidden="true" />
              : <CopyIcon aria-hidden="true" />}
            </Button>
          </div>
          <Button
            type="button"
            onClick={onClose}
            className="shrink-0">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PasswordRevealDialog;
