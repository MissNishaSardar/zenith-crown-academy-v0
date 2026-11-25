"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  Eye,
  EyeOff,
  Loader2Icon,
  PrinterIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/shadcnui/button";
import { Checkbox } from "@/components/shadcnui/checkbox";
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { generatePassword } from "@/lib/auth/passwordGenerator";
import {
  buildCredentialFilename,
  buildCredentialText,
} from "@/lib/admin/credentialHandout";
import { parseRoleNames, roleLabels } from "@/lib/auth/permissions";
import {
  assignableRoleNames,
  createUserSchema,
  type createUserType,
} from "@/lib/zodSchema";

import { createUser, getUsernameSuggestions } from "@/server/admin/userActions";

type CreateUserDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const CreateUserDialog = ({ onOpenChange, open }: CreateUserDialogProps) => {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState("");
  const [createdUsername, setCreatedUsername] = useState("");
  const [createdEmail, setCreatedEmail] = useState("");
  const [createdRole, setCreatedRole] = useState("");
  const [createdIssuedAt, setCreatedIssuedAt] = useState("");
  const [createdLoginUrl, setCreatedLoginUrl] = useState("/login");
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<createUserType>({
    defaultValues: {
      email: "",
      name: "",
      password: "",
      role: "student",
      username: "",
    },
    mode: "all",
    resolver: zodResolver(createUserSchema),
  });

  const nameValue = useWatch({ control, name: "name" });

  useEffect(() => {
    const clean = nameValue.trim();
    if (createdPassword !== null || clean.length < 2) {
      return;
    }
    const timer = setTimeout(() => {
      void getUsernameSuggestions(clean).then((result) => {
        setSuggestions(result.suggestions);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [createdPassword, nameValue]);

  const close = (next: boolean) => {
    if (!next) {
      reset();
      setCopied(false);
      setCreatedName("");
      setCreatedUsername("");
      setCreatedEmail("");
      setCreatedRole("");
      setCreatedIssuedAt("");
      setCreatedLoginUrl("/login");
      setCreatedPassword(null);
      setDownloading(false);
      setPrinting(false);
      setShared(false);
      setShowPassword(false);
      setSuggestions([]);
    }
    onOpenChange(next);
  };

  const onSubmit = async (values: createUserType) => {
    const result = await withMinimumLoad(createUser(values));
    if (!result.ok) {
      if (result.errors.username) {
        setError("username", { message: result.errors.username });
      }
      if (result.errors.email) {
        setError("email", { message: result.errors.email });
      }
      if (result.errors.role) {
        setError("role", { message: result.errors.role });
      }
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      if (result.suggestions.length > 0) {
        setSuggestions(result.suggestions);
      }
      return;
    }
    setCreatedName(result.user.name);
    setCreatedUsername(result.user.username);
    setCreatedEmail(result.user.email);
    setCreatedRole(result.user.role);
    setCreatedIssuedAt(new Date().toLocaleString());
    setCreatedLoginUrl(`${window.location.origin}/login`);
    setCreatedPassword(values.password);
    reset();
    setSuggestions([]);
  };

  const handleCopy = async () => {
    if (!createdPassword) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createdPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const displayRole =
    parseRoleNames(createdRole)
      .map((role) => roleLabels[role])
      .join(", ") || createdRole;

  const buildHandout = () => ({
    email: createdEmail,
    issuedAt: createdIssuedAt,
    loginUrl: createdLoginUrl,
    name: createdName,
    password: createdPassword ?? "",
    roleLabel: displayRole,
    username: createdUsername,
  });

  const handleDownload = async () => {
    if (!createdPassword || downloading) {
      return;
    }
    setDownloading(true);
    try {
      await withMinimumLoad(
        Promise.resolve().then(() => {
          const handout = buildHandout();
          const text = buildCredentialText(handout);
          const blob = new Blob([text], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = buildCredentialFilename(createdUsername);
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }),
      );
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    if (!createdPassword || printing) {
      return;
    }
    setPrinting(true);
    try {
      await withMinimumLoad(Promise.resolve());
      window.print();
    } finally {
      setPrinting(false);
    }
  };

  const handleDone = () => {
    setCreatedPassword(null);
    setCreatedName("");
    setCreatedUsername("");
    setCreatedEmail("");
    setCreatedRole("");
    setCreatedIssuedAt("");
    setCreatedLoginUrl("/login");
    setCopied(false);
    setDownloading(false);
    setPrinting(false);
    setShared(false);
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
        {createdPassword === null ?
          <>
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
              <DialogDescription>
                Pick roles. First checked is primary. The password shows once
                after creation.
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
                                setValue("username", suggestion, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
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
                      <FieldLabel htmlFor={field.name}>
                        Email address
                      </FieldLabel>
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
                <Controller
                  name="role"
                  control={control}
                  render={({ field, fieldState }) => {
                    type AssignableRole = (typeof assignableRoleNames)[number];
                    const selected = (
                      Array.isArray(field.value) ?
                        field.value
                      : [field.value]).filter((role): role is AssignableRole =>
                      (assignableRoleNames as readonly string[]).includes(role),
                    );
                    const toggle = (
                      roleName: AssignableRole,
                      checked: boolean,
                    ) => {
                      if (checked) {
                        if (!selected.includes(roleName)) {
                          field.onChange([...selected, roleName]);
                        }
                        return;
                      }
                      if (selected.length <= 1) {
                        return;
                      }
                      field.onChange(
                        selected.filter((role) => role !== roleName),
                      );
                    };
                    return (
                      <FieldSet>
                        <FieldLegend>Roles</FieldLegend>
                        <FieldDescription>
                          Allowed pairs: Parent with Teacher, Office staff,
                          Librarian, Accountant. Teacher with Principal, Vice
                          principal.
                        </FieldDescription>
                        <div className="flex flex-col gap-2">
                          {assignableRoleNames.map((role) => (
                            <Field
                              key={role}
                              orientation="horizontal"
                              className="w-auto">
                              <Checkbox
                                id={`create-role-${role}`}
                                checked={selected.includes(role)}
                                onCheckedChange={(checked) =>
                                  toggle(role, checked === true)
                                }
                                disabled={
                                  selected.length === 1 &&
                                  selected.includes(role)
                                }
                              />
                              <FieldLabel htmlFor={`create-role-${role}`}>
                                {roleLabels[role]}
                              </FieldLabel>
                            </Field>
                          ))}
                        </div>
                        <FieldError errors={[fieldState.error]} />
                      </FieldSet>
                    );
                  }}
                />
                <Controller
                  name="password"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                      <div className="relative">
                        <Input
                          {...field}
                          id={field.name}
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="Generated or typed, 12 characters"
                          aria-invalid={fieldState.invalid}
                          className="pr-9"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          onClick={() => setShowPassword((v) => !v)}
                          className="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2">
                          {showPassword ?
                            <EyeOff aria-hidden="true" />
                          : <Eye aria-hidden="true" />}
                        </Button>
                      </div>
                      <div>
                        <Button
                          onClick={() => {
                            setValue("password", generatePassword(), {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }}
                          size="sm"
                          type="button"
                          variant="outline">
                          <RefreshCwIcon aria-hidden="true" />
                          Generate password
                        </Button>
                      </div>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              </FieldGroup>
              {errors.root ?
                <p
                  role="alert"
                  className="text-destructive bg-destructive/10 mt-4 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                  {errors.root.message}
                </p>
              : null}
              <DialogFooter className="mt-5">
                <Button
                  onClick={() => close(false)}
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
                      Creating
                    </>
                  : "Create user"}
                </Button>
              </DialogFooter>
            </form>
          </>
        : <>
            <DialogHeader>
              <DialogTitle>Share this password once</DialogTitle>
              <DialogDescription>
                {createdName} signs in with this password. It never shows again
                after this dialog closes.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted flex items-center justify-between gap-3 rounded-md px-3.5 py-3">
              <code className="text-sm font-semibold break-all">
                {createdPassword}
              </code>
              <Button
                onClick={handleCopy}
                size="sm"
                type="button"
                variant="outline">
                {copied ?
                  <>
                    <CheckIcon aria-hidden="true" />
                    Copied
                  </>
                : <>
                    <CopyIcon aria-hidden="true" />
                    Copy
                  </>
                }
              </Button>
            </div>
            <dl className="grid grid-cols-1 gap-2 rounded-md border px-3.5 py-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs">Name</dt>
                <dd className="font-medium break-all">{createdName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Username</dt>
                <dd className="font-medium break-all">{createdUsername}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Email</dt>
                <dd className="font-medium break-all">{createdEmail}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Role</dt>
                <dd className="font-medium break-all">{displayRole}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleDownload}
                size="sm"
                type="button"
                variant="outline"
                disabled={downloading || printing}>
                {downloading ?
                  <>
                    <Loader2Icon
                      aria-hidden="true"
                      className="animate-spin"
                    />
                    Preparing
                  </>
                : <>
                    <DownloadIcon aria-hidden="true" />
                    Download
                  </>
                }
              </Button>
              <Button
                onClick={handlePrint}
                size="sm"
                type="button"
                variant="outline"
                disabled={printing || downloading}>
                {printing ?
                  <>
                    <Loader2Icon
                      aria-hidden="true"
                      className="animate-spin"
                    />
                    Preparing
                  </>
                : <>
                    <PrinterIcon aria-hidden="true" />
                    Print slip
                  </>
                }
              </Button>
            </div>
            <style>{`@media print {
  body * { visibility: hidden; }
  #credential-print-slip, #credential-print-slip * { visibility: visible; }
  #credential-print-slip { display: block; position: absolute; left: 0; top: 0; width: 100%; }
}`}</style>
            <div
              id="credential-print-slip"
              className="hidden bg-white p-6 text-black print:block">
              <h2>Zenith Crown Academy - New account details</h2>
              <p>Name: {createdName}</p>
              <p>Username: {createdUsername}</p>
              <p>Email: {createdEmail}</p>
              <p>Role: {displayRole}</p>
              <p>Temporary password: {createdPassword}</p>
              <p>Sign in: {createdLoginUrl}</p>
              <p>Issued: {createdIssuedAt}</p>
              <p>Sign in with the username and temporary password.</p>
              <p>Change the password after first sign in.</p>
            </div>
            <Field
              orientation="horizontal"
              className="w-auto">
              <Checkbox
                id="share-confirm"
                checked={shared}
                onCheckedChange={(checked) => setShared(checked === true)}
              />
              <FieldLabel htmlFor="share-confirm">
                I have shared this password securely
              </FieldLabel>
            </Field>
            <DialogFooter className="mt-2">
              <Button
                onClick={handleDone}
                type="button"
                disabled={!shared}>
                Done
              </Button>
            </DialogFooter>
          </>
        }
      </DialogContent>
    </Dialog>
  );
};

export default CreateUserDialog;
