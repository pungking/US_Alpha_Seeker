import * as Sentry from "@sentry/react";

let initialized = false;

const toNumber = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const readClientEnv = (key: string): string => {
  try {
    return String(((import.meta as any)?.env?.[key] ?? "") || "").trim();
  } catch {
    return "";
  }
};

const computeRelease = (): string | undefined => {
  const release = readClientEnv("VITE_SENTRY_RELEASE") || readClientEnv("VITE_APP_RELEASE");
  return release || undefined;
};

export const initSentryClient = (): boolean => {
  if (initialized) return true;

  const dsn = readClientEnv("VITE_SENTRY_DSN");
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: readClientEnv("VITE_SENTRY_ENVIRONMENT") || readClientEnv("MODE") || "development",
    release: computeRelease(),
    tracesSampleRate: toNumber(readClientEnv("VITE_SENTRY_TRACES_SAMPLE_RATE"), 0.05),
    // Replay is disabled by default and can be enabled by env when needed.
    replaysSessionSampleRate: toNumber(readClientEnv("VITE_SENTRY_REPLAY_SAMPLE_RATE"), 0),
    replaysOnErrorSampleRate: toNumber(readClientEnv("VITE_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE"), 1)
  });

  initialized = true;
  return true;
};

export const captureClientException = (error: unknown, context: Record<string, unknown> = {}) => {
  if (!initialized) {
    const ok = initSentryClient();
    if (!ok) return;
  }
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      scope.setExtra(key, value as any);
    }
    if (error instanceof Error) {
      Sentry.captureException(error);
      return;
    }
    Sentry.captureException(new Error(String(error)));
  });
};
