#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const OUT_JSON = 'state/stage-artifact-export-audit.json';
const OUT_MD = 'state/stage-artifact-export-audit.md';

const STAGES = [
  {
    stage: 'Stage3',
    folderEnv: 'STAGE_ARTIFACT_EXPORT_STAGE3_FOLDER',
    folderName: 'Stage3_Fundamental_Data',
    prefix: 'STAGE3_FUNDAMENTAL_FULL_',
    outDir: 'state/stage3-audit-source'
  },
  {
    stage: 'Stage4',
    folderEnv: 'STAGE_ARTIFACT_EXPORT_STAGE4_FOLDER',
    folderName: 'Stage4_Technical_Data',
    prefix: 'STAGE4_TECHNICAL_FULL_',
    outDir: 'state/stage4-audit-source'
  },
  {
    stage: 'Stage5',
    folderEnv: 'STAGE_ARTIFACT_EXPORT_STAGE5_FOLDER',
    folderName: 'Stage5_ICT_Data',
    prefix: 'STAGE5_ICT_ELITE_50_',
    outDir: 'state/stage5-audit-source'
  },
  {
    stage: 'Stage6',
    folderEnv: 'STAGE_ARTIFACT_EXPORT_STAGE6_FOLDER',
    folderName: 'Stage6_Alpha_Final',
    prefix: 'STAGE6_ALPHA_FINAL_',
    outDir: 'state/stage6-audit-source'
  }
];

function resolveRepo(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(ROOT, filePath);
}

function ensureDir(dirPath) {
  fs.mkdirSync(resolveRepo(dirPath), { recursive: true });
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(resolveRepo(filePath)), { recursive: true });
}

function writeTextAtomic(filePath, text) {
  const fullPath = resolveRepo(filePath);
  ensureParent(fullPath);
  const tmpPath = `${fullPath}.tmp`;
  fs.writeFileSync(tmpPath, text, 'utf8');
  fs.renameSync(tmpPath, fullPath);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function redactError(error) {
  const msg = String(error?.message || error || 'unknown_error');
  return msg
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
    .replace(/access_token["'=:\s]+[A-Za-z0-9._\-]+/gi, 'access_token=[REDACTED]')
    .slice(0, 500);
}

async function refreshGoogleAccessToken() {
  const clientId = process.env.GDRIVE_CLIENT_ID;
  const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, reason: 'missing_oauth_env', token: null };
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.access_token) {
    throw new Error(`google_token_refresh_failed(${response.status})`);
  }
  return { ok: true, reason: 'ok', token: json.access_token };
}

async function driveList(token, query, fields, orderBy = 'modifiedTime desc', pageSize = 10) {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', fields);
  url.searchParams.set('orderBy', orderBy);
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`drive_list_failed(${response.status}): ${JSON.stringify(json).slice(0, 240)}`);
  }
  return Array.isArray(json.files) ? json.files : [];
}

async function driveDownloadText(token, fileId, label) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`drive_download_failed(${response.status}): ${label}`);
  return text;
}

async function findStageFolder(token, rootFolderId, stage) {
  const folderName = process.env[stage.folderEnv] || stage.folderName;
  const query = `name = '${folderName.replace(/'/g, "\\'")}' and '${rootFolderId}' in parents and trashed = false and mimeType = '${FOLDER_MIME}'`;
  const folders = await driveList(token, query, 'files(id,name,modifiedTime)', 'modifiedTime desc', 5);
  return folders[0] || null;
}

async function exportStage(token, rootFolderId, stage, limit) {
  const folder = await findStageFolder(token, rootFolderId, stage);
  if (!folder?.id) {
    return { stage: stage.stage, status: 'missing_folder', folderName: process.env[stage.folderEnv] || stage.folderName, downloaded: [] };
  }
  const query = `name contains '${stage.prefix}' and '${folder.id}' in parents and trashed = false`;
  const files = await driveList(token, query, 'files(id,name,createdTime,modifiedTime,size)', 'createdTime desc', limit);
  ensureDir(stage.outDir);
  const downloaded = [];
  for (const file of files) {
    const text = await driveDownloadText(token, file.id, file.name);
    JSON.parse(text);
    const outPath = resolveRepo(path.join(stage.outDir, file.name));
    fs.writeFileSync(outPath, text, 'utf8');
    downloaded.push({
      id: file.id,
      name: file.name,
      createdTime: file.createdTime || null,
      modifiedTime: file.modifiedTime || null,
      size: file.size || null,
      sha256: sha256(text),
      path: path.relative(ROOT, outPath)
    });
  }
  return {
    stage: stage.stage,
    requestedLimit: limit,
    status: downloaded.length ? 'downloaded' : 'missing_files',
    folderName: folder.name,
    folderId: folder.id,
    downloaded
  };
}

function buildMarkdown(report) {
  const lines = [
    '# Stage Artifact Export Audit',
    '',
    `- GeneratedAt: ${report.generatedAt}`,
    `- Overall: **${report.overall}**`,
    '- Safety: read-only Google Drive download; no Drive write; no broker/state mutation.',
    '',
    '| Stage | Status | Downloaded | Latest File | Latest Hash |',
    '| --- | --- | ---: | --- | --- |'
  ];
  for (const stage of report.stages) {
    const latest = stage.downloaded?.[0] || null;
    lines.push(`| ${stage.stage} | ${stage.status} | ${stage.downloaded?.length || 0} | ${latest?.name || 'N/A'} | ${latest?.sha256 ? latest.sha256.slice(0, 12) : 'N/A'} |`);
  }
  if (report.errors.length) {
    lines.push('', '## Errors', '', '| Stage | Error |', '| --- | --- |');
    for (const error of report.errors) lines.push(`| ${error.stage || 'global'} | ${String(error.error || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('', '## Usage', '', '- Use the downloaded files as `state/stage3-audit-source`, `state/stage4-audit-source`, `state/stage5-audit-source`, and `state/stage6-audit-source` inputs for Stage3-5 methodology audits.', '- This export is evidence-only and must not change Stage scoring or execution behavior.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const strict = String(process.env.STAGE_ARTIFACT_EXPORT_STRICT || 'false').toLowerCase() === 'true';
  const enabled = String(process.env.STAGE_ARTIFACT_EXPORT_ENABLED || 'true').toLowerCase() !== 'false';
  const rootFolderId = process.env.GDRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  const limit = Math.max(1, Math.min(10, Number(process.env.STAGE_ARTIFACT_EXPORT_LIMIT || 1) || 1));
  const stage4Limit = Math.max(1, Math.min(10, Number(process.env.STAGE_ARTIFACT_EXPORT_STAGE4_LIMIT || limit) || limit));
  const stage6Limit = Math.max(1, Math.min(60, Number(process.env.STAGE_ARTIFACT_EXPORT_STAGE6_LIMIT || limit) || limit));
  const report = { generatedAt, overall: 'unknown', enabled, limit, stage4Limit, stage6Limit, stages: [], errors: [], safety: { driveWrite: false, brokerMutation: false, stateMutation: false } };

  try {
    if (!enabled) {
      report.overall = 'skipped_disabled';
    } else if (!rootFolderId) {
      report.overall = 'skipped_missing_root_folder';
    } else {
      const tokenResult = await refreshGoogleAccessToken();
      if (!tokenResult.ok || !tokenResult.token) {
        report.overall = `skipped_${tokenResult.reason}`;
      } else {
        for (const stage of STAGES) {
          try {
            const stageLimit = stage.stage === 'Stage6' ? stage6Limit : stage.stage === 'Stage4' ? stage4Limit : limit;
            report.stages.push(await exportStage(tokenResult.token, rootFolderId, stage, stageLimit));
          } catch (error) {
            report.errors.push({ stage: stage.stage, error: redactError(error) });
            report.stages.push({ stage: stage.stage, status: 'error', downloaded: [] });
          }
        }
        const downloadedStages = report.stages.filter((stage) => stage.status === 'downloaded').length;
        report.overall = downloadedStages === STAGES.length
          ? 'pass_downloaded_all_stage_artifacts'
          : downloadedStages > 0
            ? 'partial_stage_artifact_export'
            : 'fail_no_stage_artifacts_downloaded';
      }
    }
  } catch (error) {
    report.overall = 'error_stage_artifact_export_failed';
    report.errors.push({ stage: 'global', error: redactError(error) });
  }

  writeTextAtomic(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  writeTextAtomic(OUT_MD, buildMarkdown(report));
  console.log(`[STAGE_ARTIFACT_EXPORT] overall=${report.overall} stages=${report.stages.length} errors=${report.errors.length} json=${OUT_JSON}`);
  if (strict && (report.overall.startsWith('fail') || report.overall.startsWith('error') || report.overall.startsWith('partial'))) process.exit(1);
}

main().catch((error) => {
  const report = {
    generatedAt: new Date().toISOString(),
    overall: 'error_unhandled_stage_artifact_export',
    stages: [],
    errors: [{ stage: 'global', error: redactError(error) }],
    safety: { driveWrite: false, brokerMutation: false, stateMutation: false }
  };
  writeTextAtomic(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  writeTextAtomic(OUT_MD, buildMarkdown(report));
  console.error(`[STAGE_ARTIFACT_EXPORT] ${redactError(error)}`);
  if (String(process.env.STAGE_ARTIFACT_EXPORT_STRICT || 'false').toLowerCase() === 'true') process.exit(1);
});
