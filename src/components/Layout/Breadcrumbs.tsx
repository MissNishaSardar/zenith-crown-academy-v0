"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type BreadcrumbItem = {
  href?: Route;
  label: string;
};

const BreadcrumbContext = createContext<{
  items: BreadcrumbItem[];
  setItems: (items: BreadcrumbItem[]) => void;
}>({
  items: [],
  setItems: () => {},
});

export const useBreadcrumbs = () => useContext(BreadcrumbContext);

const BreadcrumbProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<BreadcrumbItem[]>([]);
  return (
    <BreadcrumbContext.Provider value={{ items, setItems }}>
      {children}
    </BreadcrumbContext.Provider>
  );
};

const BreadcrumbTrail = ({ items }: { items: BreadcrumbItem[] }) => {
  const { setItems } = useBreadcrumbs();
  const serialized = JSON.stringify(items);

  useEffect(() => {
    setItems(JSON.parse(serialized) as BreadcrumbItem[]);
  }, [serialized, setItems]);

  return null;
};

const Breadcrumbs = () => {
  const { items } = useBreadcrumbs();

  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li
              key={`${index}-${item.label}`}
              className="flex min-w-0 items-center gap-1">
              {index > 0 ?
                <ChevronRight
                  aria-hidden="true"
                  className="text-muted-foreground size-4 shrink-0"
                />
              : null}
              {item.href && !isLast ?
                <Link
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground min-w-0 truncate transition-colors">
                  {item.label}
                </Link>
              : <span
                  aria-current="page"
                  className="text-foreground min-w-0 truncate font-medium">
                  {item.label}
                </span>
              }
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default BreadcrumbProvider;
export { BreadcrumbTrail, Breadcrumbs };
