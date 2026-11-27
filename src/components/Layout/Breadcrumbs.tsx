"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/shadcnui/breadcrumb";

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
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${index}-${item.label}`}>
              {index > 0 ?
                <BreadcrumbSeparator />
              : null}
              <BreadcrumbItem className="min-w-0">
                {item.href && !isLast ?
                  <BreadcrumbLink
                    className="min-w-0 truncate"
                    render={<Link href={item.href} />}>
                    {item.label}
                  </BreadcrumbLink>
                : <BreadcrumbPage className="min-w-0 truncate font-medium">
                    {item.label}
                  </BreadcrumbPage>
                }
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export default BreadcrumbProvider;
export { BreadcrumbTrail, Breadcrumbs };
