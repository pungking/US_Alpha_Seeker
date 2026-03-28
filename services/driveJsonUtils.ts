export const assertDriveOk = async (res: Response, context: string): Promise<void> => {
  if (res.ok) return;
  const errText = await res.text().catch(() => "");
  throw new Error(`Drive ${context} failed: HTTP ${res.status} ${errText.slice(0, 240)}`);
};

export const parseDriveJsonText = <T = any>(text: string): T => {
  const safeText = text
    .replace(/:\s*NaN/g, ": null")
    .replace(/:\s*Infinity/g, ": null")
    .replace(/:\s*-Infinity/g, ": null");
  return JSON.parse(safeText) as T;
};
