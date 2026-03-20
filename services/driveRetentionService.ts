import { GOOGLE_DRIVE_TARGET } from "../constants";

const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

const STAGE_RETENTION_FOLDER_NAMES = [
  GOOGLE_DRIVE_TARGET.targetSubFolder, // Stage 0
  GOOGLE_DRIVE_TARGET.stage1SubFolder, // Stage 1
  GOOGLE_DRIVE_TARGET.stage2SubFolder, // Stage 2
  GOOGLE_DRIVE_TARGET.stage3SubFolder, // Stage 3
  GOOGLE_DRIVE_TARGET.stage4SubFolder, // Stage 4
  GOOGLE_DRIVE_TARGET.stage5SubFolder, // Stage 5
  GOOGLE_DRIVE_TARGET.stage6SubFolder  // Stage 6
];

export interface DriveRetentionResult {
  folderName: string;
  folderId: string | null;
  scanned: number;
  deleted: number;
  failed: number;
  dryRun: boolean;
  message?: string;
}

export interface DriveRetentionSummary {
  cutoffIso: string;
  days: number;
  dryRun: boolean;
  folders: DriveRetentionResult[];
  totalScanned: number;
  totalDeleted: number;
  totalFailed: number;
}

type RetentionOptions = {
  days?: number;
  dryRun?: boolean;
};

const clampRetentionDays = (value: any, fallback = 30): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(365, Math.max(1, Math.floor(parsed)));
};

const computeCutoffIso = (days: number): string => {
  const now = Date.now();
  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
};

const fetchDriveJson = async (token: string, url: string): Promise<any> => {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Drive list failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
};

const resolveFolderId = async (token: string, folderName: string): Promise<string | null> => {
  const q = encodeURIComponent(
    `name = '${folderName}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false and mimeType = '${FOLDER_MIME_TYPE}'`
  );
  const url =
    `${DRIVE_FILES_API}?q=${q}&fields=files(id,name)` +
    `&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const json = await fetchDriveJson(token, url);
  return json?.files?.[0]?.id || null;
};

const listExpiredFiles = async (token: string, folderId: string, cutoffIso: string): Promise<any[]> => {
  const allFiles: any[] = [];
  let pageToken = "";

  do {
    const q = encodeURIComponent(
      `'${folderId}' in parents and trashed = false and modifiedTime < '${cutoffIso}' and mimeType != '${FOLDER_MIME_TYPE}'`
    );
    const url =
      `${DRIVE_FILES_API}?q=${q}` +
      `&fields=nextPageToken,files(id,name,modifiedTime,mimeType)` +
      `&orderBy=modifiedTime asc&pageSize=1000` +
      `&supportsAllDrives=true&includeItemsFromAllDrives=true` +
      `${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const json = await fetchDriveJson(token, url);
    const files = Array.isArray(json?.files) ? json.files : [];
    allFiles.push(...files);
    pageToken = json?.nextPageToken || "";
  } while (pageToken);

  return allFiles;
};

const trashFile = async (token: string, fileId: string): Promise<void> => {
  const res = await fetch(`${DRIVE_FILES_API}/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ trashed: true })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Drive trash failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
};

export async function enforceStageDriveRetention(
  token: string,
  options: RetentionOptions = {}
): Promise<DriveRetentionSummary> {
  const days = clampRetentionDays(options.days, 30);
  const dryRun = Boolean(options.dryRun);
  const cutoffIso = computeCutoffIso(days);

  const folderResults: DriveRetentionResult[] = [];

  for (const folderName of STAGE_RETENTION_FOLDER_NAMES) {
    const result: DriveRetentionResult = {
      folderName,
      folderId: null,
      scanned: 0,
      deleted: 0,
      failed: 0,
      dryRun
    };

    try {
      const folderId = await resolveFolderId(token, folderName);
      result.folderId = folderId;
      if (!folderId) {
        result.message = "folder_not_found";
        folderResults.push(result);
        continue;
      }

      const expiredFiles = await listExpiredFiles(token, folderId, cutoffIso);
      result.scanned = expiredFiles.length;

      if (!dryRun) {
        for (const file of expiredFiles) {
          try {
            await trashFile(token, String(file.id || ""));
            result.deleted += 1;
          } catch {
            result.failed += 1;
          }
        }
      }
    } catch (error: any) {
      result.message = String(error?.message || error || "unknown_error");
    }

    folderResults.push(result);
  }

  const summary: DriveRetentionSummary = {
    cutoffIso,
    days,
    dryRun,
    folders: folderResults,
    totalScanned: folderResults.reduce((acc, item) => acc + item.scanned, 0),
    totalDeleted: folderResults.reduce((acc, item) => acc + item.deleted, 0),
    totalFailed: folderResults.reduce((acc, item) => acc + item.failed, 0)
  };

  return summary;
}
