"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/shadcnui/alert";
import { Badge } from "@/components/shadcnui/badge";
import { Button } from "@/components/shadcnui/button";
import { Card, CardContent } from "@/components/shadcnui/card";
import { Field, FieldError, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcnui/table";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { attendanceMarkSchema, type attendanceMarkType } from "@/lib/zodSchema";
import {
  getAttendanceDay,
  markAttendanceDay,
  requestAttendanceException,
  requestBackdateReopen,
} from "@/server/academics/attendanceActions";

export type AttendanceGridRow = {
  note: string;
  rollNo: string;
  status: string;
  studentId: string;
  studentName: string;
};

type AttendanceGridProps = {
  classId: string;
  date: string;
  holidayLabel: string | null;
  initialRows: AttendanceGridRow[];
  sectionId: string;
  yearId: string;
};

const gridSchema = z.object({
  rows: z
    .array(
      z
        .object({
          note: z.string().trim().max(500, {
            error: "Note is too long",
          }),
          status: z.string().trim(),
          studentId: z.string().min(1, { error: "Pick a student" }),
        })
        .superRefine((row, ctx) => {
          if (
            row.status !== "PRESENT" &&
            row.status !== "ABSENT" &&
            row.status !== "LATE" &&
            row.status !== "EXCUSED"
          ) {
            ctx.addIssue({
              code: "custom",
              message: "Pick a valid status",
              path: ["status"],
            });
          }
          if (row.status === "EXCUSED" && row.note.trim() === "") {
            ctx.addIssue({
              code: "custom",
              message: "Add a note for excused absence",
              path: ["note"],
            });
          }
        }),
    )
    .min(1, { error: "Add at least one student" })
    .max(300, { error: "Too many rows" }),
});

type GridFormValues = z.infer<typeof gridSchema>;

const backdateSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, { error: "Enter a reason for the backdate request." })
    .max(500, { error: "Reason is too long" }),
});

type BackdateFormValues = z.infer<typeof backdateSchema>;

const exceptionFormSchema = z.object({
  denominator: z
    .string()
    .trim()
    .min(1, { error: "Enter working days" })
    .max(10, { error: "Denominator is too long" }),
  examTerm: z
    .string()
    .trim()
    .min(1, { error: "Enter an exam term" })
    .max(80, { error: "Exam term is too long" }),
  rateHundredths: z
    .string()
    .trim()
    .min(1, { error: "Enter a rate" })
    .max(10, { error: "Rate is too long" }),
  reason: z
    .string()
    .trim()
    .min(1, { error: "Enter a reason" })
    .max(500, { error: "Reason is too long" }),
  studentId: z.string().min(1, { error: "Pick a student" }),
});

type ExceptionFormValues = z.infer<typeof exceptionFormSchema>;

const statusOptions = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

const toDayDiff = (target: string): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(`${target}T00:00:00`);
  if (Number.isNaN(targetDate.getTime())) return 0;
  targetDate.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - targetDate.getTime()) / 86400000);
};

const AttendanceGrid = ({
  classId,
  date,
  holidayLabel,
  initialRows,
  sectionId,
  yearId,
}: AttendanceGridProps) => {
  const router = useRouter();
  const [rootError, setRootError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [backdateMessage, setBackdateMessage] = useState<string | null>(null);
  const [exceptionMessage, setExceptionMessage] = useState<string | null>(null);

  const diff = useMemo(() => toDayDiff(date), [date]);
  const isBackdate = diff > 7;

  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<GridFormValues>({
    defaultValues: {
      rows: initialRows.map((row) => ({
        note: row.note ?? "",
        status: row.status || "",
        studentId: row.studentId,
      })),
    },
    mode: "all",
    resolver: zodResolver(gridSchema),
  });
  const { fields } = useFieldArray({ control, name: "rows" });

  const {
    control: backdateControl,
    handleSubmit: handleBackdateSubmit,
    reset: resetBackdate,
    formState: {
      errors: backdateErrors,
      isDirty: backdateDirty,
      isSubmitting: backdateSubmitting,
    },
  } = useForm<BackdateFormValues>({
    defaultValues: { reason: "" },
    mode: "all",
    resolver: zodResolver(backdateSchema),
  });

  const {
    control: exceptionControl,
    handleSubmit: handleExceptionSubmit,
    formState: {
      errors: exceptionErrors,
      isDirty: exceptionDirty,
      isSubmitting: exceptionSubmitting,
    },
  } = useForm<ExceptionFormValues>({
    defaultValues: {
      denominator: "",
      examTerm: "",
      rateHundredths: "",
      reason: "",
      studentId: initialRows[0]?.studentId ?? "",
    },
    mode: "all",
    resolver: zodResolver(exceptionFormSchema),
  });

  const markAllPresent = () => {
    const current = getValues("rows");
    current.forEach((_, index) => {
      setValue(`rows.${index}.status`, "PRESENT", { shouldDirty: true });
    });
  };

  const reloadDay = async () => {
    const result = await getAttendanceDay({
      classId,
      date,
      sectionId,
      yearId,
    });
    if (result.ok) {
      router.refresh();
    }
  };

  const onSubmit = async (values: GridFormValues) => {
    setRootError(null);
    setSaved(false);
    const payload: attendanceMarkType = {
      classId,
      date,
      rows: values.rows.map((row) => ({
        note: row.note.trim() === "" ? null : row.note.trim(),
        status: row.status as "PRESENT" | "ABSENT" | "LATE" | "EXCUSED",
        studentId: row.studentId,
      })),
      sectionId,
      yearId,
    };
    const parsed = attendanceMarkSchema.safeParse(payload);
    if (!parsed.success) {
      setRootError("Check each row. Excused needs a note.");
      return;
    }
    const result = await withMinimumLoad(markAttendanceDay(parsed.data));
    if (!result.ok) {
      setRootError(
        result.errors.date ??
          result.errors.root ??
          "Could not save attendance.",
      );
      return;
    }
    setSaved(true);
    await reloadDay();
  };

  const onRequestBackdate = async (values: BackdateFormValues) => {
    setBackdateMessage(null);
    const result = await withMinimumLoad(
      requestBackdateReopen({
        classId,
        date,
        reason: values.reason.trim(),
        sectionId,
        yearId,
      }),
    );
    if (!result.ok) {
      setBackdateMessage(
        result.errors.reason ?? result.errors.date ?? "Request failed.",
      );
      return;
    }
    setBackdateMessage("Backdate request sent for approval.");
    resetBackdate({ reason: "" });
  };

  const onRequestException = async (values: ExceptionFormValues) => {
    setExceptionMessage(null);
    const denominator = Number(values.denominator.trim());
    const rate = Number(values.rateHundredths.trim());
    const result = await withMinimumLoad(
      requestAttendanceException({
        classId,
        denominator: Number.isFinite(denominator) ? Math.trunc(denominator) : 0,
        examTerm: values.examTerm.trim(),
        rateHundredths: Number.isFinite(rate) ? Math.trunc(rate) : 0,
        reason: values.reason.trim(),
        studentId: values.studentId,
        yearId,
      }),
    );
    if (!result.ok) {
      setExceptionMessage(result.errors.root ?? "Request failed.");
      return;
    }
    setExceptionMessage(
      "Shortage exception sent. Vice Principal recommended, Principal decides.",
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {holidayLabel ?
        <Alert>
          <AlertDescription>
            {`This date is marked ${holidayLabel}. Attendance is blocked on holidays and exam breaks.`}
          </AlertDescription>
        </Alert>
      : null}
      {isBackdate ?
        <Card>
          <CardContent className="flex-col gap-3">
            <p className="text-sm font-medium">
              This date is more than 7 days ago. Direct save is blocked.
            </p>
            <form
              onSubmit={handleBackdateSubmit(onRequestBackdate)}
              noValidate
              className="flex flex-col gap-3">
              <Controller
                name="reason"
                control={backdateControl}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>
                      Backdate reason
                    </FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      autoComplete="off"
                      placeholder="Reason for reopen approval"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              {backdateErrors.root ?
                <p
                  role="alert"
                  className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                  {backdateErrors.root.message}
                </p>
              : null}
              {backdateMessage ?
                <p className="text-muted-foreground text-sm">
                  {backdateMessage}
                </p>
              : null}
              <Button
                type="submit"
                disabled={!backdateDirty || backdateSubmitting}
                variant="outline"
                className="w-fit">
                {backdateSubmitting ?
                  <>
                    <Loader2Icon
                      aria-hidden="true"
                      className="animate-spin"
                    />
                    Sending
                  </>
                : "Request backdate reopen"}
              </Button>
            </form>
          </CardContent>
        </Card>
      : null}
      <Card>
        <CardContent className="flex-row flex-wrap items-center gap-3">
          <Badge
            variant="secondary"
            className="w-fit whitespace-nowrap">
            {`${initialRows.length} students`}
          </Badge>
          <Badge
            variant="secondary"
            className="w-fit whitespace-nowrap">
            {date}
          </Badge>
          <Button
            onClick={markAllPresent}
            type="button"
            variant="outline"
            size="sm">
            Mark all present
          </Button>
        </CardContent>
      </Card>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate>
        <div className="overflow-hidden rounded-xl border">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Roll</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.length === 0 ?
                <TableRow>
                  <TableCell colSpan={4}>
                    No enrolled students in this section.
                  </TableCell>
                </TableRow>
              : fields.map((field, index) => {
                  const meta = initialRows[index];
                  return (
                    <TableRow key={field.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {meta?.rollNo ?? ""}
                      </TableCell>
                      <TableCell>{meta?.studentName ?? ""}</TableCell>
                      <TableCell>
                        <Controller
                          name={`rows.${index}.status`}
                          control={control}
                          render={({ field: statusField, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                              <NativeSelect
                                id={`attendance-status-${meta?.studentId ?? index}`}
                                value={statusField.value}
                                onChange={statusField.onChange}
                                onBlur={statusField.onBlur}
                                aria-invalid={fieldState.invalid}>
                                <NativeSelectOption value="">
                                  Pick status
                                </NativeSelectOption>
                                {statusOptions.map((option) => (
                                  <NativeSelectOption
                                    key={option}
                                    value={option}>
                                    {option}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                              <FieldError errors={[fieldState.error]} />
                            </Field>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`rows.${index}.note`}
                          control={control}
                          render={({ field: noteField, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                              <Input
                                {...noteField}
                                id={`attendance-note-${meta?.studentId ?? index}`}
                                autoComplete="off"
                                placeholder="Required when excused"
                                aria-invalid={fieldState.invalid}
                              />
                              <FieldError errors={[fieldState.error]} />
                            </Field>
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              }
            </TableBody>
          </Table>
        </div>
        {errors.root ?
          <p
            role="alert"
            className="bg-destructive/10 text-destructive mt-4 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
            {errors.root.message}
          </p>
        : null}
        {rootError ?
          <p
            role="alert"
            className="bg-destructive/10 text-destructive mt-4 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
            {rootError}
          </p>
        : null}
        {saved ?
          <p className="mt-4 rounded-lg border px-3.5 py-2.5 text-sm">
            Day saved. Rates use working days only.
          </p>
        : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={!isDirty || isSubmitting || initialRows.length === 0}>
            {isSubmitting ?
              <>
                <Loader2Icon
                  aria-hidden="true"
                  className="animate-spin"
                />
                Saving
              </>
            : "Save day"}
          </Button>
        </div>
      </form>
      <Card>
        <CardContent className="flex-col gap-3">
          <p className="text-sm font-medium">
            Shortage exception. Vice Principal recommends, Principal decides.
          </p>
          <form
            onSubmit={handleExceptionSubmit(onRequestException)}
            noValidate
            className="flex flex-col gap-3">
            <Controller
              name="studentId"
              control={exceptionControl}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Student</FieldLabel>
                  <NativeSelect
                    id={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={fieldState.invalid}>
                    {initialRows.map((row) => (
                      <NativeSelectOption
                        key={row.studentId}
                        value={row.studentId}>
                        {`${row.studentName} (${row.rollNo})`}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Controller
                name="examTerm"
                control={exceptionControl}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Exam term</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      autoComplete="off"
                      placeholder="Half yearly"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="rateHundredths"
                control={exceptionControl}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>
                      Rate hundredths
                    </FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      autoComplete="off"
                      inputMode="numeric"
                      placeholder="7200 for 72 percent"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="denominator"
                control={exceptionControl}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Denominator</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      autoComplete="off"
                      inputMode="numeric"
                      placeholder="Working days"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            <Controller
              name="reason"
              control={exceptionControl}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Reason</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    autoComplete="off"
                    placeholder="Medical or approved cause"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            {exceptionErrors.root ?
              <p
                role="alert"
                className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                {exceptionErrors.root.message}
              </p>
            : null}
            {exceptionMessage ?
              <p className="text-muted-foreground text-sm">
                {exceptionMessage}
              </p>
            : null}
            <Button
              type="submit"
              disabled={!exceptionDirty || exceptionSubmitting}
              variant="outline"
              className="w-fit">
              {exceptionSubmitting ?
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Sending
                </>
              : "Request exception"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AttendanceGrid;
