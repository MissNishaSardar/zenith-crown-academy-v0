"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/shadcnui/button";
import { Badge } from "@/components/shadcnui/badge";
import { Card, CardContent } from "@/components/shadcnui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcnui/table";
import { Field, FieldError, FieldLabel } from "@/components/shadcnui/field";
import { Input } from "@/components/shadcnui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import {
  applyMarksApproval,
  decideMarksApproval,
  requestMarksReopen,
  requestMarksSubmit,
  saveMarksEntry,
} from "@/server/academics/markActions";

export type MarksGridRow = {
  hasException: boolean;
  internalMarks: string;
  isShortage: boolean;
  practicalMarks: string;
  rateHundredths: number;
  rollNo: string;
  sectionName: string;
  state: string;
  status: string;
  studentId: string;
  studentName: string;
  theoryMarks: string;
  totalMarks: string;
};

export type PendingMarkApproval = {
  action: string;
  id: string;
  status: string;
};

type PaperInfo = {
  className: string;
  components: { kind: string; maxMarks: string; passMarks: string }[];
  date: string;
  durationMin: number;
  examName: string;
  examStatus: string;
  id: string;
  isLocked: boolean;
  maxMarks: string;
  passMarks: string;
  subjectName: string;
  yearName: string;
};

const gridRowSchema = z.object({
  internalMarks: z.string().trim().max(20),
  practicalMarks: z.string().trim().max(20),
  state: z.enum(["SCORED", "ABSENT", "EXEMPT"]),
  studentId: z.string().min(1),
  theoryMarks: z.string().trim().max(20),
  totalMarks: z.string().trim().max(20),
});

const gridSchema = z.object({
  rows: z.array(gridRowSchema).min(1).max(300),
});

type GridForm = z.infer<typeof gridSchema>;

const parseDecimal = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return Number.NaN;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
};

const kindsOf = (paper: PaperInfo): string[] =>
  paper.components.map((row) => row.kind);

const ScoreInput = ({
  control,
  index,
  name,
  paperId,
  disabled,
}: {
  control: never;
  disabled: boolean;
  index: number;
  name: "theoryMarks" | "practicalMarks" | "internalMarks" | "totalMarks";
  paperId: string;
}) => (
  <Controller
    name={`rows.${index}.${name}` as never}
    control={control}
    render={({ field, fieldState }) => (
      <Field data-invalid={fieldState.invalid}>
        <Input
          id={`${paperId}-${field.name}`}
          type="number"
          min={0}
          step="0.01"
          value={String(field.value ?? "")}
          onChange={field.onChange}
          onBlur={field.onBlur}
          disabled={disabled}
          aria-invalid={fieldState.invalid}
          className="w-24"
        />
        <FieldError errors={[fieldState.error]} />
      </Field>
    )}
  />
);

const MarksEntryGrid = ({
  canWrite,
  paper,
  pending,
  rows,
}: {
  canWrite: boolean;
  paper: PaperInfo;
  pending: PendingMarkApproval[];
  rows: MarksGridRow[];
}) => {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const kinds = useMemo(() => kindsOf(paper), [paper]);
  const hasComponents = kinds.length > 0;

  const {
    control,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<GridForm>({
    defaultValues: {
      rows: rows.map((row) => ({
        internalMarks: row.internalMarks,
        practicalMarks: row.practicalMarks,
        state: row.state as "SCORED" | "ABSENT" | "EXEMPT",
        studentId: row.studentId,
        theoryMarks: row.theoryMarks,
        totalMarks: row.totalMarks,
      })),
    },
    mode: "all",
    resolver: zodResolver(gridSchema),
  });

  const { fields } = useFieldArray({ control, name: "rows" });

  const editable = canWrite && !paper.isLocked;

  const onSave = async (values: GridForm) => {
    setFeedback(null);
    const payload = {
      paperId: paper.id,
      rows: values.rows.map((row) => {
        if (row.state !== "SCORED") {
          return {
            internalMarks: null,
            practicalMarks: null,
            state: row.state,
            studentId: row.studentId,
            theoryMarks: null,
            totalMarks: null,
          };
        }
        if (hasComponents) {
          return {
            internalMarks:
              kinds.includes("INTERNAL") ?
                parseDecimal(row.internalMarks)
              : null,
            practicalMarks:
              kinds.includes("PRACTICAL") ?
                parseDecimal(row.practicalMarks)
              : null,
            state: row.state,
            studentId: row.studentId,
            theoryMarks:
              kinds.includes("THEORY") ? parseDecimal(row.theoryMarks) : null,
            totalMarks: null,
          };
        }
        return {
          internalMarks: null,
          practicalMarks: null,
          state: row.state,
          studentId: row.studentId,
          theoryMarks: null,
          totalMarks: parseDecimal(row.totalMarks),
        };
      }),
    };
    for (const row of payload.rows) {
      if (row.state !== "SCORED") continue;
      const numbers = [
        row.theoryMarks,
        row.practicalMarks,
        row.internalMarks,
        row.totalMarks,
      ].filter((value) => value !== null);
      if (
        numbers.some(
          (value) => value === null || !Number.isFinite(value as number),
        )
      ) {
        setFeedback("Enter valid numbers with at most 2 decimals.");
        return;
      }
      if (hasComponents && row.totalMarks !== null) {
        setFeedback("Total is derived from components for this paper.");
        return;
      }
      if (
        !hasComponents &&
        (row.totalMarks === null || row.totalMarks === undefined)
      ) {
        setFeedback("Enter total marks for every scored row.");
        return;
      }
      if (row.state === "SCORED" && hasComponents && numbers.length === 0) {
        setFeedback("Enter component marks for every scored row.");
        return;
      }
    }
    const result = await withMinimumLoad(saveMarksEntry(payload as never));
    if (!result.ok) {
      setFeedback(
        result.errors.root ?? "Could not save these marks. Try again.",
      );
      return;
    }
    router.refresh();
  };

  const runSubmit = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await withMinimumLoad(
        requestMarksSubmit({ paperId: paper.id }),
      );
      if (!result.ok) {
        setFeedback(result.errors.root ?? "Could not submit.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const runReopen = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await withMinimumLoad(
        requestMarksReopen({ paperId: paper.id, reason: reopenReason }),
      );
      if (!result.ok) {
        setFeedback(
          result.errors.reason ??
            result.errors.root ??
            "Could not request reopen.",
        );
        return;
      }
      setReopenReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const runDecide = async (
    approval: PendingMarkApproval,
    decision: "APPROVE" | "REJECT",
  ) => {
    setBusy(true);
    setFeedback(null);
    try {
      const decided = await withMinimumLoad(
        decideMarksApproval({
          action: approval.action as "marks_submit" | "marks_reopen",
          decision,
          id: approval.id,
          reason:
            decision === "REJECT" ? "Rejected from marks queue." : undefined,
        }),
      );
      if (!decided.ok) {
        setFeedback(decided.errors.root ?? "Could not decide.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const runApply = async (approval: PendingMarkApproval) => {
    setBusy(true);
    setFeedback(null);
    try {
      const applied = await withMinimumLoad(
        applyMarksApproval({
          action: approval.action as "marks_submit" | "marks_reopen",
          id: approval.id,
        }),
      );
      if (!applied.ok) {
        setFeedback(applied.errors.root ?? "Could not apply.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <span className="font-medium">
              {paper.subjectName} plus {paper.className} plus {paper.date}
            </span>
            <span className="text-muted-foreground text-sm">
              {paper.examName} plus {paper.yearName} plus max {paper.maxMarks}{" "}
              pass {paper.passMarks} plus {paper.durationMin} min plus{" "}
              {paper.examStatus}
              {hasComponents ?
                ` plus ${paper.components.map((component) => `${component.kind} ${component.maxMarks}/${component.passMarks}`).join(", ")}`
              : " plus no components"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!editable || busy || isSubmitting}
              onClick={runSubmit}
              size="sm"
              type="button"
              title={
                editable ?
                  "Submit for principal approval"
                : "Locked or principal only"
              }>
              {busy ?
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                  />
                  Working
                </>
              : "Submit"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <form
        onSubmit={handleSubmit(onSave)}
        noValidate
        className="flex flex-col gap-3">
        <div className="overflow-x-auto rounded-xl border">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Attendance</TableHead>
                {hasComponents ?
                  <>
                    {kinds.includes("THEORY") && <TableHead>Theory</TableHead>}
                    {kinds.includes("PRACTICAL") && (
                      <TableHead>Practical</TableHead>
                    )}
                    {kinds.includes("INTERNAL") && (
                      <TableHead>Internal</TableHead>
                    )}
                  </>
                : <TableHead>Total</TableHead>}
                <TableHead>State</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => {
                const source = rows[index];
                if (!source) return null;
                return (
                  <TableRow key={field.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {source.studentName}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {source.sectionName} plus roll {source.rollNo}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">
                          {(source.rateHundredths / 100).toFixed(2)} percent
                        </span>
                        {source.isShortage ?
                          <Badge variant="destructive">Shortage</Badge>
                        : null}
                        {source.hasException ?
                          <Badge variant="outline">Exception</Badge>
                        : null}
                      </div>
                    </TableCell>
                    {hasComponents ?
                      <>
                        {kinds.includes("THEORY") && (
                          <TableCell>
                            <ScoreInput
                              control={control as never}
                              disabled={!editable}
                              index={index}
                              name="theoryMarks"
                              paperId={paper.id}
                            />
                          </TableCell>
                        )}
                        {kinds.includes("PRACTICAL") && (
                          <TableCell>
                            <ScoreInput
                              control={control as never}
                              disabled={!editable}
                              index={index}
                              name="practicalMarks"
                              paperId={paper.id}
                            />
                          </TableCell>
                        )}
                        {kinds.includes("INTERNAL") && (
                          <TableCell>
                            <ScoreInput
                              control={control as never}
                              disabled={!editable}
                              index={index}
                              name="internalMarks"
                              paperId={paper.id}
                            />
                          </TableCell>
                        )}
                      </>
                    : <TableCell>
                        <ScoreInput
                          control={control as never}
                          disabled={!editable}
                          index={index}
                          name="totalMarks"
                          paperId={paper.id}
                        />
                      </TableCell>
                    }
                    <TableCell>
                      <Controller
                        name={`rows.${index}.state` as never}
                        control={control}
                        render={({ field: stateField, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <NativeSelect
                              value={String(stateField.value)}
                              onChange={stateField.onChange}
                              onBlur={stateField.onBlur}
                              disabled={!editable}
                              aria-label={`State for ${source.studentName}`}>
                              <NativeSelectOption value="SCORED">
                                Scored
                              </NativeSelectOption>
                              <NativeSelectOption value="ABSENT">
                                Absent
                              </NativeSelectOption>
                              <NativeSelectOption value="EXEMPT">
                                Exempt
                              </NativeSelectOption>
                            </NativeSelect>
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{source.status}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {rows.length === 0 ?
          <p className="text-muted-foreground text-sm">
            No students in scope for this paper. Check enrollment plus stream
            picks.
          </p>
        : null}
        {errors.root ?
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
            {errors.root.message}
          </p>
        : null}
        {feedback ?
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed">
            {feedback}
          </p>
        : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={!editable || !isDirty || isSubmitting}>
            {isSubmitting ?
              <>
                <Loader2Icon
                  aria-hidden="true"
                  className="animate-spin"
                />
                Saving
              </>
            : "Save marks"}
          </Button>
        </div>
      </form>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <span className="font-medium">Submit plus reopen</span>
          {pending.length === 0 ?
            <span className="text-muted-foreground text-sm">
              No pending approvals for this paper.
            </span>
          : pending.map((approval) => (
              <div
                key={approval.id}
                className="flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm">
                  {approval.action} plus {approval.status}
                </span>
                <div className="flex flex-wrap gap-2">
                  {approval.status === "PENDING" ?
                    <>
                      <Button
                        disabled={!canWrite || busy}
                        onClick={() => runDecide(approval, "APPROVE")}
                        size="sm"
                        type="button"
                        variant="outline">
                        Approve
                      </Button>
                      <Button
                        disabled={!canWrite || busy}
                        onClick={() => runDecide(approval, "REJECT")}
                        size="sm"
                        type="button"
                        variant="outline">
                        Reject
                      </Button>
                    </>
                  : null}
                  {approval.status === "APPROVED" ?
                    <Button
                      disabled={!canWrite || busy}
                      onClick={() => runApply(approval)}
                      size="sm"
                      type="button"
                      variant="outline">
                      Apply
                    </Button>
                  : null}
                </div>
              </div>
            ))
          }
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field className="w-full sm:max-w-sm">
              <FieldLabel htmlFor={`reopen-${paper.id}`}>
                Reopen reason
              </FieldLabel>
              <Input
                id={`reopen-${paper.id}`}
                value={reopenReason}
                onChange={(event) => setReopenReason(event.target.value)}
                placeholder="Why locked marks need edits"
                autoComplete="off"
                maxLength={500}
              />
            </Field>
            <Button
              disabled={!canWrite || busy || reopenReason.trim() === ""}
              onClick={runReopen}
              size="sm"
              type="button"
              variant="outline">
              Request reopen
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MarksEntryGrid;
