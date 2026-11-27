import type { Metadata } from "next";

import { BreadcrumbTrail } from "@/components/Layout/Breadcrumbs";
import PageHeader from "@/components/Layout/PageHeader";
import { Button } from "@/components/shadcnui/button";
import { Field, FieldLabel } from "@/components/shadcnui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/shadcnui/native-select";
import SubstitutionsDataTable from "@/components/Academics/SubstitutionsDataTable";
import { getAcademicsTrail } from "@/lib/dashboard-nav";
import prisma from "@/lib/dbClient/prisma";
import { requirePermission } from "@/server/guards";

export const metadata: Metadata = {
  title: "Substitutions",
};

const PAGE_SIZE = 10;

type SearchParams = {
  dir?: string | string[] | undefined;
  page?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  status?: string | string[] | undefined;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const statusOptions = ["PENDING", "APPROVED", "REJECTED", "APPLIED"] as const;

const SubstitutionsPage = async ({ searchParams }: PageProps) => {
  await requirePermission("academic:view");
  const raw = await searchParams;
  const statusParam = firstParam(raw.status);
  const status =
    (statusOptions as readonly string[]).includes(statusParam) ?
      statusParam
    : "all";
  const parsedPage = Number.parseInt(firstParam(raw.page), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const sortParam = firstParam(raw.sort);
  const sort = sortParam === "status" ? "status" : "date";
  const dir = firstParam(raw.dir) === "asc" ? "asc" : "desc";

  const where =
    status === "all" ?
      {}
    : { status: status as (typeof statusOptions)[number] };
  const total = await prisma.substitution.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const covers = await prisma.substitution.findMany({
    include: {
      coverTeacher: { select: { name: true } },
      slot: {
        select: {
          class: { select: { name: true } },
          dayOfWeek: true,
          periodNo: true,
          section: { select: { name: true } },
          subject: { select: { code: true, name: true } },
        },
      },
    },
    orderBy: [{ [sort]: dir }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    where,
  });

  const rows = covers.map((cover) => ({
    coverName: cover.coverTeacher.name,
    date: cover.date.toISOString().slice(0, 10),
    id: cover.id,
    reason: cover.reason,
    slotLabel: `${cover.slot.class.name} ${cover.slot.section.name} day ${cover.slot.dayOfWeek} P${cover.slot.periodNo} ${cover.slot.subject.name}`,
    status: cover.status,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BreadcrumbTrail items={getAcademicsTrail("Substitutions")} />
      <PageHeader
        subtitle="Cover duties with clash and scope recheck"
        title="Substitutions"
      />
      <form
        className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-end"
        method="get">
        <Field className="w-full sm:w-48">
          <FieldLabel htmlFor="substitutions-status">Status</FieldLabel>
          <NativeSelect
            defaultValue={status}
            id="substitutions-status"
            name="status">
            <NativeSelectOption value="all">All statuses</NativeSelectOption>
            {statusOptions.map((option) => (
              <NativeSelectOption
                key={option}
                value={option}>
                {option}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Button type="submit">Apply filters</Button>
      </form>
      <SubstitutionsDataTable
        dir={dir}
        page={page}
        rows={rows}
        sort={sort}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
};

export default SubstitutionsPage;
