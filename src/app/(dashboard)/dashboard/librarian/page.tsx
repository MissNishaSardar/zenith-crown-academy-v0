import type { Metadata } from "next";

import { requireRole } from "@/server/guards";

export const metadata: Metadata = {
  title: "Librarian",
};

const LibrarianPage = async () => {
  await requireRole("librarian");

  return (
    <main className={"flex flex-1 items-center justify-center px-6 py-16"}>
      <h1
        className={
          "font-heading text-foreground text-3xl font-bold tracking-tight"
        }>
        Librarian workspace
      </h1>
    </main>
  );
};

export default LibrarianPage;
