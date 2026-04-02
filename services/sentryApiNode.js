let sentryModule = null;
let loadAttempted = false;
let initialized = false;

const env = (name, fallback = "") => String(process.env[name] ?? fallback).trim();

const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const loadSentry = async () => {
  if (loadAttempted) return sentryModule;
  loadAttempted = true;
  try {
    sentryModule = await import("@sentry/node");
  } catch (error) {
    // Sentry dependency/load errors should never crash API handlers.
    sentryModule = null;
  }
  return sentryModule;
};

const initServerSentry = async () => {
  const Sentry = await loadSentry();
  if (!Sentry) return null;
  if (initialized) return Sentry;

  const dsn = env("SENTRY_DSN");
  if (!dsn) return null;

  Sentry.init({
    dsn,
    environment: env("SENTRY_ENVIRONMENT", env("VERCEL_ENV", "development")),
    release: env("SENTRY_RELEASE", env("VERCEL_GIT_COMMIT_SHA")),
    tracesSampleRate: toNumber(env("SENTRY_TRACES_SAMPLE_RATE", "0.05"), 0.05)
  });
  initialized = true;
  return Sentry;
};

const normalizeError = (error) => {
  if (error instanceof Error) return error;
  return new Error(String(error));
};

export const captureApiError = async (error, context = {}) => {
  try {
    const Sentry = await initServerSentry();
    if (!Sentry) return;

    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        if (value == null) continue;
        scope.setExtra(key, value);
      }
      Sentry.captureException(normalizeError(error));
    });
  } catch {
    // No-op: never block API response path on observability failures.
  }
};

export const withSentryApi = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    await captureApiError(error, {
      source: "api_wrapper",
      method: req?.method || "UNKNOWN",
      url: req?.url || ""
    });
    if (res && !res.headersSent) {
      return res.status(500).json({
        error: "internal_server_error",
        message: String(error?.message || error)
      });
    }
    return undefined;
  }
};
