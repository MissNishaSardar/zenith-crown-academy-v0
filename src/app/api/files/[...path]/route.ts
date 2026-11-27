import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
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
