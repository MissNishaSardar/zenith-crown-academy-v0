"use server";

import { Prisma } from "@generated/prisma/client";

import { can } from "@/lib/auth/permissions";
import {
  guardianSchema,
  guardianType,
  studentSchema,
  studentType,
} from "@/lib/zodSchema";
import prisma from "@/lib/dbClient/prisma";
import { logAudit, toMinimalAuditChange } from "@/server/audit";
import {
  ForbiddenError,
  getFreshRoleContext,
  requireSession,
} from "@/server/guards";

export type GuardianResult =
  | { ok: true; guardian: { id: string; name: string } }
  | {
      errors: Partial<
        Record<
          | "address"
          | "email"
          | "name"
          | "phone"
          | "relation"
          | "relationNote"
          | "root"
          | "userId",
          string
        >
      >;
      ok: false;
    };

export type StudentResult =
  | { ok: true; student: { admissionNo: string; id: string } }
  | {
      errors: Partial<
        Record<
          | "address"
          | "admissionStatus"
          | "classId"
          | "dob"
          | "firstName"
          | "gender"
          | "lastName"
          | "photoPath"
          | "previousSchool"
          | "root"
          | "sectionId"
          | "userId"
          | "yearId",
          string
        >
      >;
      ok: false;
    };

type GuardianErrorMap = Extract<GuardianResult, { ok: false }>["errors"];
type StudentErrorMap = Extract<StudentResult, { ok: false }>["errors"];

const normalizeOptionalId = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const normalizeOptionalEmail = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.toLowerCase();
};

const normalizeOptionalText = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const requirePersonWrite = async (entity: string) => {
  const session = await requireSession();
  const { active } = await getFreshRoleContext(session.user.id);
  // office_staff holds academic:view for read and is explicitly granted
  // person write for front-office data entry. Keep this grant next to the
  // manage-curriculum and system:manage checks so the bypass stays visible.
  const allowed =
    active !== null &&
    (can(active, "academic:manage-curriculum") ||
      active === "office_staff" ||
      can(active, "system:manage"));
  if (!allowed) {
    await logAudit({
      action: "permission-deny",
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      after: {
        active: active ?? null,
        blocked: true,
        permission: "academic:manage-curriculum",
        reason: "office-grant-denied",
      },
      before: null,
      entity,
      entityId: null,
    });
    throw new ForbiddenError("academic:manage-curriculum");
  }
  return {
    actor: {
      email: session.user.email,
      id: session.user.id,
      role: session.user.role,
    },
  };
};

const toSafeGuardian = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of [
    "address",
    "email",
    "name",
    "phone",
    "relation",
    "relationNote",
    "userId",
  ]) {
    out[field] = record[field] ?? null;
  }
  return out;
};

const toSafeStudent = (row: unknown): Record<string, unknown> => {
  if (!row || typeof row !== "object") return {};
  const record = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of [
    "address",
    "admissionNo",
    "admissionStatus",
    "classId",
    "dob",
    "firstName",
    "gender",
    "lastName",
    "photoPath",
    "previousSchool",
    "sectionId",
    "userId",
    "yearId",
  ]) {
    const value = record[field];
    out[field] = value instanceof Date ? value.toISOString() : (value ?? null);
  }
  return out;
};

const toGuardianFieldErrors = (
  issues: { message: string; path: (string | number)[] }[],
): GuardianErrorMap => {
  const fieldErrors: GuardianErrorMap = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "root") as keyof GuardianErrorMap;
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
};

const toStudentFieldErrors = (
  issues: { message: string; path: (string | number)[] }[],
): StudentErrorMap => {
  const fieldErrors: StudentErrorMap = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "root") as keyof StudentErrorMap;
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
};

const checkGuardianUserLink = async (userId: string) => {
  const target = await prisma.user.findUnique({
    include: { userRoles: { include: { role: true } } },
    where: { id: userId },
  });
  if (!target) return "Linked user no longer exists.";
  const held = target.userRoles.map((row) => row.role.slug);
  const fallback = target.role
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const combined = [...new Set([...held, ...fallback])];
  if (!combined.includes("parent")) {
    return "Linked user must hold the parent role.";
  }
  return null;
};

const checkStudentUserLink = async (userId: string, classOrder: number) => {
  if (classOrder <= 8) {
    return "Nursery to Class 5 stays parent managed with no login.";
  }
  const target = await prisma.user.findUnique({
    include: { userRoles: { include: { role: true } } },
    where: { id: userId },
  });
  if (!target) return "Linked user no longer exists.";
  const held = target.userRoles.map((row) => row.role.slug);
  const fallback = target.role
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const combined = [...new Set([...held, ...fallback])];
  if (!combined.includes("student")) {
    return "Linked user must hold the student role.";
  }
  return null;
};

const generateAdmissionNo = async (
  yearId: string,
  yearName: string,
): Promise<string> => {
  const prefix = yearName.trim().replace(/\//g, "-");
  const count = await prisma.studentProfile.count({ where: { yearId } });
  let seq = count + 1;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = `${prefix}/${String(seq).padStart(3, "0")}`;
    const existing = await prisma.studentProfile.findUnique({
      where: { admissionNo: candidate },
    });
    if (!existing) return candidate;
    seq += 1;
  }
  throw new Error("Could not generate a unique admission number.");
};

export const createGuardian = async (
  input: guardianType,
): Promise<GuardianResult> => {
  const { actor } = await requirePersonWrite("guardian");
  const parsed = guardianSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: toGuardianFieldErrors(
        parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map(String),
        })),
      ),
      ok: false,
    };
  }
  const data = parsed.data;
  const email = normalizeOptionalEmail(data.email) ?? null;
  const userId = normalizeOptionalId(data.userId) ?? null;
  const relationNote =
    data.relation === "OTHER" ?
      (normalizeOptionalText(data.relationNote) ?? null)
    : null;
  if (userId) {
    const problem = await checkGuardianUserLink(userId);
    if (problem) return { errors: { userId: problem }, ok: false };
    const linked = await prisma.guardian.findUnique({ where: { userId } });
    if (linked) {
      return {
        errors: { userId: "This login is already linked to another guardian." },
        ok: false,
      };
    }
  }
  try {
    const row = await prisma.guardian.create({
      data: {
        address: data.address.trim(),
        email,
        name: data.name.trim(),
        phone: data.phone.trim(),
        relation: data.relation,
        relationNote,
        userId,
      },
    });
    await logAudit({
      action: "create",
      actor,
      after: toSafeGuardian(row),
      before: null,
      entity: "guardian",
      entityId: row.id,
    });
    return { guardian: { id: row.id, name: row.name }, ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = String(error.meta?.target ?? "");
      if (target.includes("userId")) {
        return {
          errors: { userId: "This login is already linked." },
          ok: false,
        };
      }
      return { errors: { root: "This record already exists." }, ok: false };
    }
    return {
      errors: { root: "Could not create this guardian record. Try again." },
      ok: false,
    };
  }
};

export const updateGuardian = async (
  input: guardianType & { id: string },
): Promise<GuardianResult> => {
  const { actor } = await requirePersonWrite("guardian");
  if (!input.id) {
    return { errors: { root: "Missing guardian id." }, ok: false };
  }
  const parsed = guardianSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: toGuardianFieldErrors(
        parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map(String),
        })),
      ),
      ok: false,
    };
  }
  const target = await prisma.guardian.findUnique({ where: { id: input.id } });
  if (!target) {
    return {
      errors: { root: "This guardian record no longer exists." },
      ok: false,
    };
  }
  const data = parsed.data;
  const email = normalizeOptionalEmail(data.email) ?? null;
  const relationNote =
    data.relation === "OTHER" ?
      (normalizeOptionalText(data.relationNote) ?? null)
    : null;
  let nextUserId: string | null;
  if (data.userId === undefined) {
    nextUserId = target.userId;
  } else {
    nextUserId = normalizeOptionalId(data.userId) ?? null;
  }
  if (nextUserId && nextUserId !== target.userId) {
    const problem = await checkGuardianUserLink(nextUserId);
    if (problem) return { errors: { userId: problem }, ok: false };
    const linked = await prisma.guardian.findFirst({
      where: { id: { not: input.id }, userId: nextUserId },
    });
    if (linked) {
      return {
        errors: { userId: "This login is already linked to another guardian." },
        ok: false,
      };
    }
  }
  try {
    const before = toSafeGuardian(target);
    const row = await prisma.guardian.update({
      data: {
        address: data.address.trim(),
        email,
        name: data.name.trim(),
        phone: data.phone.trim(),
        relation: data.relation,
        relationNote,
        userId: nextUserId,
      },
      where: { id: input.id },
    });
    const minimal = toMinimalAuditChange(before, toSafeGuardian(row));
    await logAudit({
      action: "update",
      actor,
      after: minimal.after,
      before: minimal.before,
      entity: "guardian",
      entityId: row.id,
    });
    return { guardian: { id: row.id, name: row.name }, ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { errors: { userId: "This login is already linked." }, ok: false };
    }
    return {
      errors: { root: "Could not update this guardian record. Try again." },
      ok: false,
    };
  }
};

export const createStudent = async (
  input: studentType,
): Promise<StudentResult> => {
  const { actor } = await requirePersonWrite("student-profile");
  const parsed = studentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: toStudentFieldErrors(
        parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map(String),
        })),
      ),
      ok: false,
    };
  }
  const data = parsed.data;
  const year = await prisma.academicYear.findUnique({
    where: { id: data.yearId },
  });
  if (!year) {
    return { errors: { yearId: "Pick a valid academic year." }, ok: false };
  }
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: data.classId },
  });
  if (!schoolClass) {
    return { errors: { classId: "Pick a valid class." }, ok: false };
  }
  const sectionId = normalizeOptionalId(data.sectionId) ?? null;
  if (sectionId) {
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
    });
    if (!section) {
      return { errors: { sectionId: "Pick a valid section." }, ok: false };
    }
    if (section.yearId !== data.yearId || section.classId !== data.classId) {
      return {
        errors: {
          sectionId: "Section does not belong to this year and class.",
        },
        ok: false,
      };
    }
  }
  const previousSchool = normalizeOptionalText(data.previousSchool) ?? null;
  if (schoolClass.order >= 4 && !previousSchool) {
    return {
      errors: { previousSchool: "Enter the previous school." },
      ok: false,
    };
  }
  const photoPath = normalizeOptionalText(data.photoPath) ?? null;
  const userId = normalizeOptionalId(data.userId) ?? null;
  if (userId) {
    const problem = await checkStudentUserLink(userId, schoolClass.order);
    if (problem) return { errors: { userId: problem }, ok: false };
    const linked = await prisma.studentProfile.findUnique({
      where: { userId },
    });
    if (linked) {
      return {
        errors: { userId: "This login is already linked to another student." },
        ok: false,
      };
    }
  }
  const dob = new Date(`${data.dob}T00:00:00`);
  if (Number.isNaN(dob.getTime())) {
    return { errors: { dob: "Pick a valid date of birth." }, ok: false };
  }
  let admissionNo: string;
  try {
    admissionNo = await generateAdmissionNo(year.id, year.name);
  } catch {
    return {
      errors: { root: "Could not generate an admission number. Try again." },
      ok: false,
    };
  }
  try {
    const row = await prisma.studentProfile.create({
      data: {
        address: data.address.trim(),
        admissionNo,
        admissionStatus: data.admissionStatus ?? "ACTIVE",
        classId: data.classId,
        dob,
        firstName: data.firstName.trim(),
        gender: data.gender,
        lastName: data.lastName.trim(),
        photoPath,
        previousSchool,
        sectionId,
        userId,
        yearId: data.yearId,
      },
    });
    await logAudit({
      action: "create",
      actor,
      after: toSafeStudent(row),
      before: null,
      entity: "student-profile",
      entityId: row.id,
    });
    return { ok: true, student: { admissionNo: row.admissionNo, id: row.id } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = String(error.meta?.target ?? "");
      if (target.includes("admissionNo")) {
        return {
          errors: { root: "Admission number clash. Try again." },
          ok: false,
        };
      }
      if (target.includes("userId")) {
        return {
          errors: { userId: "This login is already linked." },
          ok: false,
        };
      }
      return { errors: { root: "This record already exists." }, ok: false };
    }
    return {
      errors: { root: "Could not create this student record. Try again." },
      ok: false,
    };
  }
};

export const updateStudent = async (
  input: studentType & { id: string },
): Promise<StudentResult> => {
  const { actor } = await requirePersonWrite("student-profile");
  if (!input.id) {
    return { errors: { root: "Missing student id." }, ok: false };
  }
  const parsed = studentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: toStudentFieldErrors(
        parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map(String),
        })),
      ),
      ok: false,
    };
  }
  const target = await prisma.studentProfile.findUnique({
    where: { id: input.id },
  });
  if (!target) {
    return {
      errors: { root: "This student record no longer exists." },
      ok: false,
    };
  }
  const data = parsed.data;
  if (data.yearId !== target.yearId) {
    return {
      errors: { yearId: "Year cannot be changed here. Use promotion." },
      ok: false,
    };
  }
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: data.classId },
  });
  if (!schoolClass) {
    return { errors: { classId: "Pick a valid class." }, ok: false };
  }
  const sectionId = normalizeOptionalId(data.sectionId) ?? null;
  if (sectionId) {
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
    });
    if (!section) {
      return { errors: { sectionId: "Pick a valid section." }, ok: false };
    }
    if (section.yearId !== target.yearId || section.classId !== data.classId) {
      return {
        errors: {
          sectionId: "Section does not belong to this year and class.",
        },
        ok: false,
      };
    }
  }
  const previousSchool = normalizeOptionalText(data.previousSchool) ?? null;
  if (schoolClass.order >= 4 && !previousSchool) {
    return {
      errors: { previousSchool: "Enter the previous school." },
      ok: false,
    };
  }
  const photoPath = normalizeOptionalText(data.photoPath) ?? null;
  const dob = new Date(`${data.dob}T00:00:00`);
  if (Number.isNaN(dob.getTime())) {
    return { errors: { dob: "Pick a valid date of birth." }, ok: false };
  }
  let nextUserId: string | null;
  if (data.userId === undefined) {
    nextUserId = target.userId;
  } else {
    nextUserId = normalizeOptionalId(data.userId) ?? null;
  }
  if (nextUserId && nextUserId !== target.userId) {
    const problem = await checkStudentUserLink(nextUserId, schoolClass.order);
    if (problem) return { errors: { userId: problem }, ok: false };
    const linked = await prisma.studentProfile.findFirst({
      where: { id: { not: input.id }, userId: nextUserId },
    });
    if (linked) {
      return {
        errors: { userId: "This login is already linked to another student." },
        ok: false,
      };
    }
  }
  if (schoolClass.order <= 8 && nextUserId) {
    return {
      errors: {
        userId: "Nursery to Class 5 stays parent managed with no login.",
      },
      ok: false,
    };
  }
  try {
    const before = toSafeStudent(target);
    const row = await prisma.studentProfile.update({
      data: {
        address: data.address.trim(),
        admissionStatus: data.admissionStatus ?? target.admissionStatus,
        classId: data.classId,
        dob,
        firstName: data.firstName.trim(),
        gender: data.gender,
        lastName: data.lastName.trim(),
        photoPath,
        previousSchool,
        sectionId,
        userId: nextUserId,
      },
      where: { id: input.id },
    });
    const minimal = toMinimalAuditChange(before, toSafeStudent(row));
    await logAudit({
      action: "update",
      actor,
      after: minimal.after,
      before: minimal.before,
      entity: "student-profile",
      entityId: row.id,
    });
    return { ok: true, student: { admissionNo: row.admissionNo, id: row.id } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { errors: { userId: "This login is already linked." }, ok: false };
    }
    return {
      errors: { root: "Could not update this student record. Try again." },
      ok: false,
    };
  }
};
