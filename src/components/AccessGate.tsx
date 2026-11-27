"use client";

import Image from "next/image";
import { Lock, RotateCcw } from "lucide-react";
import { UI_COPY } from "@/lib/copy";

interface AccessGateProps {
  canRetry?: boolean;
}

export function AccessGate({ canRetry = true }: AccessGateProps) {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] px-4 py-12 flex items-center justify-center safe-top safe-bottom">
      <main className="w-full max-w-md rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-card)] sunlit-card p-6 sm:p-8 text-center">
        <div className="relative mx-auto mb-5 w-fit rounded-[18px] border border-[var(--border-hairline)] bg-white p-1.5 sunlit-polaroid -rotate-1">
          <Image
            src="/maki/maki-suitcase.jpg"
            alt="Maki sitting inside an open purple suitcase"
            width={208}
            height={208}
            preload={true}
            className="h-24 w-24 rounded-[12px] object-cover object-[50%_35%]"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-hairline)] bg-[var(--bg-card)] text-[var(--brand-primary)] shadow-xs"
          >
            <Lock className="h-3.5 w-3.5" />
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-[var(--ink-primary)]">
          {UI_COPY.accessGate.title}
        </h1>
        <p className="mx-auto mt-3 max-w-prose text-base text-[var(--ink-secondary)] leading-relaxed">
          {UI_COPY.accessGate.body}
        </p>
        {canRetry ? (
          <button
            type="button"
            onClick={handleRetry}
            className="mt-6 inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-subtle)] px-5 font-display text-base font-semibold text-[var(--ink-primary)] hover:bg-[var(--border-hairline)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-offset-2 kitchen-transition"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>{UI_COPY.accessGate.retryLabel}</span>
          </button>
        ) : null}
      </main>
    </div>
  );
}
