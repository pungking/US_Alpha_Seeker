import * as Sentry from "@sentry/react";

let initialized = false;

type SentryTagValue = string | number | boolean;
type CaptureLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";

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

const applyScopeContext = (
  scope: Sentry.Scope,
  context: Record<string, unknown>,
  tags: Record<string, SentryTagValue>
) => {
  for (const [key, value] of Object.entries(context)) {
    scope.setExtra(key, value as any);
  }
  for (const [key, value] of Object.entries(tags)) {
    scope.setTag(key, String(value));
  }
};

export const captureClientException = (
  error: unknown,
  context: Record<string, unknown> = {},
  tags: Record<string, SentryTagValue> = {}
) => {
  if (!initialized) {
    const ok = initSentryClient();
    if (!ok) return;
  }
  Sentry.withScope((scope) => {
    applyScopeContext(scope, context, tags);
    if (error instanceof Error) {
      Sentry.captureException(error);
      return;
    }
    Sentry.captureException(new Error(String(error)));
  });
};

export const captureClientMessage = (
  message: string,
  context: Record<string, unknown> = {},
  tags: Record<string, SentryTagValue> = {},
  level: CaptureLevel = "info"
) => {
  if (!initialized) {
    const ok = initSentryClient();
    if (!ok) return;
  }
  Sentry.withScope((scope) => {
    applyScopeContext(scope, context, tags);
    scope.setLevel(level as any);
    Sentry.captureMessage(message);
  });
};

export const flushClientEvents = async (timeoutMs = 2000): Promise<boolean> => {
  if (!initialized) {
    const ok = initSentryClient();
    if (!ok) return false;
  }
  try {
    return await Sentry.flush(timeoutMs);
  } catch {
    return false;
  }
};
