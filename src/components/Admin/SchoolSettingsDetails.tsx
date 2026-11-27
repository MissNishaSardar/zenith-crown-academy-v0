import { ImageIcon } from "lucide-react";
import Image from "next/image";

import type { schoolSettingsType } from "@/lib/zodSchema";

type SchoolSettingsDetailsProps = {
  logoPath: string | null;
  values: schoolSettingsType;
};

const displayOrEmpty = (value: string): string => {
  const trimmed = value.trim();
  return trimmed === "" ? "Not set yet" : trimmed;
};

const SchoolSettingsDetails = ({
  logoPath,
  values,
}: SchoolSettingsDetailsProps) => {
  const rows = [
    { label: "School name", value: displayOrEmpty(values.schoolName) },
    { label: "Motto", value: displayOrEmpty(values.motto) },
    { label: "Address", value: displayOrEmpty(values.address) },
    { label: "Phone", value: displayOrEmpty(values.phone) },
    { label: "Email address", value: displayOrEmpty(values.email) },
    { label: "Academic year", value: displayOrEmpty(values.academicYear) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-7 rounded-xl border p-7 sm:grid-cols-[168px_1fr]">
        <div>
          <div className="bg-muted flex size-32 items-center justify-center overflow-hidden rounded-xl border sm:size-[168px]">
            {logoPath ?
              <Image
                src={logoPath}
                alt="School logo"
                width={336}
                height={336}
                unoptimized
                priority
                className="h-full w-full object-contain"
              />
            : <ImageIcon
                aria-hidden="true"
                className="text-muted-foreground size-8"
              />
            }
          </div>
          <span className="text-muted-foreground mt-2.5 block text-center text-[11px]">
            Current logo
          </span>
        </div>
        <dl className="flex min-w-0 flex-col gap-4">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex flex-col gap-1 border-b pb-4 last:border-b-0 last:pb-0">
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {row.label}
              </dt>
              <dd className="text-foreground text-[15px] leading-relaxed break-words">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="bg-muted rounded-xl px-4 py-3 text-sm">
        Contact an administrator to update school profile and branding.
      </p>
    </div>
  );
};

export default SchoolSettingsDetails;
