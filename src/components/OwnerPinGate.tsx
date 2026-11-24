"use client";

import { useState } from "react";
import { AlertCircle, Delete, Loader2, Lock } from "lucide-react";
import { UI_COPY } from "@/lib/copy";
import { CareApiError, apiFetch } from "./care-client";
import { MakiCatIcon } from "./MakiCatIcon";

interface OwnerPinGateProps {
  token: string;
  onUnlocked: () => Promise<void> | void;
}

export function OwnerPinGate({ token, onUnlocked }: OwnerPinGateProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submitPin = async (candidate: string) => {
    if (submitting) {
      return;
    }
    if (!/^\d{4}$/.test(candidate)) {
      setError(UI_COPY.ownerSettings.pinMalformed);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiFetch<{ ok?: boolean; unlocked?: boolean }>(
        token,
        "/api/owner/pin",
        {
          method: "POST",
          body: JSON.stringify({ pin: candidate }),
        }
      );
      await onUnlocked();
    } catch (err) {
      if (err instanceof CareApiError) {
        if (err.status === 400) {
          setError(UI_COPY.ownerSettings.pinMalformed);
        } else if (err.status === 429) {
          setError(UI_COPY.ownerSettings.pinLocked);
        } else {
          setError(UI_COPY.ownerSettings.pinWrong);
        }
      } else {
        setError(UI_COPY.syncStates.offlineBody);
      }
      setPin("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAppendDigit = (digit: string) => {
    if (submitting || pin.length >= 4) {
      return;
    }
    const next = `${pin}${digit}`;
    setPin(next);
    setError(null);
    if (next.length === 4) {
      void submitPin(next);
    }
  };

  const handleInputChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 4);
    setPin(digitsOnly);
    setError(null);
  };

  return (
    <section
      aria-labelledby="owner-pin-heading"
      data-testid="owner-pin-gate"
      className="mx-auto max-w-sm rounded-[16px] border border-[var(--border-hairline)] bg-[var(--bg-card)] p-5 sm:p-6"
    >
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--brand-border)] bg-[var(--brand-bg)]"
          >
            <MakiCatIcon className="h-7 w-7" />
          </span>
          <span
            aria-hidden="true"
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-hairline)] bg-[var(--bg-card)] text-[var(--brand-primary)]"
          >
            <Lock className="h-3 w-3" />
          </span>
        </div>
        <h1
          id="owner-pin-heading"
          className="mt-3 font-display text-2xl font-extrabold tracking-[-0.02em] text-[var(--ink-primary)]"
        >
          {UI_COPY.ownerSettings.pinTitle}
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">
          {UI_COPY.ownerSettings.pinSubtitle}
        </p>
      </div>

      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submitPin(pin);
        }}
      >
        <div>
          <label htmlFor="owner-pin-input" className="sr-only">
            {UI_COPY.ownerSettings.pinTitle}
          </label>
          <input
            id="owner-pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={pin}
            disabled={submitting}
            onChange={(e) => handleInputChange(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData
                .getData("text")
                .replace(/\D/g, "")
                .slice(0, 4);
              if (pasted) {
                e.preventDefault();
                setPin(pasted);
                setError(null);
                if (pasted.length === 4) {
                  void submitPin(pasted);
                }
              }
            }}
            placeholder="0000"
            data-testid="owner-pin-input"
            className="w-full min-h-[56px] rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-canvas)] px-4 text-center font-display text-2xl font-bold tracking-[0.5em] text-[var(--ink-primary)] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo-text)]"
          />
        </div>

        {error ? (
          <div
            role="alert"
            data-testid="owner-pin-error"
            className="flex items-start gap-2 rounded-[12px] border border-[var(--coral-border)] bg-[var(--coral-bg)] p-3 text-sm font-medium text-[var(--coral-strong)]"
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
        ) : null}

        <div
          className="grid grid-cols-3 gap-2.5"
          role="group"
          aria-label="PIN Keypad"
        >
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={submitting}
              onClick={() => handleAppendDigit(digit)}
              data-testid={`pin-key-${digit}`}
              className="min-h-[56px] min-w-[56px] rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-canvas)] font-display text-xl font-bold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo-text)] tabular-nums"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setPin("");
              setError(null);
            }}
            className="min-h-[56px] min-w-[56px] rounded-[12px] border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-sm font-bold text-[var(--ink-secondary)] hover:bg-[var(--border-hairline)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo-text)]"
          >
            Clear
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => handleAppendDigit("0")}
            data-testid="pin-key-0"
            className="min-h-[56px] min-w-[56px] rounded-[12px] border border-[var(--border-control)] bg-[var(--bg-canvas)] font-display text-xl font-bold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo-text)] tabular-nums"
          >
            0
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setPin((prev) => prev.slice(0, -1));
              setError(null);
            }}
            aria-label="Backspace"
            className="inline-flex min-h-[56px] min-w-[56px] items-center justify-center rounded-[12px] border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] hover:bg-[var(--border-hairline)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo-text)]"
          >
            <Delete className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <button
          type="submit"
          disabled={submitting}
          data-testid="owner-pin-submit"
          className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--brand-primary)] px-4 font-display text-base font-bold text-[var(--brand-on-primary)] hover:bg-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-offset-2 disabled:opacity-65 kitchen-transition"
        >
          {submitting ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : null}
          <span>Unlock Settings</span>
        </button>
      </form>
    </section>
  );
}
