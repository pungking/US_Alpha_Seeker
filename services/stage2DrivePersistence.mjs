import { hashBytesSha256 } from './stage0SourceEvidenceContract.mjs';

const fail = code => { throw new Error(`STAGE2_DRIVE_${code}`); };
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(id);
const root = 'https://www.googleapis.com/drive/v3/files';

// The deadline covers the response body too, not only receipt of HTTP headers.
async function request(fetchImpl, url, init, maxBytes) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); return { status: response.status }; }
    const reader = response.body?.getReader();
    if (!reader) fail('RESPONSE_INCOMPLETE');
    const chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); fail('RESPONSE_TOO_LARGE'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { status: response.status, bytes };
  } finally { clearTimeout(timer); }
}
const json = response => {
  if (response.status !== 200) fail('READ_NOT_CONFIRMED');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.bytes)); }
  catch { fail('RESPONSE_INVALID'); }
};

export async function persistStage2Artifact({ token, folderId, name, content }, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof token !== 'string' || !token || !validId(folderId) || typeof name !== 'string' || !name
    || !content || typeof content !== 'object') fail('INPUT_INVALID');
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(content, null, 2));
    // Drive multipart is for small files; larger payloads require a separate resumable contract.
    if (bytes.length > 5 * 1024 * 1024) fail('MULTIPART_SIZE_EXCEEDED');
    const contentSha256 = await hashBytesSha256(bytes), headers = { Authorization: `Bearer ${token}` };
    const generated = json(await request(fetchImpl, `${root}/generateIds?count=1&space=drive&type=files`, { headers }, 8192));
    if (!Array.isArray(generated.ids) || generated.ids.length !== 1 || !validId(generated.ids[0])) fail('ID_INVALID');
    const id = generated.ids[0], boundary = `stage2-${crypto.randomUUID()}`;
    const metadata = { id, name, parents: [folderId], mimeType: 'application/json' };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n`, bytes, `\r\n--${boundary}--`
    ], { type: `multipart/related; boundary=${boundary}` });
    let uploaded;
    try {
      uploaded = await request(fetchImpl, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'POST', headers: { ...headers, 'Content-Type': body.type }, body }, 8192);
    } catch { /* An uncertain create is reconciled by its reserved ID; never issue another POST. */ }
    if (uploaded && (uploaded.status < 200 || uploaded.status >= 300)
      && ![408, 409, 429].includes(uploaded.status) && uploaded.status < 500) fail('UPLOAD_REJECTED');
    const saved = json(await request(fetchImpl, `${root}/${id}?fields=id,name,parents,mimeType,trashed`, { headers }, 65536));
    if (saved.id !== id || saved.name !== name || saved.mimeType !== 'application/json' || saved.trashed !== false
      || !Array.isArray(saved.parents) || saved.parents.length !== 1 || saved.parents[0] !== folderId) fail('METADATA_MISMATCH');
    const stored = await request(fetchImpl, `${root}/${id}?alt=media`, { headers }, bytes.length);
    if (stored.status !== 200 || !stored.bytes || await hashBytesSha256(stored.bytes) !== contentSha256) fail('CONTENT_UNVERIFIED');
    return { status: 'STAGE2_PERSISTED_HASH_VERIFIED', contentSha256 };
  } catch (error) {
    if (/^STAGE2_DRIVE_[A-Z0-9_]+$/.test(error?.message || '')) throw error;
    fail('PERSISTENCE_UNCONFIRMED');
  }
}
