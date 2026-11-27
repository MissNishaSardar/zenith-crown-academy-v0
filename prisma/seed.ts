import "dotenv/config";

import { PrismaLibSql } from "@prisma/adapter-libsql";
import { generateRandomString, hashPassword } from "better-auth/crypto";

import { PrismaClient } from "@generated/prisma/client";

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});

const prisma = new PrismaClient({ adapter });

type SeedUser = {
  name: string;
  email: string;
  username: string;
  role: string;
};

const seedUsers: SeedUser[] = [
  {
    name: "Owner",
    email: "owner@gmail.com",
    username: "owner",
    role: "owner",
  },
  {
    name: "Administrator",
    email: "admin@gmail.com",
    username: "admin",
    role: "administrator",
  },
  {
    name: "Principal",
    email: "principal@gmail.com",
    username: "principal",
    role: "principal",
  },
  {
    name: "Vice Principal",
    email: "viceprincipal@gmail.com",
    username: "viceprincipal",
    role: "vice_principal",
  },
  {
    name: "Teacher",
    email: "teacher@gmail.com",
    username: "teacher",
    role: "teacher",
  },
  {
    name: "Teacher Parent",
    email: "teacherparent@gmail.com",
    username: "teacherparent",
    role: "teacher,parent",
  },
  {
    name: "Student One",
    email: "student1@gmail.com",
    username: "student1",
    role: "student",
  },
  {
    name: "Parent",
    email: "parent@gmail.com",
    username: "parent",
    role: "parent",
  },
  {
    name: "Accountant",
    email: "accountant@gmail.com",
    username: "accountant",
    role: "accountant",
  },
  {
    name: "Office Staff",
    email: "officestaff@gmail.com",
    username: "officestaff",
    role: "office_staff",
  },
  {
    name: "Librarian",
    email: "librarian@gmail.com",
    username: "librarian",
    role: "librarian",
  },
];

const roleLabels: Record<string, string> = {
  accountant: "Accountant",
  administrator: "Administrator",
  librarian: "Librarian",
  office_staff: "Office staff",
  owner: "Owner",
  parent: "Parent",
  principal: "Principal",
  student: "Student",
  teacher: "Teacher",
  vice_principal: "Vice principal",
};

const main = async () => {
  // Seed credentials are dev only. Seeded passwords are predictable (password equals email), so refuse to run in production.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed in production: seed passwords are predictable dev passwords. Set up real accounts through the admin flow instead.",
    );
  }

  for (const seedUser of seedUsers) {
    const passwordHash = await hashPassword(seedUser.email);
    const existing = await prisma.user.findUnique({
      where: { email: seedUser.email },
    });

    if (existing) {
      await prisma.user.update({
        where: { email: seedUser.email },
        data: {
          activeRole: seedUser.role.split(",")[0]?.trim() ?? "student",
          name: seedUser.name,
          username: seedUser.username,
          role: seedUser.role,
          emailVerified: true,
        },
      });

      const account = await prisma.account.findFirst({
        where: { userId: existing.id, providerId: "credential" },
      });

      if (account) {
        await prisma.account.update({
          where: { id: account.id },
          data: { password: passwordHash, accountId: existing.id },
        });
      } else {
        await prisma.account.create({
          data: {
            id: generateRandomString(32),
            accountId: existing.id,
            providerId: "credential",
            userId: existing.id,
            password: passwordHash,
          },
        });
      }
    } else {
      const id = generateRandomString(32);
      await prisma.user.create({
        data: {
          id,
          name: seedUser.name,
          email: seedUser.email,
          emailVerified: true,
          role: seedUser.role,
          activeRole: seedUser.role.split(",")[0]?.trim() ?? "student",
          banned: false,
          username: seedUser.username,
          accounts: {
            create: {
              id: generateRandomString(32),
              accountId: id,
              providerId: "credential",
              password: passwordHash,
            },
          },
        },
      });
    }

    console.log(`Seeded ${seedUser.email} as ${seedUser.role}`);
  }

  for (const slug of Object.keys(roleLabels)) {
    await prisma.role.upsert({
      create: { label: roleLabels[slug] ?? slug, slug },
      update: { label: roleLabels[slug] ?? slug },
      where: { slug },
    });
  }

  const users = await prisma.user.findMany({
    select: { id: true, role: true },
  });
  for (const user of users) {
    const held = user.role
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const slugs = held.length > 0 ? held : ["student"];
    for (const slug of slugs) {
      const roleRow = await prisma.role.findUnique({ where: { slug } });
      if (!roleRow) continue;
      await prisma.userRole.upsert({
        create: {
          isPrimary: slug === slugs[0],
          roleId: roleRow.id,
          userId: user.id,
        },
        update: {},
        where: { userId_roleId: { roleId: roleRow.id, userId: user.id } },
      });
    }
    const first = slugs[0] ?? "student";
    await prisma.user.update({
      data: { activeRole: first, role: slugs.join(",") },
      where: { id: user.id },
    });
  }

  const yearSeeds = [
    {
      endDate: new Date("2025-03-31T00:00:00"),
      name: "2024-2025",
      startDate: new Date("2024-04-01T00:00:00"),
      status: "CLOSED" as const,
    },
    {
      endDate: new Date("2026-03-31T00:00:00"),
      name: "2025-2026",
      startDate: new Date("2025-04-01T00:00:00"),
      status: "CURRENT" as const,
    },
    {
      endDate: new Date("2027-03-31T00:00:00"),
      name: "2026-2027",
      startDate: new Date("2026-04-01T00:00:00"),
      status: "UPCOMING" as const,
    },
  ];
  for (const year of yearSeeds) {
    await prisma.academicYear.upsert({
      create: {
        ...year,
        currentGuard: year.status === "CURRENT" ? "CURRENT" : null,
      },
      update: { endDate: year.endDate, startDate: year.startDate },
      where: { name: year.name },
    });
  }
  const currentCount = await prisma.academicYear.count({
    where: { status: "CURRENT" },
  });
  if (currentCount === 0) {
    const fallback = await prisma.academicYear.findUnique({
      where: { name: "2025-2026" },
    });
    if (fallback) {
      await prisma.academicYear.update({
        data: { currentGuard: "CURRENT", status: "CURRENT" },
        where: { id: fallback.id },
      });
    }
  }
  console.log("Seeded roles, user roles, and academic years");

  const classSeeds: {
    band:
      "PRE_PRIMARY" | "PRIMARY" | "MIDDLE" | "SECONDARY" | "SENIOR_SECONDARY";
    name: string;
    order: number;
  }[] = [
    { band: "PRE_PRIMARY", name: "Nursery", order: 1 },
    { band: "PRE_PRIMARY", name: "LKG", order: 2 },
    { band: "PRE_PRIMARY", name: "UKG", order: 3 },
    { band: "PRIMARY", name: "Class 1", order: 4 },
    { band: "PRIMARY", name: "Class 2", order: 5 },
    { band: "PRIMARY", name: "Class 3", order: 6 },
    { band: "PRIMARY", name: "Class 4", order: 7 },
    { band: "PRIMARY", name: "Class 5", order: 8 },
    { band: "MIDDLE", name: "Class 6", order: 9 },
    { band: "MIDDLE", name: "Class 7", order: 10 },
    { band: "MIDDLE", name: "Class 8", order: 11 },
    { band: "SECONDARY", name: "Class 9", order: 12 },
    { band: "SECONDARY", name: "Class 10", order: 13 },
    { band: "SENIOR_SECONDARY", name: "Class 11", order: 14 },
    { band: "SENIOR_SECONDARY", name: "Class 12", order: 15 },
  ];
  for (const schoolClass of classSeeds) {
    await prisma.schoolClass.upsert({
      create: { ...schoolClass, isActive: true },
      update: {
        band: schoolClass.band,
        isActive: true,
        order: schoolClass.order,
      },
      where: { name: schoolClass.name },
    });
  }
  console.log("Seeded 15 school classes");

  const currentYear =
    (await prisma.academicYear.findFirst({
      where: { status: "CURRENT" },
    })) ?? (await prisma.academicYear.findFirst());
  const class1 = await prisma.schoolClass.findUnique({
    where: { name: "Class 1" },
  });
  const class5 = await prisma.schoolClass.findUnique({
    where: { name: "Class 5" },
  });
  const class6 = await prisma.schoolClass.findUnique({
    where: { name: "Class 6" },
  });
  const teacherUser = await prisma.user.findUnique({
    where: { email: "teacher@gmail.com" },
  });
  const officeUser = await prisma.user.findUnique({
    where: { email: "officestaff@gmail.com" },
  });
  const parentUser = await prisma.user.findUnique({
    where: { email: "parent@gmail.com" },
  });
  const studentUser = await prisma.user.findUnique({
    where: { email: "student1@gmail.com" },
  });
  const teacherParentUser = await prisma.user.findUnique({
    where: { email: "teacherparent@gmail.com" },
  });
  const principalUser = await prisma.user.findUnique({
    where: { email: "principal@gmail.com" },
  });
  if (
    currentYear &&
    class1 &&
    class5 &&
    class6 &&
    teacherUser &&
    officeUser &&
    parentUser &&
    studentUser &&
    teacherParentUser &&
    principalUser
  ) {
    await prisma.staffProfile.upsert({
      create: {
        address: "12 School Road, Delhi",
        designation: "Assistant Teacher",
        email: "teacher@gmail.com",
        employeeId: "EMP001",
        firstName: "Meera",
        isActive: true,
        joiningDate: new Date("2023-06-01T00:00:00"),
        lastName: "Teacher",
        phone: "+91 9876500001",
        userId: teacherUser.id,
      },
      update: {
        address: "12 School Road, Delhi",
        designation: "Assistant Teacher",
        isActive: true,
        userId: teacherUser.id,
      },
      where: { employeeId: "EMP001" },
    });
    await prisma.staffProfile.upsert({
      create: {
        address: "14 School Road, Delhi",
        designation: "Office Assistant",
        email: "officestaff@gmail.com",
        employeeId: "EMP002",
        firstName: "Rohan",
        isActive: true,
        joiningDate: new Date("2024-04-01T00:00:00"),
        lastName: "Office",
        phone: "+91 9876500002",
        userId: officeUser.id,
      },
      update: {
        address: "14 School Road, Delhi",
        designation: "Office Assistant",
        isActive: true,
        userId: officeUser.id,
      },
      where: { employeeId: "EMP002" },
    });
    await prisma.staffProfile.upsert({
      create: {
        address: "7 Home Street, Delhi",
        designation: "Primary Teacher",
        email: "teacherparent@gmail.com",
        employeeId: "EMP003",
        firstName: "Anita",
        isActive: true,
        joiningDate: new Date("2022-06-01T00:00:00"),
        lastName: "Sharma",
        phone: "+91 9876510002",
        userId: teacherParentUser.id,
      },
      update: {
        address: "7 Home Street, Delhi",
        designation: "Primary Teacher",
        isActive: true,
        userId: teacherParentUser.id,
      },
      where: { employeeId: "EMP003" },
    });
    await prisma.guardian.upsert({
      create: {
        address: "7 Home Street, Delhi",
        email: "parent@gmail.com",
        name: "Ramesh Parent",
        phone: "+91 9876510001",
        relation: "FATHER",
        userId: parentUser.id,
      },
      update: {
        address: "7 Home Street, Delhi",
        name: "Ramesh Parent",
        phone: "+91 9876510001",
        relation: "FATHER",
      },
      where: { userId: parentUser.id },
    });
    await prisma.guardian.upsert({
      create: {
        address: "7 Home Street, Delhi",
        email: "teacherparent@gmail.com",
        name: "Anita Sharma",
        phone: "+91 9876510002",
        relation: "MOTHER",
        userId: teacherParentUser.id,
      },
      update: {
        address: "7 Home Street, Delhi",
        name: "Anita Sharma",
        phone: "+91 9876510002",
        relation: "MOTHER",
      },
      where: { userId: teacherParentUser.id },
    });
    const noLoginGuardian = await prisma.guardian.findFirst({
      where: { name: "Sunita Sharma", phone: "+91 9876510003" },
    });
    if (!noLoginGuardian) {
      await prisma.guardian.create({
        data: {
          address: "7 Home Street, Delhi",
          email: null,
          name: "Sunita Sharma",
          phone: "+91 9876510003",
          relation: "MOTHER",
          userId: null,
        },
      });
    }
    const yearPrefix = currentYear.name.trim();
    await prisma.studentProfile.upsert({
      create: {
        address: "7 Home Street, Delhi",
        admissionNo: `${yearPrefix}/001`,
        admissionStatus: "ACTIVE",
        classId: class1.id,
        dob: new Date("2018-05-10T00:00:00"),
        firstName: "Aarav",
        gender: "MALE",
        lastName: "Sharma",
        previousSchool: "Little Flowers Nursery",
        userId: null,
        yearId: currentYear.id,
      },
      update: {
        address: "7 Home Street, Delhi",
        classId: class1.id,
        firstName: "Aarav",
        lastName: "Sharma",
        userId: null,
        yearId: currentYear.id,
      },
      where: { admissionNo: `${yearPrefix}/001` },
    });
    await prisma.studentProfile.upsert({
      create: {
        address: "7 Home Street, Delhi",
        admissionNo: `${yearPrefix}/002`,
        admissionStatus: "ACTIVE",
        classId: class5.id,
        dob: new Date("2015-08-20T00:00:00"),
        firstName: "Diya",
        gender: "FEMALE",
        lastName: "Sharma",
        previousSchool: "City Primary",
        userId: null,
        yearId: currentYear.id,
      },
      update: {
        address: "7 Home Street, Delhi",
        classId: class5.id,
        firstName: "Diya",
        lastName: "Sharma",
        userId: null,
        yearId: currentYear.id,
      },
      where: { admissionNo: `${yearPrefix}/002` },
    });
    await prisma.studentProfile.upsert({
      create: {
        address: "9 Home Street, Delhi",
        admissionNo: `${yearPrefix}/003`,
        admissionStatus: "ACTIVE",
        classId: class6.id,
        dob: new Date("2014-03-15T00:00:00"),
        firstName: "Kabir",
        gender: "MALE",
        lastName: "Verma",
        previousSchool: "City Primary",
        userId: studentUser.id,
        yearId: currentYear.id,
      },
      update: {
        address: "9 Home Street, Delhi",
        classId: class6.id,
        firstName: "Kabir",
        lastName: "Verma",
        userId: studentUser.id,
        yearId: currentYear.id,
      },
      where: { admissionNo: `${yearPrefix}/003` },
    });
    const crosser = await prisma.studentProfile.findUnique({
      where: { admissionNo: `${yearPrefix}/002` },
    });
    const wardStaff = await prisma.staffProfile.findUnique({
      where: { employeeId: "EMP003" },
    });
    if (crosser && wardStaff) {
      await prisma.staffProfile.update({
        data: {
          wardDeclaredAt: new Date(),
          wardDeclaredBy: principalUser.id,
          wardNote: "HR declared ward",
          wardStudentId: crosser.id,
        },
        where: { id: wardStaff.id },
      });
    }
    console.log("Seeded staff, guardians, and students for B1");
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
