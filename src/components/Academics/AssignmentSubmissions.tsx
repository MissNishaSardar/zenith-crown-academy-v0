"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/shadcnui/button";
import { Badge } from "@/components/shadcnui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcnui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import {
  assignmentGradeSchema,
  type assignmentGradeType,
} from "@/lib/zodSchema";
import {
  gradeAssignmentSubmission,
  submitAssignmentWork,
} from "@/server/academics/assignmentActions";

export type SubmissionView = {
  feedback: string | null;
  filePath: string | null;
  gradeLabel: string | null;
  hasFile: boolean;
  id: string;
  status: string;
  studentId: string;
  studentName: string;
  text: string | null;
};

type AssignmentSubmissionsProps = {
  assignmentId: string;
  canGrade: boolean;
  canSubmit: boolean;
  status: string;
  submissions: SubmissionView[];
  submitOptions: { studentId: string; studentName: string }[];
};

const submitTextSchema = z.object({
  text: z.string().trim().max(2000).nullable().optional(),
});

type SubmitTextType = z.infer<typeof submitTextSchema>;

const SubmissionGradeForm = ({
  submission,
}: {
  submission: SubmissionView;
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<assignmentGradeType>({
    defaultValues: {
      feedback: submission.feedback ?? "",
      gradeLabel: submission.gradeLabel ?? "",
      submissionId: submission.id,
    },
    mode: "all",
    resolver: zodResolver(assignmentGradeSchema),
  });

  const onSubmit = async (values: assignmentGradeType) => {
    const result = await withMinimumLoad(gradeAssignmentSubmission(values));
    if (!result.ok) {
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      for (const [field, message] of Object.entries(result.errors)) {
        if (field === "root" || !message) continue;
        setError(field as keyof assignmentGradeType, { message });
      }
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button
        onClick={() => {
          reset({
            feedback: submission.feedback ?? "",
            gradeLabel: submission.gradeLabel ?? "",
            submissionId: submission.id,
          });
          setOpen(true);
        }}
        size="sm"
        type="button"
        variant="outline">
        Grade
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{`Grade ${submission.studentName}`}</DialogTitle>
            <DialogDescription>
              Optional grade label, no numeric marks. Feedback is shared with
              the student.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-4">
            <Controller
              name="gradeLabel"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Grade label</FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id={field.name}
                    autoComplete="off"
                    placeholder="A, Excellent, Needs work"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="feedback"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Feedback</FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id={field.name}
                    autoComplete="off"
                    placeholder="What went well, what to fix"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            {errors.root ?
              <p
                role="alert"
                className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                {errors.root.message}
              </p>
            : null}
            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
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
                : "Save grade"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

const AssignmentSubmitForm = ({
  assignmentId,
  submitOptions,
}: {
  assignmentId: string;
  submitOptions: { studentId: string; studentName: string }[];
}) => {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [studentId, setStudentId] = useState(submitOptions[0]?.studentId ?? "");
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SubmitTextType>({
    defaultValues: { text: "" },
    mode: "all",
    resolver: zodResolver(submitTextSchema),
  });

  const onSubmit = async (values: SubmitTextType) => {
    if (!studentId) {
      setError("root", { message: "Pick a student." });
      return;
    }
    const formData = new FormData();
    formData.append("assignmentId", assignmentId);
    formData.append("studentId", studentId);
    formData.append("text", values.text ?? "");
    if (selectedFile) {
      formData.append("file", selectedFile);
    }
    const result = await withMinimumLoad(submitAssignmentWork(formData));
    if (!result.ok) {
      if (result.errors.root) {
        setError("root", { message: result.errors.root });
      }
      if (result.errors.text) {
        setError("text", { message: result.errors.text });
      }
      if (result.errors.file) {
        setError("root", { message: result.errors.file });
      }
      return;
    }
    reset({ text: "" });
    setSelectedFile(null);
    router.refresh();
  };

  if (submitOptions.length === 0) return null;

  const dirty = isDirty || selectedFile !== null;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-3 rounded-xl border px-4 py-3">
      <p className="text-sm font-semibold">Submit work</p>
      {submitOptions.length > 1 ?
        <Field>
          <FieldLabel htmlFor={`submit-student-${assignmentId}`}>
            Student
          </FieldLabel>
          <NativeSelect
            id={`submit-student-${assignmentId}`}
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}>
            {submitOptions.map((option) => (
              <NativeSelectOption
                key={option.studentId}
                value={option.studentId}>
                {option.studentName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      : null}
      <Controller
        name="text"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>Answer text</FieldLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              id={field.name}
              autoComplete="off"
              placeholder="Type your answer or leave blank with a file"
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Field>
        <FieldLabel htmlFor={`submit-file-${assignmentId}`}>
          File, PDF image or document up to 5 MB
        </FieldLabel>
        <Input
          id={`submit-file-${assignmentId}`}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt,.csv"
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
        />
      </Field>
      {errors.root ?
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
          {errors.root.message}
        </p>
      : null}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!dirty || isSubmitting}
          size="sm">
          {isSubmitting ?
            <>
              <Loader2Icon
                aria-hidden="true"
                className="animate-spin"
              />
              Submitting
            </>
          : "Submit"}
        </Button>
      </div>
    </form>
  );
};

const AssignmentSubmissions = ({
  assignmentId,
  canGrade,
  canSubmit,
  status,
  submissions,
  submitOptions,
}: AssignmentSubmissionsProps) => {
  const openForSubmit = status === "PUBLISHED";

  return (
    <div className="flex flex-col gap-3 py-1">
      {submissions.length === 0 ?
        <p className="text-muted-foreground text-sm">No submissions yet.</p>
      : <ul className="flex flex-col gap-2">
          {submissions.map((submission) => (
            <li
              key={submission.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="font-medium">{submission.studentName}</span>
              <Badge variant="secondary">{submission.status}</Badge>
              {submission.gradeLabel ?
                <span className="text-muted-foreground">
                  {submission.gradeLabel}
                </span>
              : null}
              {submission.text ?
                <span className="text-muted-foreground line-clamp-1 flex-1">
                  {submission.text}
                </span>
              : null}
              {submission.hasFile && submission.filePath ?
                <a
                  href={`/api/files/${submission.filePath}`}
                  className="underline">
                  Download
                </a>
              : null}
              {submission.feedback ?
                <span className="text-muted-foreground line-clamp-1 w-full">
                  {`Feedback: ${submission.feedback}`}
                </span>
              : null}
              {canGrade ?
                <SubmissionGradeForm submission={submission} />
              : null}
            </li>
          ))}
        </ul>
      }
      {canSubmit && openForSubmit ?
        <AssignmentSubmitForm
          assignmentId={assignmentId}
          submitOptions={submitOptions}
        />
      : null}
      {!openForSubmit ?
        <p className="text-muted-foreground text-sm">
          This assignment is not open for submission.
        </p>
      : null}
    </div>
  );
};

export default AssignmentSubmissions;
