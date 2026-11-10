import { Skeleton } from "@/components/shadcnui/skeleton";

const DashboardLoading = () => {
  return (
    <main
      aria-busy="true"
      className="flex flex-1 items-center justify-center px-6 py-16">
      <h1 className="sr-only">Loading workspace</h1>
      <Skeleton className="h-9 w-72" />
    </main>
  );
};

export default DashboardLoading;
