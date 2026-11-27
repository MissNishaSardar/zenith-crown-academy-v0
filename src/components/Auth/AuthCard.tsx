import Image from "next/image";

import { LayoutProps } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcnui/card";

type AuthCardProps = LayoutProps & {
  title: string;
  description?: string;
  logoSrc: string;
  schoolName: string;
};

const AuthCard = ({
  children,
  title,
  description,
  logoSrc,
  schoolName,
}: AuthCardProps) => {
  return (
    <main className="grid min-h-svh place-items-center px-4 py-10 sm:px-6">
      <Card className="w-full max-w-[428px] rounded-[22px] shadow-2xl">
        <CardHeader className="items-center">
          <Image
            src={logoSrc}
            alt={`${schoolName} crown and graduation cap mark`}
            width={954}
            height={561}
            priority
            unoptimized
            className="h-16 w-auto justify-self-center drop-shadow-[0_12px_28px_oklch(0_0_0/0.45)]"
          />
          <CardTitle className="mt-4 text-center text-[30px] leading-none font-extrabold tracking-tight">
            {title}
          </CardTitle>
          {description ?
            <CardDescription className="mt-2.5 text-center text-sm leading-relaxed text-balance">
              {description}
            </CardDescription>
          : null}
        </CardHeader>
        <CardContent className="mt-6">{children}</CardContent>
      </Card>
    </main>
  );
};

export default AuthCard;
