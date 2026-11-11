"use client";

import { useState } from "react";
import { LoaderIcon, TriangleAlertIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/shadcnui/alert-dialog";
import { Input } from "@/components/shadcnui/input";

type ConfirmDialogProps = {
  busy?: boolean;
  confirmLabel: string;
  description: string;
  destructive?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  requireText?: string;
  requireTextLabel?: string;
  title: string;
};

const ConfirmDialog = ({
  busy = false,
  confirmLabel,
  description,
  destructive = false,
  onConfirm,
  onOpenChange,
  open,
  requireText,
  requireTextLabel,
  title,
}: ConfirmDialogProps) => {
  const [typed, setTyped] = useState("");

  const needsExactMatch = typeof requireText === "string";
  const matchesRequiredText = !needsExactMatch || typed.trim() === requireText;

  const handleOpenChange = (nextOpen: boolean) => {
    if (busy) {
      return;
    }
    if (!nextOpen) {
      setTyped("");
    }
    onOpenChange(nextOpen);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={handleOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TriangleAlertIcon
              aria-hidden="true"
              className={destructive ? "text-destructive" : undefined}
            />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {description}
          </p>
        </AlertDialogHeader>
        {needsExactMatch ?
          <div className="flex flex-col gap-2 text-left">
            <label
              htmlFor="confirm-dialog-required-text"
              className="text-[13.5px] font-semibold">
              {requireTextLabel ?? "Type the following to confirm"}
            </label>
            <Input
              id="confirm-dialog-required-text"
              autoComplete="off"
              autoFocus
              placeholder={requireText}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={busy || !matchesRequiredText}
            onClick={(event) => {
              event.preventDefault();
              if (!busy && matchesRequiredText) {
                onConfirm();
              }
            }}>
            {busy ?
              <>
                <LoaderIcon
                  aria-hidden="true"
                  className="animate-spin"
                />
                Working
              </>
            : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmDialog;
