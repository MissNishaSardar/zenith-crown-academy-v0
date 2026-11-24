const UsersLoading = () => (
  <div
    aria-busy="true"
    aria-label="Loading users"
    className="flex flex-col gap-4">
    <div className="bg-muted/60 h-24 animate-pulse rounded-xl border" />
    <div className="overflow-hidden rounded-xl border">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          className="bg-muted/40 h-12 animate-pulse border-t first:border-t-0"
          key={index}
        />
      ))}
    </div>
  </div>
);

export default UsersLoading;
