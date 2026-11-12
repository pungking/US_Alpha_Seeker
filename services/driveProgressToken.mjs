// Browser-only, fail-closed token snapshot. Called for EACH new Drive progress request.
// A token captured by a React render or setInterval closure must not be reused after rotation.
// No refresh, network or global state mutation is performed here.
export function currentDriveProgressToken(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const value = storage.getItem('gdrive_access_token');
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}
