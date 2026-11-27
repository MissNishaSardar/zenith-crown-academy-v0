import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import prisma from "@/lib/dbClient/prisma";
import { readStoredFile } from "@/lib/storage/storage";
import { logAudit } from "@/server/audit";
import { getFreshRoleContext } from "@/server/guards";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
};

const contentTypeFor = (relativePath: string): string => {
  const lower = relativePath.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf("."));
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
};

type RouteContext = { params: Promise<{ path: string[] }> };

export const GET = async (_request: Request, context: RouteContext) => {
  const { path } = await context.params;
  const relativePath = (path ?? []).join("/");
  if (!relativePath || relativePath.includes("..")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((m) => m.headers()),
  });
  if (!session) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { active } = await getFreshRoleContext(session.user.id);
  if (!active) {
    await logAudit({
      action: "file-deny",
      actor: {
        email: session.user.email,
        id: session.user.id,
        role: session.user.role,
      },
      after: {
        blocked: true,
        path: relativePath.split("/")[0] ?? null,
        reason: "no-active-role",
      },
      before: null,
      entity: "file",
      entityId: null,
    });
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const firstSegment = relativePath.split("/")[0] ?? "";
  if (firstSegment === "assignments") {
    if (can(active, "academic:manage-curriculum")) {
      try {
        const bytes = await readStoredFile(relativePath);
        return new Response(bytes as unknown as BodyInit, {
          headers: {
            "Cache-Control": "private, max-age=60",
            "Content-Length": String(bytes.length),
            "Content-Type": contentTypeFor(relativePath),
          },
        });
      } catch {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
    }
    const submission = await prisma.assignmentSubmission.findFirst({
      include: {
        assignment: {
          include: {
            class: { select: { id: true } },
            section: { select: { classTeacherId: true, id: true } },
          },
        },
        student: { select: { id: true, userId: true } },
      },
      where: { filePath: relativePath },
    });
    if (!submission) {
      await logAudit({
        action: "file-deny",
        actor: { email: session.user.email, id: session.user.id, role: active },
        after: { blocked: true, path: "assignments", reason: "scope-denied" },
        before: null,
        entity: "file",
        entityId: null,
      });
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (submission.student.userId === session.user.id) {
      try {
        const bytes = await readStoredFile(relativePath);
        return new Response(bytes as unknown as BodyInit, {
          headers: {
            "Cache-Control": "private, max-age=60",
            "Content-Length": String(bytes.length),
            "Content-Type": contentTypeFor(relativePath),
          },
        });
      } catch {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
    }
    const guardian = await prisma.guardian.findFirst({
      select: { id: true },
      where: { userId: session.user.id },
    });
    if (guardian) {
      const link = await prisma.studentGuardianLink.findUnique({
        where: {
          studentId_guardianId: {
            guardianId: guardian.id,
            studentId: submission.student.id,
          },
        },
      });
      if (link) {
        try {
          const bytes = await readStoredFile(relativePath);
          return new Response(bytes as unknown as BodyInit, {
            headers: {
              "Cache-Control": "private, max-age=60",
              "Content-Length": String(bytes.length),
              "Content-Type": contentTypeFor(relativePath),
            },
          });
        } catch {
          return NextResponse.json({ error: "Not found." }, { status: 404 });
        }
      }
    }
    const teacherLinks = await prisma.teacherAssignment.findMany({
      select: { id: true, sectionId: true },
      where: {
        classId: submission.assignment.classId,
        isActive: true,
        subjectId: submission.assignment.subjectId,
        teacherId: session.user.id,
        yearId: submission.assignment.yearId,
      },
    });
    const coversSection = teacherLinks.some(
      (row) =>
        row.sectionId === null ||
        submission.assignment.sectionId === null ||
        row.sectionId === submission.assignment.sectionId,
    );
    const isClassTeacher =
      submission.assignment.section?.classTeacherId === session.user.id;
    if (coversSection || isClassTeacher) {
      try {
        const bytes = await readStoredFile(relativePath);
        return new Response(bytes as unknown as BodyInit, {
          headers: {
            "Cache-Control": "private, max-age=60",
            "Content-Length": String(bytes.length),
            "Content-Type": contentTypeFor(relativePath),
          },
        });
      } catch {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
    }
    await logAudit({
      action: "file-deny",
      actor: { email: session.user.email, id: session.user.id, role: active },
      after: { blocked: true, path: "assignments", reason: "scope-denied" },
      before: null,
      entity: "file",
      entityId: null,
    });
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const isOwnFile = firstSegment === session.user.id;
  // Least privilege: own folder is always allowed. Reading another user's
  // files needs curriculum manage or system manage, not view alone, so a
  // view-only role cannot enumerate PII by guessing paths.
  const canReadOthers =
    can(active, "academic:manage-curriculum") || can(active, "system:manage");
  if (!isOwnFile && !canReadOthers) {
    await logAudit({
      action: "file-deny",
      actor: { email: session.user.email, id: session.user.id, role: active },
      after: { blocked: true, path: firstSegment, reason: "scope-denied" },
      before: null,
      entity: "file",
      entityId: null,
    });
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const bytes = await readStoredFile(relativePath);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Cache-Control": "private, max-age=60",
        "Content-Length": String(bytes.length),
        "Content-Type": contentTypeFor(relativePath),
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
};
