import Image from "next/image";

import { LayoutProps } from "@/lib/types";

type AuthCardProps = LayoutProps & {
  title: string;
  description?: string;
};

const AuthCard = ({ children, title, description }: AuthCardProps) => {
  return (
    <main className="grid min-h-svh place-items-center px-4 py-10 sm:px-6">
      <section className="bg-card text-card-foreground border-border w-full max-w-[428px] rounded-[22px] border p-7 shadow-2xl sm:p-[34px_30px_28px]">
        <div className="flex justify-center">
          <Image
            src="/logo-mark.png"
            alt="Zenith Crown Academy crown and graduation cap mark"
            width={954}
            height={561}
            priority
            style={{ width: "auto" }}
            className="h-16 w-auto drop-shadow-[0_12px_28px_oklch(0_0_0/0.45)]"
          />
        </div>
        <h1 className="font-heading mt-4 text-center text-[30px] leading-none font-extrabold tracking-tight">
          {title}
        </h1>
        {description ?
          <p className="text-muted-foreground mt-2.5 text-center text-sm leading-relaxed text-balance">
            {description}
          </p>
        : null}
        <div className="mt-6">{children}</div>
      </section>
    </main>
  );
};

export default AuthCard;
