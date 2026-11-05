import type { Metadata } from "next";

import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Parent",
};

const ParentPage = async () => {
  await requireRole("parent");

  return (
    <main className={"flex flex-1 items-center justify-center px-6 py-16"}>
      <h1
        className={
          "font-heading text-foreground text-3xl font-bold tracking-tight"
        }>
        Parent workspace
      </h1>
    </main>
  );
};

export default ParentPage;
