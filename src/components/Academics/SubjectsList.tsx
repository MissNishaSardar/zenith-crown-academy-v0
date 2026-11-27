"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import type { Route } from "next";
import { getCoreRowModel, useLegacyTable } from "@tanstack/react-table/legacy";
import { legacyCreateColumnHelper } from "@tanstack/react-table/legacy";
import { Button } from "@/components/shadcnui/button";
import { Card, CardContent } from "@/components/shadcnui/card";
import DataTable, {
  DataTablePagination,
  DataTableSortButton,
} from "@/components/DataTable/DataTable";
import { Checkbox } from "@/components/shadcnui/checkbox";
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
import { withMinimumLoad } from "@/lib/auth/withMinimumLoad";
import { subjectSchema } from "@/lib/zodSchema";
import {
  addStreamSubject,
  createSubject,
  setClassSubject,
} from "@/server/academics/subjectActions";

export type SubjectRow = {
  classCount: number;
  code: string;
  id: string;
  name: string;
  streamCount: number;
};

type SubjectsListProps = {
  canWrite: boolean;
  classes: { id: string; name: string; order: number }[];
  dir: string;
  page: number;
  pageSize: number;
  rows: SubjectRow[];
  search: string;
  sort: string;
  streams: { classId: string; id: string; name: string }[];
  total: number;
  totalPages: number;
};

const columnHelper = legacyCreateColumnHelper<SubjectRow>();

const subjectsColumns = columnHelper.columns([
  columnHelper.accessor("code", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Code"
      />
    ),
  }),
  columnHelper.accessor("name", {
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    header: ({ column }) => (
      <DataTableSortButton
        column={column}
        label="Subject"
      />
    ),
  }),
  columnHelper.accessor("classCount", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: "Classes",
  }),
  columnHelper.accessor("streamCount", {
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    header: "Streams",
  }),
]);

const deriveSubjectCode = (name: string): string =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 3);

const subjectDialogSchema = subjectSchema.omit({ id: true }).extend({
  classIds: z
    .array(z.string().min(1))
    .min(1, { error: "Pick at least one class" })
    .max(30, { error: "Too many classes" }),
  isOptional: z.boolean(),
  streamIds: z
    .array(z.string().min(1))
    .max(100, { error: "Too many streams" })
    .optional(),
});

type SubjectDialogType = z.infer<typeof subjectDialogSchema>;

const SubjectDialog = ({
  canWrite,
  classes,
  streams,
}: {
  canWrite: boolean;
  classes: { id: string; name: string; order: number }[];
  streams: { classId: string; id: string; name: string }[];
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const lastAutoCode = useRef("");

  const {
    control,
    getValues,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SubjectDialogType>({
    defaultValues: {
      classIds: [],
      code: "",
      isOptional: false,
      name: "",
      streamIds: [],
    },
    mode: "all",
    resolver: zodResolver(subjectDialogSchema),
  });

  const watchedClassIds = watch("classIds");
  const pickedSeniorClasses = useMemo(
    () =>
      classes.filter(
        (row) => (watchedClassIds ?? []).includes(row.id) && row.order >= 14,
      ),
    [classes, watchedClassIds],
  );

  const openDialog = () => {
    reset({
      classIds: [],
      code: "",
      isOptional: false,
      name: "",
      streamIds: [],
    });
    lastAutoCode.current = "";
    setOpen(true);
  };

  const classNameOf = (classId: string): string =>
    classes.find((row) => row.id === classId)?.name ?? "this class";

  const streamNameOf = (streamId: string): string =>
    streams.find((row) => row.id === streamId)?.name ?? "this stream";

  const onSubmit = async (values: SubjectDialogType) => {
    const created = await withMinimumLoad(
      createSubject({ code: values.code, name: values.name }),
    );
    if (!created.ok) {
      for (const [field, message] of Object.entries(created.errors)) {
        if (!message) continue;
        if (field === "root") setError("root", { message });
        else if (field === "code" || field === "name") {
          setError(field, { message });
        } else setError("root", { message });
      }
      return;
    }
    const subjectId = created.subject.id;
    for (const classId of values.classIds) {
      const mapped = await withMinimumLoad(
        setClassSubject({
          classId,
          isOptional: values.isOptional,
          subjectId,
        }),
      );
      if (!mapped.ok) {
        const first = Object.values(mapped.errors).find(Boolean);
        setError("root", {
          message: `Subject ${created.subject.code} created but mapping to ${classNameOf(classId)} failed: ${first ?? "try again"}.`,
        });
        return;
      }
    }
    const pickedStreams = (values.streamIds ?? []).filter((streamId) =>
      streams.some(
        (row) => row.id === streamId && values.classIds.includes(row.classId),
      ),
    );
    for (const streamId of pickedStreams) {
      const streamMapped = await withMinimumLoad(
        addStreamSubject({ streamId, subjectId }),
      );
      if (!streamMapped.ok) {
        const first = Object.values(streamMapped.errors).find(Boolean);
        setError("root", {
          message: `Subject ${created.subject.code} created but mapping to ${streamNameOf(streamId)} failed: ${first ?? "try again"}.`,
        });
        return;
      }
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button
        disabled={!canWrite}
        onClick={openDialog}
        type="button"
        title={canWrite ? undefined : "Principal only"}>
        New subject
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New subject</DialogTitle>
            <DialogDescription>
              Global code plus name, mapped to every picked class now. Mapping
              is what makes it appear in curriculum picks.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Controller
                name="code"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Code</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      autoComplete="off"
                      placeholder="ART"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="name"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      autoComplete="off"
                      placeholder="Art and craft"
                      onChange={(event) => {
                        field.onChange(event);
                        const currentCode = getValues("code");
                        if (
                          currentCode === "" ||
                          currentCode === lastAutoCode.current
                        ) {
                          const next = deriveSubjectCode(event.target.value);
                          lastAutoCode.current = next;
                          if (next !== currentCode) {
                            setValue("code", next, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }
                        }
                      }}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
            <Controller
              name="classIds"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Classes</FieldLabel>
                  <div className="flex flex-col gap-2 rounded-md border px-3.5 py-3">
                    {classes.map((schoolClass) => {
                      const checked = (field.value ?? []).includes(
                        schoolClass.id,
                      );
                      return (
                        <label
                          key={schoolClass.id}
                          className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => {
                              const current = new Set(field.value ?? []);
                              if (next === true) {
                                current.add(schoolClass.id);
                              } else {
                                current.delete(schoolClass.id);
                                const keep = (
                                  getValues("streamIds") ?? []
                                ).filter(
                                  (streamId) =>
                                    !streams.some(
                                      (row) =>
                                        row.id === streamId &&
                                        row.classId === schoolClass.id,
                                    ),
                                );
                                setValue("streamIds", keep, {
                                  shouldDirty: true,
                                });
                              }
                              field.onChange([...current]);
                            }}
                          />
                          <span>{schoolClass.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="isOptional"
              control={control}
              render={({ field: { value, onChange, onBlur, name } }) => (
                <Field
                  orientation="horizontal"
                  className="w-auto">
                  <Checkbox
                    id="subject-optional"
                    name={name}
                    checked={value}
                    onCheckedChange={(checked) => onChange(checked === true)}
                    onBlur={onBlur}
                  />
                  <FieldLabel htmlFor="subject-optional">
                    Optional for picked classes
                  </FieldLabel>
                </Field>
              )}
            />
            {pickedSeniorClasses.length > 0 ?
              <Controller
                name="streamIds"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Streams, optional</FieldLabel>
                    <div className="flex flex-col gap-3">
                      {pickedSeniorClasses.map((schoolClass) => {
                        const group = streams.filter(
                          (row) => row.classId === schoolClass.id,
                        );
                        if (group.length === 0) {
                          return (
                            <p
                              key={schoolClass.id}
                              className="text-muted-foreground text-xs">
                              {schoolClass.name} has no streams yet. Maps at
                              class level.
                            </p>
                          );
                        }
                        return (
                          <div
                            key={schoolClass.id}
                            className="flex flex-col gap-2 rounded-md border px-3.5 py-3">
                            <span className="text-muted-foreground text-xs">
                              {schoolClass.name}
                            </span>
                            {group.map((stream) => {
                              const checked = (field.value ?? []).includes(
                                stream.id,
                              );
                              return (
                                <label
                                  key={stream.id}
                                  className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(next) => {
                                      const current = new Set(
                                        field.value ?? [],
                                      );
                                      if (next === true) {
                                        current.add(stream.id);
                                      } else {
                                        current.delete(stream.id);
                                      }
                                      field.onChange([...current]);
                                    }}
                                  />
                                  <span>{stream.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            : null}
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
                : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

const SubjectsList = ({
  canWrite,
  classes,
  dir,
  page,
  pageSize,
  rows,
  search: initialSearch,
  sort,
  streams,
  total,
  totalPages,
}: SubjectsListProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSearch = (searchParams.get("search") ?? initialSearch)
    .trim()
    .slice(0, 100);
  const [search, setSearch] = useState(initialSearch);
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  if (prevUrlSearch !== urlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearch(urlSearch);
  }

  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}` as Route);
    }, 500);
    return () => clearTimeout(timer);
  }, [search, urlSearch, pathname, router]);

  const table = useLegacyTable({
    autoResetPageIndex: false,
    columns: subjectsColumns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    onSortingChange: (updater) => {
      const current = [{ desc: dir === "desc", id: sort }];
      const next = typeof updater === "function" ? updater(current) : updater;
      const first = next[0];
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (first && (first.id !== "code" || first.desc)) {
        params.set("sort", first.id);
        params.set("dir", first.desc ? "desc" : "asc");
      }
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}` as Route);
    },
    pageCount: totalPages,
    state: {
      pagination: { pageIndex: page - 1, pageSize },
      sorting: [{ desc: dir === "desc", id: sort }],
    },
  });

  const goPage = (nextPage: number) => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (sort !== "code" || dir !== "asc") {
      params.set("sort", sort);
      params.set("dir", dir);
    }
    params.set("page", String(nextPage));
    router.replace(`${pathname}?${params.toString()}` as Route);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="sm:flex-row sm:items-end sm:gap-4">
          <Field className="flex-1">
            <FieldLabel htmlFor="subjects-search">Search subjects</FieldLabel>
            <Input
              autoComplete="off"
              id="subjects-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Code or name like ENG"
              type="search"
              value={search}
            />
          </Field>
          <Button
            disabled={search.trim() === ""}
            onClick={() => {
              setSearch("");
              router.replace(`${pathname}?page=1` as Route);
            }}
            type="button"
            variant="outline">
            Clear
          </Button>
          <SubjectDialog
            canWrite={canWrite}
            classes={classes}
            streams={streams}
          />
        </CardContent>
      </Card>
      <div className="overflow-hidden rounded-xl border">
        <DataTable
          emptyMessage="No subjects match these filters."
          minWidthClass="min-w-[620px]"
          table={table}
        />
        <DataTablePagination
          onNext={() => goPage(Math.min(totalPages, page + 1))}
          onPrevious={() => goPage(Math.max(1, page - 1))}
          page={page}
          pageLabel={`Showing ${rows.length} of ${total} subjects. Page ${page} of ${totalPages}.`}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
};

export default SubjectsList;
