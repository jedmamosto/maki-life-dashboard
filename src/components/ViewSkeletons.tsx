import { UI_COPY } from "@/lib/copy";

export function BoardLoadingSkeleton() {
  return (
    <div
      className="min-h-screen bg-[var(--bg-canvas)] safe-top safe-bottom"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{UI_COPY.syncStates.loadingDashboard}</span>
      <div className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="h-7 w-36 animate-pulse rounded-[8px] bg-[var(--bg-subtle)]" />
          <div className="h-11 w-28 animate-pulse rounded-full bg-[var(--bg-subtle)]" />
        </div>
      </div>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        <div className="h-24 w-full animate-pulse rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)]" />
        <div className="space-y-3">
          <div className="h-40 w-full animate-pulse rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)]" />
          <div className="h-40 w-full animate-pulse rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)]" />
          <div className="h-40 w-full animate-pulse rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)]" />
          <div className="h-40 w-full animate-pulse rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)]" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 animate-pulse rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)]" />
          <div className="h-28 animate-pulse rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)]" />
        </div>
        <div className="h-36 w-full animate-pulse rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)]" />
      </main>
    </div>
  );
}

export function OwnerLoadingSkeleton() {
  return (
    <div
      className="min-h-screen bg-[var(--bg-canvas)] safe-top safe-bottom"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{UI_COPY.syncStates.loadingDashboard}</span>
      <div className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="h-7 w-40 animate-pulse rounded-[8px] bg-[var(--bg-subtle)]" />
          <div className="h-11 w-28 animate-pulse rounded-full bg-[var(--bg-subtle)]" />
        </div>
      </div>
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-5">
        <div className="h-40 w-full animate-pulse rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)]" />
        <div className="h-36 w-full animate-pulse rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)]" />
        <div className="h-64 w-full animate-pulse rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)]" />
      </main>
    </div>
  );
}

export function SimplePageSkeleton() {
  return (
    <div
      className="min-h-screen bg-[var(--bg-canvas)] safe-top safe-bottom"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{UI_COPY.syncStates.loadingDashboard}</span>
      <div className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="h-7 w-36 animate-pulse rounded-[8px] bg-[var(--bg-subtle)]" />
          <div className="h-11 w-24 animate-pulse rounded-full bg-[var(--bg-subtle)]" />
        </div>
      </div>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        <div className="h-28 w-full animate-pulse rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)]" />
        <div className="h-52 w-full animate-pulse rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)]" />
      </main>
    </div>
  );
}
