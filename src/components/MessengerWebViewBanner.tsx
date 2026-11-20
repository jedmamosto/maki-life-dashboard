"use client";

import { useState, useSyncExternalStore } from "react";
import { ExternalLink, X } from "lucide-react";
import { UI_COPY } from "@/lib/copy";
import { isMessengerInAppBrowser } from "./care-client";

const WEBVIEW_DISMISS_KEY = "maki_webview_banner_dismissed";
const subscribeNoop = () => () => {};

export function MessengerWebViewBanner() {
  const [dismissedNow, setDismissedNow] = useState(false);

  const shouldShowBanner = useSyncExternalStore(
    subscribeNoop,
    () => {
      try {
        const dismissed =
          window.sessionStorage.getItem(WEBVIEW_DISMISS_KEY) === "1";
        return !dismissed && isMessengerInAppBrowser();
      } catch {
        return isMessengerInAppBrowser();
      }
    },
    () => false
  );

  if (dismissedNow || !shouldShowBanner) {
    return null;
  }

  const handleDismiss = () => {
    setDismissedNow(true);
    try {
      window.sessionStorage.setItem(WEBVIEW_DISMISS_KEY, "1");
    } catch {
      // Ignore sessionStorage failures
    }
  };

  return (
    <section
      aria-label={UI_COPY.webViewBanner.title}
      data-testid="messenger-webview-banner"
      className="rounded-[16px] border border-[var(--webview-border)] bg-[var(--webview-bg)] p-4 text-[var(--ink-primary)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white border border-[var(--webview-border)] text-[var(--webview-text)]"
          >
            <ExternalLink className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-[var(--webview-text)]">
              {UI_COPY.webViewBanner.title}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-primary)] leading-snug">
              {UI_COPY.webViewBanner.body}
            </p>
            <p className="mt-1 text-xs font-medium text-[var(--ink-secondary)]">
              {UI_COPY.webViewBanner.openHint}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={UI_COPY.webViewBanner.dismissLabel}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-[var(--webview-text)] hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--webview-text)]"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-[var(--webview-border)] bg-white px-4 text-sm font-semibold text-[var(--webview-text)] hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--webview-text)]"
        >
          {UI_COPY.webViewBanner.dismissLabel}
        </button>
      </div>
    </section>
  );
}
