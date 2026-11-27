"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/shadcnui/button";
import DatePickerField from "@/components/Layout/DatePickerField";
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
import LeaveQueueDataTable from "@/components/Academics/LeaveQueueDataTable";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import {
  leaveRequestSchema,
  staffAttendanceStatusNames,
} from "@/lib/zodSchema";
import {
  decideLeave,
  markStaffDay,
  requestLeave,
} from "@/server/academics/staffAttendanceActions";

export type LeaveRow = {
  createdAt: string;
  endDate: string;
  id: string;
  reason: string;
  startDate: string;
  status: string;
  target: string;
  targetName: string;
};

export type LeaveOption = {
  id: string;
  label: string;
};

type LeaveWorkspaceProps = {
  canDecide: boolean;
  canMarkStaff: boolean;
  dir: string;
  leaves: LeaveRow[];
  page: number;
  pageSize: number;
  sort: string;
  staffAttendance: {
    date: string;
    staffId: string;
    staffName: string;
    status: string;
  }[];
  staffDate: string;
  staffOptions: LeaveOption[];
  studentOptions: LeaveOption[];
  total: number;
  totalPages: number;
};

type LeaveForm = z.infer<typeof leaveRequestSchema>;

type StaffGridForm = {
  rows: {
    staffId: string;
    status: (typeof staffAttendanceStatusNames)[number];
  }[];
};

const staffGridSchema = z.object({
  rows: z
    .array(
      z.object({
        staffId: z.string().min(1, { error: "Pick a staff member" }),
        status: z.enum(staffAttendanceStatusNames, {
          error: "Pick a valid status",
        }),
      }),
    )
    .min(1, { error: "Add at least one staff member" })
    .max(300, { error: "Too many rows" }),
});

const LeaveWorkspace = ({
  canDecide,
  canMarkStaff,
  dir,
  leaves,
  page,
  pageSize,
  sort,
  staffAttendance,
  staffDate,
  staffOptions,
  studentOptions,
  total,
  totalPages,
}: LeaveWorkspaceProps) => {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<LeaveForm>({
    defaultValues: {
      endDate: staffDate,
      reason: "",
      staffId: staffOptions[0]?.id ?? "",
      startDate: staffDate,
      studentId: studentOptions[0]?.id ?? "",
      target: "STUDENT",
    },
    mode: "all",
    resolver: zodResolver(leaveRequestSchema),
  });
  const target = watch("target");

  const {
    control: staffControl,
    handleSubmit: handleStaffSubmit,
    formState: {
      errors: staffErrors,
      isDirty: staffDirty,
      isSubmitting: staffSubmitting,
    },
  } = useForm<StaffGridForm>({
    defaultValues: {
      rows: staffOptions.map((option) => {
        const existing = staffAttendance.find(
          (row) => row.staffId === option.id,
        );
        const status =
          (
            existing?.status === "LEAVE" ||
            existing?.status === "ON_DUTY" ||
            existing?.status === "PRESENT"
          ) ?
            existing.status
          : "PRESENT";
        return { staffId: option.id, status };
      }),
    },
    mode: "all",
    resolver: zodResolver(staffGridSchema),
  });

  const onRequestLeave = async (values: LeaveForm) => {
    setMessage(null);
    const result = await withMinimumLoad(
      requestLeave({
        endDate: values.endDate,
        reason: values.reason.trim(),
        staffId: values.target === "STAFF" ? (values.staffId ?? "") : null,
        startDate: values.startDate,
        studentId:
          values.target === "STUDENT" ? (values.studentId ?? "") : null,
        target: values.target,
      }),
    );
    if (!result.ok) {
      setMessage(result.errors.root ?? "Leave request failed.");
      return;
    }
    setMessage("Leave request sent.");
    router.refresh();
  };

  const onDecide = async (id: string, decision: "APPROVE" | "REJECT") => {
    setMessage(null);
    setActingId(id);
    try {
      const result = await withMinimumLoad(decideLeave({ decision, id }));
      if (!result.ok) {
        setMessage(
          result.errors.root ?? result.errors.reason ?? "Decision failed.",
        );
        return;
      }
      setMessage(
        decision === "APPROVE" ? "Leave approved." : "Leave rejected.",
      );
      router.refresh();
    } finally {
      setActingId(null);
    }
  };

  const onMarkStaff = async (values: StaffGridForm) => {
    setMessage(null);
    const result = await withMinimumLoad(
      markStaffDay({
        date: staffDate,
        rows: values.rows.map((row) => ({
          staffId: row.staffId,
          status: row.status,
        })),
      }),
    );
    if (!result.ok) {
      setMessage(result.errors.root ?? result.errors.date ?? "Save failed.");
      return;
    }
    setMessage(`Staff day saved for ${result.marked} records.`);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      {message ?
        <p className="rounded-lg border px-3.5 py-2.5 text-sm">{message}</p>
      : null}
      <Card>
        <CardContent className="flex-col gap-3">
          <p className="text-sm font-medium">Request leave</p>
          <form
            onSubmit={handleSubmit(onRequestLeave)}
            noValidate
            className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Controller
                name="target"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Target</FieldLabel>
                    <NativeSelect
                      id={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}>
                      <NativeSelectOption value="STUDENT">
                        Student
                      </NativeSelectOption>
                      <NativeSelectOption value="STAFF">
                        Staff
                      </NativeSelectOption>
                    </NativeSelect>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              {target === "STUDENT" ?
                <Controller
                  name="studentId"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Student</FieldLabel>
                      <NativeSelect
                        id={field.name}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}>
                        {studentOptions.map((option) => (
                          <NativeSelectOption
                            key={option.id}
                            value={option.id}>
                            {option.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              : <Controller
                  name="staffId"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Staff</FieldLabel>
                      <NativeSelect
                        id={field.name}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}>
                        {staffOptions.map((option) => (
                          <NativeSelectOption
                            key={option.id}
                            value={option.id}>
                            {option.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              }
              <Controller
                name="startDate"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Start</FieldLabel>
                    <DatePickerField
                      ariaInvalid={fieldState.invalid}
                      id={field.name}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      value={field.value ?? ""}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="endDate"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>End</FieldLabel>
                    <DatePickerField
                      ariaInvalid={fieldState.invalid}
                      id={field.name}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      value={field.value ?? ""}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            <Controller
              name="reason"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Reason</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    autoComplete="off"
                    placeholder="Illness or family cause"
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
            <Button
              type="submit"
              disabled={!isDirty || isSubmitting}
              className="w-fit">
              {isSubmitting ?
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Sending
                </>
              : "Send leave request"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex-col gap-3">
          <p className="text-sm font-medium">Leave queue</p>
          <LeaveQueueDataTable
            actingId={actingId}
            canDecide={canDecide}
            dir={dir}
            onDecide={onDecide}
            page={page}
            pageSize={pageSize}
            rows={leaves}
            sort={sort}
            sorting={[{ desc: dir === "desc", id: sort }]}
            total={total}
            totalPages={totalPages}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex-col gap-3">
          <p className="text-sm font-medium">
            {`Staff attendance for ${staffDate}. Leave without approval does not mark attendance.`}
          </p>
          {!canMarkStaff ?
            <p className="text-muted-foreground text-sm">
              Office, Vice Principal, or Principal marking only.
            </p>
          : <form
              onSubmit={handleStaffSubmit(onMarkStaff)}
              noValidate>
              {staffErrors.rows?.message ?
                <p
                  role="alert"
                  className="bg-destructive/10 text-destructive mb-3 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                  {staffErrors.rows.message}
                </p>
              : null}
              <div className="overflow-hidden rounded-xl border">
                <Table className="min-w-[560px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffOptions.map((option, index) => (
                      <TableRow key={option.id}>
                        <TableCell>{option.label}</TableCell>
                        <TableCell>
                          <Controller
                            name={`rows.${index}.status`}
                            control={staffControl}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <NativeSelect
                                  value={field.value}
                                  onChange={field.onChange}
                                  onBlur={field.onBlur}
                                  aria-invalid={fieldState.invalid}
                                  aria-label={`Status for ${option.label}`}>
                                  <NativeSelectOption value="PRESENT">
                                    Present
                                  </NativeSelectOption>
                                  <NativeSelectOption value="LEAVE">
                                    Leave
                                  </NativeSelectOption>
                                  <NativeSelectOption value="ON_DUTY">
                                    On duty
                                  </NativeSelectOption>
                                </NativeSelect>
                                <FieldError errors={[fieldState.error]} />
                              </Field>
                            )}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button
                type="submit"
                disabled={!staffDirty || staffSubmitting}
                className="mt-3 w-fit">
                {staffSubmitting ?
                  <>
                    <Loader2Icon
                      aria-hidden="true"
                      className="animate-spin"
                    />
                    Saving
                  </>
                : "Save staff day"}
              </Button>
            </form>
          }
        </CardContent>
      </Card>
    </div>
  );
};

export default LeaveWorkspace;
