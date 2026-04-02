import * as Sentry from "@sentry/node";

let initialized = false;

const env = (name, fallback = "") => String(process.env[name] ?? fallback).trim();

const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const initServerSentry = () => {
  if (initialized) return true;
  const dsn = env("SENTRY_DSN");
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: env("SENTRY_ENVIRONMENT", env("VERCEL_ENV", "development")),
    release: env("SENTRY_RELEASE", env("VERCEL_GIT_COMMIT_SHA")),
    tracesSampleRate: toNumber(env("SENTRY_TRACES_SAMPLE_RATE", "0.05"), 0.05)
  });
  initialized = true;
  return true;
};

const normalizeError = (error) => {
  if (error instanceof Error) return error;
  return new Error(String(error));
};

export const captureApiError = (error, context = {}) => {
  if (!initServerSentry()) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      if (value == null) continue;
      scope.setExtra(key, value);
    }
    Sentry.captureException(normalizeError(error));
  });
};

export const withSentryApi = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    captureApiError(error, {
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
