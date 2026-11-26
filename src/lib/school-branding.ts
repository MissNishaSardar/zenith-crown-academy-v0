import { cache } from "react";

import prisma from "@/lib/dbClient/prisma";
import {
  FALLBACK_LOGO_PATH,
  FALLBACK_SCHOOL_NAME,
} from "@/lib/school-branding-constants";

export { FALLBACK_LOGO_PATH, FALLBACK_SCHOOL_NAME };

export type SchoolBranding = {
  academicYear: string;
  address: string;
  email: string;
  id: string;
  logoPath: string | null;
  motto: string;
  phone: string;
  schoolName: string;
};

const emptyDefaults = {
  academicYear: "",
  address: "",
  email: "",
  logoPath: null,
  motto: "",
  phone: "",
  schoolName: "",
};

const toBranding = (row: {
  academicYear: string;
  address: string;
  email: string;
  id: string;
  logoPath: string | null;
  motto: string;
  phone: string;
  schoolName: string;
}): SchoolBranding => ({
  academicYear: row.academicYear,
  address: row.address,
  email: row.email,
  id: row.id,
  logoPath: row.logoPath,
  motto: row.motto,
  phone: row.phone,
  schoolName: row.schoolName,
});

export const ensureSchoolSettings = async (): Promise<SchoolBranding> => {
  const row = await prisma.schoolSettings.upsert({
    create: { ...emptyDefaults },
    update: {},
    where: { singleton: "global" },
  });
  return toBranding(row);
};

export const getSchoolBranding = cache(async (): Promise<SchoolBranding> => {
  const row = await prisma.schoolSettings.findFirst({
    where: { singleton: "global" },
  });
  if (!row) {
    return {
      academicYear: "",
      address: "",
      email: "",
      id: "",
      logoPath: null,
      motto: "",
      phone: "",
      schoolName: "",
    };
  }
  return toBranding(row);
});

export const displaySchoolName = (branding: SchoolBranding): string =>
  branding.schoolName.trim() === "" ?
    FALLBACK_SCHOOL_NAME
  : branding.schoolName;

export const displayLogoPath = (branding: SchoolBranding): string =>
  branding.logoPath && branding.logoPath.trim() !== "" ?
    branding.logoPath
  : FALLBACK_LOGO_PATH;
