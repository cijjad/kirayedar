export function Loading() {
  return (
    <div aria-busy="true" className="space-y-3">
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-line" />
      <div className="h-32 animate-pulse rounded-2xl bg-line" />
    </div>
  );
}
