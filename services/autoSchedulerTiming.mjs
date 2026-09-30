const EVENT_NAMES = new Set([
  ...Array.from({ length: 7 }, (_, n) => [`STAGE_${n}_ENTERED`, `STAGE_${n}_CALLBACK`]).flat(),
  'AUTOMATION_STARTED', 'AUTOMATION_ENDED', 'STAGE3_PERSISTED', 'HARVESTER_DISPATCHED',
  'STAGE4_READY_OBSERVED', 'STAGE6_PERSISTED', 'REPORT_PERSISTED',
  'TELEGRAM_STARTED', 'TELEGRAM_DELIVERED', 'SIDECAR_DISPATCH_ACCEPTED', 'SIDECAR_FALLBACK_ACCEPTED'
]);

export function utcTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'))
    ? new Date(ms).toISOString() : null;
}

export function sanitizeTimingEvents(events) {
  return Object.fromEntries([...EVENT_NAMES].flatMap(name => {
    const at = utcTimestamp(events?.[name]);
    return at ? [[name, at]] : [];
  }));
}

export function recordAutoTiming(name, at = new Date().toISOString()) {
  if (typeof window === 'undefined' || !window.__AUTO_TIMING || !EVENT_NAMES.has(name)) return;
  const timestamp = utcTimestamp(at);
  if (timestamp && !window.__AUTO_TIMING[name]) window.__AUTO_TIMING[name] = timestamp;
}

export function summarizeAutoTiming(input = {}) {
  const events = sanitizeTimingEvents(input.events);
  const times = Object.fromEntries(['scheduledFor', 'workflowCreatedAt', 'workflowStartedAt', 'completionDeadline']
    .map(key => [key, utcTimestamp(input[key])]));
  const invalidTimestamp = Object.keys(times).some(key => input[key] != null && !times[key])
    || [...EVENT_NAMES].some(key => input.events?.[key] != null && !events[key]);
  let invalidOrder = false;
  const seconds = (start, end) => {
    if (!start || !end) return null;
    const ms = Date.parse(end) - Date.parse(start);
    if (ms < 0) { invalidOrder = true; return null; }
    return ms / 1000;
  };
  const durationsSeconds = {
    scheduledToCreated: seconds(times.scheduledFor, times.workflowCreatedAt),
    createdToStarted: seconds(times.workflowCreatedAt, times.workflowStartedAt),
    automation: seconds(events.AUTOMATION_STARTED, events.AUTOMATION_ENDED),
    stage3PersistedToReadyObserved: seconds(events.STAGE3_PERSISTED, events.STAGE4_READY_OBSERVED),
    harvesterDispatchToReadyObserved: seconds(events.HARVESTER_DISPATCHED, events.STAGE4_READY_OBSERVED),
    stage6ToReport: seconds(events.STAGE6_PERSISTED, events.REPORT_PERSISTED),
    stage6ToTelegram: seconds(events.STAGE6_PERSISTED, events.TELEGRAM_DELIVERED),
    stage6ToSidecarDispatchAccepted: seconds(events.STAGE6_PERSISTED, events.SIDECAR_DISPATCH_ACCEPTED)
  };
  const stageIntervals = Array.from({ length: 7 }, (_, stage) => ({
    stage, enteredAt: events[`STAGE_${stage}_ENTERED`] || null,
    callbackAt: events[`STAGE_${stage}_CALLBACK`] || null,
    elapsedSeconds: seconds(events[`STAGE_${stage}_ENTERED`], events[`STAGE_${stage}_CALLBACK`])
  }));
  seconds(times.scheduledFor, times.completionDeadline);
  for (const at of Object.values(events)) seconds(times.workflowCreatedAt, at);
  return {
    schemaVersion: 'auto-scheduler-timing.v1', ...times, events, durationsSeconds, stageIntervals,
    integrityStatus: invalidTimestamp ? 'TIMESTAMP_INVALID' : invalidOrder ? 'TIMESTAMP_ORDER_INVALID' : 'OBSERVED_TIMESTAMPS_ONLY',
    deadlineStatus: invalidTimestamp || invalidOrder ? 'TIMING_CONTRACT_INVALID' : !times.completionDeadline ? 'DEADLINE_UNAVAILABLE'
      : !events.STAGE6_PERSISTED ? 'STAGE6_PERSISTENCE_UNOBSERVED'
        : events.STAGE6_PERSISTED <= times.completionDeadline ? 'STAGE6_PERSISTED_BY_CALLER_DEADLINE'
          : 'STAGE6_PERSISTED_AFTER_CALLER_DEADLINE',
    marketSessionEligibilityVerified: false,
    intervalBasis: 'BROWSER_STAGE_ENTRY_TO_CALLBACK_INCLUDING_IO_AND_HANDOFF_NOT_CPU_TIME',
    readyTimestampBasis: 'MATCHED_HANDSHAKE_OBSERVED_NOT_HARVESTER_PUBLICATION',
    policyImpact: 'NONE_REPORT_ONLY'
  };
}
