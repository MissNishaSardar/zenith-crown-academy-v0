"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/shadcnui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcnui/dialog";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { unbanUserSchema, type unbanUserType } from "@/lib/zodSchema";
import type { UsersRow } from "./UsersColumns";

import { unbanUser } from "@/server/admin/userActions";

type UnbanUserDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: UsersRow | null;
};

const UnbanUserDialog = ({
  onOpenChange,
  open,
  user,
}: UnbanUserDialogProps) => {
  const router = useRouter();

  const {
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<unbanUserType>({
    defaultValues: { id: "" },
    mode: "all",
    resolver: zodResolver(unbanUserSchema),
  });

  const userId = user?.id;

  useEffect(() => {
    if (open && userId) {
      reset({ id: userId });
    }
  }, [open, reset, userId]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
  };

  const onSubmit = async (values: unbanUserType) => {
    const result = await withMinimumLoad(unbanUser(values));
    if (!result.ok) {
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      return;
    }
    handleOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Unban user</DialogTitle>
          <DialogDescription>
            {user ?
              `Unban ${user.name}. This clears the reason and expiry. They can sign in again with a new session.`
            : "Unban this user. This clears the reason and expiry."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate>
          {errors.root ?
            <p
              role="alert"
              className="bg-destructive/10 text-destructive mt-4 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
              {errors.root.message}
            </p>
          : null}
          <DialogFooter className="mt-5">
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}>
              {isSubmitting ?
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Unbanning
                </>
              : "Unban user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UnbanUserDialog;
