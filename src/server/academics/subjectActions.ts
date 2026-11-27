"use server";

import { Prisma } from "@generated/prisma/client";

import prisma from "@/lib/dbClient/prisma";
import {
  classSubjectSchema,
  streamSchema,
  streamSubjectSchema,
  subjectSchema,
  type classSubjectType,
  type streamSubjectType,
  type streamType,
  type subjectType,
} from "@/lib/zodSchema";
import { logAudit } from "@/server/audit";
import { requireActivePermission } from "@/server/guards";

export type SubjectResult =
  | { ok: true; subject: { code: string; id: string; name: string } }
  | { errors: Partial<Record<"code" | "name" | "root", string>>; ok: false };

export const createSubject = async (
  input: subjectType,
): Promise<SubjectResult> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const parsed = subjectSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<"code" | "name" | "root", string>> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "root") as keyof typeof fieldErrors;
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { errors: fieldErrors, ok: false };
  }
  try {
    const row = await prisma.subject.create({
      data: { code: parsed.data.code, name: parsed.data.name.trim() },
    });
    await logAudit({
      action: "create",
      actor,
      after: { code: row.code, name: row.name },
      before: null,
      entity: "subject",
      entityId: row.id,
    });
    return {
      ok: true,
      subject: { code: row.code, id: row.id, name: row.name },
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { code: "This subject code already exists." },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not create this subject. Try again." },
      ok: false,
    };
  }
};

export const setClassSubject = async (
  input: classSubjectType,
): Promise<
  | { ok: true }
  | {
      errors: Partial<Record<"classId" | "root" | "subjectId", string>>;
      ok: false;
    }
> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const parsed = classSubjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: { root: "Check the highlighted fields and try again." },
      ok: false,
    };
  }
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: parsed.data.classId },
  });
  if (!schoolClass) {
    return { errors: { classId: "Pick a valid class." }, ok: false };
  }
  const subject = await prisma.subject.findUnique({
    where: { id: parsed.data.subjectId },
  });
  if (!subject) {
    return { errors: { subjectId: "Pick a valid subject." }, ok: false };
  }
  await prisma.classSubject.upsert({
    create: {
      classId: parsed.data.classId,
      isOptional: parsed.data.isOptional,
      subjectId: parsed.data.subjectId,
    },
    update: { isOptional: parsed.data.isOptional },
    where: {
      classId_subjectId: {
        classId: parsed.data.classId,
        subjectId: parsed.data.subjectId,
      },
    },
  });
  await logAudit({
    action: "set-class-subject",
    actor,
    after: {
      classId: parsed.data.classId,
      isOptional: parsed.data.isOptional,
      subjectId: parsed.data.subjectId,
    },
    before: null,
    entity: "class-subject",
    entityId: `${parsed.data.classId}:${parsed.data.subjectId}`,
  });
  return { ok: true };
};

export const createStream = async (
  input: streamType,
): Promise<
  | { ok: true; stream: { id: string; name: string } }
  | { errors: Partial<Record<"classId" | "name" | "root", string>>; ok: false }
> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const parsed = streamSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<"classId" | "name" | "root", string>> =
      {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "root") as keyof typeof fieldErrors;
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { errors: fieldErrors, ok: false };
  }
  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: parsed.data.classId },
  });
  if (!schoolClass) {
    return { errors: { classId: "Pick a valid class." }, ok: false };
  }
  if (schoolClass.order !== 14 && schoolClass.order !== 15) {
    await logAudit({
      action: "create",
      actor,
      after: {
        blocked: true,
        classId: parsed.data.classId,
        reason: "stream-class-blocked",
      },
      before: null,
      entity: "stream",
      entityId: null,
    });
    return {
      errors: { classId: "Streams exist only for Class 11 and 12." },
      ok: false,
    };
  }
  try {
    const row = await prisma.stream.create({
      data: { classId: parsed.data.classId, name: parsed.data.name.trim() },
    });
    await logAudit({
      action: "create",
      actor,
      after: { classId: row.classId, name: row.name },
      before: null,
      entity: "stream",
      entityId: row.id,
    });
    return { ok: true, stream: { id: row.id, name: row.name } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { name: "This stream already exists for this class." },
        ok: false,
      };
    }
    return {
      errors: { root: "Could not create this stream. Try again." },
      ok: false,
    };
  }
};

export const addStreamSubject = async (
  input: streamSubjectType,
): Promise<
  | { ok: true }
  | {
      errors: Partial<Record<"root" | "streamId" | "subjectId", string>>;
      ok: false;
    }
> => {
  const session = await requireActivePermission("academic:manage-curriculum");
  const actor = {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  };
  const parsed = streamSubjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: { root: "Check the highlighted fields and try again." },
      ok: false,
    };
  }
  const stream = await prisma.stream.findUnique({
    where: { id: parsed.data.streamId },
  });
  if (!stream) {
    return { errors: { streamId: "Pick a valid stream." }, ok: false };
  }
  const mapping = await prisma.classSubject.findUnique({
    where: {
      classId_subjectId: {
        classId: stream.classId,
        subjectId: parsed.data.subjectId,
      },
    },
  });
  if (!mapping) {
    await logAudit({
      action: "set-stream-subject",
      actor,
      after: {
        blocked: true,
        reason: "stream-mapping-blocked",
        streamId: parsed.data.streamId,
        subjectId: parsed.data.subjectId,
      },
      before: null,
      entity: "stream-subject",
      entityId: null,
    });
    return {
      errors: { subjectId: "This subject is not mapped to the stream class." },
      ok: false,
    };
  }
  try {
    await prisma.streamSubject.create({
      data: {
        streamId: parsed.data.streamId,
        subjectId: parsed.data.subjectId,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        errors: { root: "This subject is already in this stream." },
        ok: false,
      };
    }
    throw error;
  }
  await logAudit({
    action: "set-stream-subject",
    actor,
    after: { streamId: parsed.data.streamId, subjectId: parsed.data.subjectId },
    before: null,
    entity: "stream-subject",
    entityId: `${parsed.data.streamId}:${parsed.data.subjectId}`,
  });
  return { ok: true };
};
