import type { Metadata } from "next";
import Image from "next/image";
import { CrownIcon } from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "Zenith Crown Academy" },
};

const Page = () => {
  return (
    <main className="flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center px-6 py-16 text-center">
      <Image
        src={"/logo-mark.png"}
        alt={"Zenith Crown Academy crown and graduation cap mark"}
        width={954}
        height={561}
        priority
        className="h-36 w-auto drop-shadow-[0_20px_45px_oklch(0.258_0.036_158.6/0.3)] sm:h-44"
      />
      <h1 className="font-heading text-foreground mt-10 text-4xl font-extrabold tracking-tight sm:text-5xl">
        Zenith Crown{" "}
        <span className="text-muted-foreground font-bold">Academy</span>
      </h1>
      <div
        className="mt-6 flex items-center gap-3"
        aria-hidden={true}>
        <span className="to-border h-px w-12 bg-gradient-to-r from-transparent" />
        <CrownIcon className="text-primary size-5" />
        <span className="to-border h-px w-12 bg-gradient-to-l from-transparent" />
      </div>
      <p className="text-muted-foreground mt-6 max-w-xl text-sm text-balance sm:text-base">
        Where ambitious students rise to the highest point of their learning,
        and every milestone is crowned with distinction.
      </p>
    </main>
  );
};

export default Page;
