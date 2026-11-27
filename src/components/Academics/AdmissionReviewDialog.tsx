"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, CopyIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";

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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import {
  approvalDecisionSchema,
  type approvalDecisionType,
} from "@/lib/zodSchema";
import {
  applyAdmissionApproval,
  decideAdmissionApproval,
} from "@/server/academics/approvalActions";

export type AdmissionApprovalSummary = {
  admissionNo: string;
  canReview: boolean;
  className: string;
  duplicateContact: boolean;
  id: string;
  isRedacted: boolean;
  status: string;
  studentName: string;
  wardFlag: boolean;
  yearName: string;
};

type AdmissionReviewDialogProps = {
  approval: AdmissionApprovalSummary;
};

type InviteInfo = {
  admissionNo: string;
  classOrder: number;
  eligible: boolean;
  parentEmail: string | null;
  parentUserId: string | null;
  studentCreated: boolean;
  studentEmail: string | null;
  studentId: string;
  studentUserId: string | null;
  studentUsername: string | null;
};

const buildInviteText = (invite: InviteInfo): string => {
  const lines = [
    `Admission ${invite.admissionNo}`,
    invite.eligible ?
      `Student login: ${invite.studentEmail ?? "pending"} (${invite.studentUsername ?? "pending"})`
    : "Student login: not created for Nursery to Class 5",
    `Parent login: ${invite.parentEmail ?? "no email on file"}`,
    "Passwords are set through reset. This panel shows once.",
  ];
  return lines.join("\n");
};

const AdmissionReviewDialog = ({ approval }: AdmissionReviewDialogProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<approvalDecisionType>({
    defaultValues: {
      decision: "" as unknown as approvalDecisionType["decision"],
      id: approval.id,
      reason: "",
    },
    mode: "all",
    resolver: zodResolver(approvalDecisionSchema),
  });

  useEffect(() => {
    if (open) {
      reset({
        decision: "" as unknown as approvalDecisionType["decision"],
        id: approval.id,
        reason: "",
      });
    }
  }, [open, approval.id, reset]);

  const openReview = () => {
    setInvite(null);
    setCopied(false);
    setShared(false);
    setOpen(true);
  };

  const close = (next: boolean) => {
    if (!next) {
      setInvite(null);
      setCopied(false);
      setShared(false);
    }
    setOpen(next);
  };

  const handleCopy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(buildInviteText(invite));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleDone = () => {
    setInvite(null);
    setCopied(false);
    setShared(false);
    setOpen(false);
    router.refresh();
  };

  const onSubmit = async (values: approvalDecisionType) => {
    const decideResult = await withMinimumLoad(decideAdmissionApproval(values));
    if (!decideResult.ok) {
      if (decideResult.errors.root) {
        setError("root", { message: decideResult.errors.root });
      }
      if (decideResult.errors.reason) {
        setError("reason", { message: decideResult.errors.reason });
      }
      return;
    }
    if (decideResult.status === "REJECTED") {
      close(false);
      router.refresh();
      return;
    }
    const applyResult = await withMinimumLoad(
      applyAdmissionApproval({ id: values.id }),
    );
    if (!applyResult.ok) {
      if (applyResult.errors.root) {
        setError("root", { message: applyResult.errors.root });
      }
      return;
    }
    setInvite(applyResult.invite);
    setCopied(false);
    setShared(false);
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `Admission invite (dev stub): ${applyResult.invite.admissionNo} student ${applyResult.invite.studentEmail ?? "no login"} parent ${applyResult.invite.parentEmail ?? "no email"}`,
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}>
      <Button
        disabled={!approval.canReview || approval.status !== "PENDING"}
        onClick={openReview}
        size="sm"
        type="button"
        variant="outline"
        title={
          !approval.canReview ? "Principal approval only"
          : approval.status !== "PENDING" ?
            "This request is no longer pending"
          : "Review this admission"
        }>
        Review
      </Button>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
        {invite === null ?
          <>
            <DialogHeader>
              <DialogTitle>Review admission {approval.admissionNo}</DialogTitle>
              <DialogDescription>
                {approval.isRedacted ?
                  "Redacted view. IDs and flags only."
                : `${approval.studentName} for ${approval.className} in ${approval.yearName}. Class 6 and above gets a student login.`
                }
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-1 gap-2 rounded-md border px-3.5 py-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs">Ward flag</dt>
                <dd className="font-medium">
                  {approval.wardFlag ? "Yes" : "No"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  Duplicate contact
                </dt>
                <dd className="font-medium">
                  {approval.duplicateContact ? "Yes" : "No"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Status</dt>
                <dd className="font-medium">{approval.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Class gate</dt>
                <dd className="font-medium">Class 6 and above gets login</dd>
              </div>
            </dl>
            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate>
              <FieldGroup>
                <Controller
                  name="decision"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Decision</FieldLabel>
                      <NativeSelect
                        id={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}>
                        <NativeSelectOption value="">
                          Pick a decision
                        </NativeSelectOption>
                        <NativeSelectOption value="APPROVE">
                          Approve and provision
                        </NativeSelectOption>
                        <NativeSelectOption value="REJECT">
                          Reject with reason
                        </NativeSelectOption>
                      </NativeSelect>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                <Controller
                  name="reason"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>
                        Reason for reject
                      </FieldLabel>
                      <Input
                        {...field}
                        id={field.name}
                        type="text"
                        autoComplete="off"
                        placeholder="Required when rejecting"
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
                      Reviewing
                    </>
                  : "Submit review"}
                </Button>
              </DialogFooter>
            </form>
          </>
        : <>
            <DialogHeader>
              <DialogTitle>Share these details once</DialogTitle>
              <DialogDescription>
                Admission {invite.admissionNo} is active. This panel clears on
                Done and never shows again.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted flex items-center justify-between gap-3 rounded-md px-3.5 py-3">
              <code className="text-sm font-semibold break-all">
                {buildInviteText(invite)}
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
                <dt className="text-muted-foreground text-xs">Student login</dt>
                <dd className="font-medium break-all">
                  {invite.eligible ?
                    (invite.studentEmail ?? "Pending")
                  : "Not created for Nursery to Class 5"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Username</dt>
                <dd className="font-medium break-all">
                  {invite.studentUsername ?? "None"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Parent login</dt>
                <dd className="font-medium break-all">
                  {invite.parentEmail ?? "No email on file"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Provisioned</dt>
                <dd className="font-medium">
                  {invite.studentCreated ?
                    "New student login"
                  : "Linked existing"}
                </dd>
              </div>
            </dl>
            <Field
              orientation="horizontal"
              className="w-auto">
              <Checkbox
                id="admission-share-confirm"
                checked={shared}
                onCheckedChange={(checked) => setShared(checked === true)}
              />
              <FieldLabel htmlFor="admission-share-confirm">
                I have shared these details securely
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

export default AdmissionReviewDialog;
