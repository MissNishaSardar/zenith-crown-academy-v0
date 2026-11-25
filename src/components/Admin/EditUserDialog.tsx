"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/shadcnui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcnui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { updateUserSchema, type updateUserType } from "@/lib/zodSchema";
import type { UsersRow } from "./UsersColumns";

import {
  getUsernameSuggestionsForEdit,
  updateUser,
} from "@/server/admin/userActions";

type EditUserDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: UsersRow | null;
};

const EditUserDialog = ({ onOpenChange, open, user }: EditUserDialogProps) => {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<updateUserType>({
    defaultValues: {
      email: "",
      id: "",
      name: "",
      username: "",
    },
    mode: "all",
    resolver: zodResolver(updateUserSchema),
  });

  const nameValue = useWatch({ control, name: "name" });
  const userId = user?.id;
  const userEmail = user?.email;
  const userName = user?.name;
  const userUsername = user?.username;

  useEffect(() => {
    if (open && userId) {
      reset({
        email: userEmail ?? "",
        id: userId,
        name: userName ?? "",
        username: userUsername ?? "",
      });
    }
  }, [open, reset, userEmail, userId, userName, userUsername]);

  useEffect(() => {
    if (!open || !userId) {
      return;
    }
    const clean = nameValue.trim();
    if (clean.length < 2) {
      return;
    }
    const timer = setTimeout(() => {
      void getUsernameSuggestionsForEdit(clean, userId).then((result) => {
        setSuggestions(result.suggestions);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [nameValue, open, userId]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSuggestions([]);
    }
    onOpenChange(next);
  };

  const onSubmit = async (values: updateUserType) => {
    const result = await withMinimumLoad(updateUser(values));
    if (!result.ok) {
      if (result.errors.username) {
        setError("username", { message: result.errors.username });
      }
      if (result.errors.email) {
        setError("email", { message: result.errors.email });
      }
      if (result.errors.name) {
        setError("name", { message: result.errors.name });
      }
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      if (result.suggestions.length > 0) {
        setSuggestions(result.suggestions);
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
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            {user ? `Update identity for ${user.name}.` : "Update identity."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate>
          <FieldGroup>
            <Controller
              name="name"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Full name</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="text"
                    autoComplete="off"
                    placeholder="Amina Yusuf"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="username"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Username</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="text"
                    autoComplete="off"
                    placeholder="amina.yusuf"
                    aria-invalid={fieldState.invalid}
                  />
                  {suggestions.length > 0 ?
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((suggestion) => (
                        <Button
                          key={suggestion}
                          onClick={() => {
                            field.onChange(suggestion);
                          }}
                          size="sm"
                          type="button"
                          variant="outline">
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  : null}
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="email"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Email address</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="email"
                    autoComplete="off"
                    placeholder="amina@school.edu"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
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
              disabled={!isDirty || isSubmitting}>
              {isSubmitting ?
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Saving
                </>
              : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditUserDialog;
