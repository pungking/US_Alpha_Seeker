// Report-only Stage3/Harvester handoff verifier. This never dispatches or accesses Drive.
// The producer publishes the SHA-256 of the original serialized Stage3 bytes
// as trigger_content_sha256 (distinct from canonical trigger_sha256).
const SHA256 = /^[0-9a-f]{64}$/;

export function isVerifiedStage4ReadyHandoff(ready, expectedFile, expectedContentSha256) {
  return Boolean(
    ready && typeof ready === 'object' && !Array.isArray(ready)
    && typeof expectedFile === 'string' && expectedFile.length > 0
    && typeof expectedContentSha256 === 'string' && SHA256.test(expectedContentSha256)
    && ready.status === 'COMPLETED'
    && ready.trigger_file === expectedFile
    && ready.trigger_content_hash_basis === 'UTF8_JSON_BYTES'
    && ready.trigger_content_sha256 === expectedContentSha256
  );
}
