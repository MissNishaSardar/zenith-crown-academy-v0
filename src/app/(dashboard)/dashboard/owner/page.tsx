import type { Metadata } from "next";

import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Owner",
};

const OwnerPage = async () => {
  await requireRole("owner");

  return (
    <main className={"flex flex-1 items-center justify-center px-6 py-16"}>
      <h1
        className={
          "font-heading text-foreground text-3xl font-bold tracking-tight"
        }>
        Owner workspace
      </h1>
    </main>
  );
};

export default OwnerPage;
