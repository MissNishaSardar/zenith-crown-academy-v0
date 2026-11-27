import { can } from "@/lib/auth/permissions";
import prisma from "@/lib/dbClient/prisma";
import { logAudit } from "@/server/audit";
import { ForbiddenError, getFreshRoleContext } from "@/server/guards";

export type ScopeCheck = {
  classId: string;
  sectionId: string;
  subjectId?: string | undefined;
  userId: string;
  yearId: string;
};

const ACTIVE_ENROLLMENT = ["ENROLLED", "PROMOTED", "REPEATED"] as const;

export const assertTeacherScope = async (
  input: ScopeCheck,
): Promise<{ assignmentId: string | null; ok: true }> => {
  const { active } = await getFreshRoleContext(input.userId);
  const staff = await prisma.staffProfile.findFirst({
    select: { id: true, wardStudentId: true },
    where: { userId: input.userId },
  });
  if (staff?.wardStudentId) {
    const wardEnrollment = await prisma.enrollment.findFirst({
      select: { id: true },
      where: {
        classId: input.classId,
        sectionId: input.sectionId,
        status: { in: [...ACTIVE_ENROLLMENT] },
        studentId: staff.wardStudentId,
        yearId: input.yearId,
      },
    });
    const wardProfile =
      wardEnrollment ? null : (
        await prisma.studentProfile.findFirst({
          select: { id: true },
          where: {
            classId: input.classId,
            id: staff.wardStudentId,
            sectionId: input.sectionId,
            yearId: input.yearId,
          },
        })
      );
    if (wardEnrollment ?? wardProfile) {
      const actorRow = await prisma.user.findUnique({
        select: { email: true, id: true, role: true },
        where: { id: input.userId },
      });
      await logAudit({
        action: "permission-deny",
        actor: {
          email: actorRow?.email ?? null,
          id: input.userId,
          role: actorRow?.role ?? null,
        },
        after: {
          active: active ?? null,
          blocked: true,
          classId: input.classId,
          reason: "ward-conflict-whole-class",
          sectionId: input.sectionId,
        },
        before: null,
        entity: "permission",
        entityId: input.userId,
      });
      throw new ForbiddenError("teacher-scope");
    }
  }
  if (active && can(active, "academic:manage-curriculum")) {
    return { assignmentId: null, ok: true };
  }
  const assignments = await prisma.teacherAssignment.findMany({
    select: { id: true, sectionId: true },
    where: {
      classId: input.classId,
      isActive: true,
      teacherId: input.userId,
      yearId: input.yearId,
      ...(input.subjectId ? { subjectId: input.subjectId } : {}),
    },
  });
  const covering = assignments.find(
    (row) => row.sectionId === null || row.sectionId === input.sectionId,
  );
  if (!covering) {
    const actorRow = await prisma.user.findUnique({
      select: { email: true, id: true, role: true },
      where: { id: input.userId },
    });
    await logAudit({
      action: "permission-deny",
      actor: {
        email: actorRow?.email ?? null,
        id: input.userId,
        role: actorRow?.role ?? null,
      },
      after: {
        active: active ?? null,
        blocked: true,
        classId: input.classId,
        reason: "teacher-assignment-denied",
        sectionId: input.sectionId,
        subjectId: input.subjectId ?? null,
      },
      before: null,
      entity: "permission",
      entityId: input.userId,
    });
    throw new ForbiddenError("teacher-scope");
  }
  return { assignmentId: covering.id, ok: true };
};

export const isOfficeStaff = (active: string | null): boolean =>
  active === "office_staff";
