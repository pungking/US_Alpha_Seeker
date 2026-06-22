#!/usr/bin/env node
import fs from 'node:fs';

const sourcePath = 'components/IctAnalysis.tsx';
const text = fs.readFileSync(sourcePath, 'utf8');

const requiredSnippets = [
  'sourceStage4File: selectedStage4Name',
  'sourceStage4Timestamp: selectedStage4Timestamp',
  'sourceStage4SourceStage3File: stage4SourceStage3File',
  'sourceStage4FactorReady: selectedStage4FactorReady'
];

const missing = requiredSnippets.filter((snippet) => !text.includes(snippet));
const report = {
  generatedAt: new Date().toISOString(),
  overall: missing.length ? 'fail_stage5_lineage_contract_missing' : 'pass_stage5_lineage_contract',
  sourcePath,
  requiredSnippets,
  missing
};

fs.mkdirSync('state', { recursive: true });
fs.writeFileSync('state/stage5-lineage-contract-validation.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`[STAGE5_LINEAGE_CONTRACT] overall=${report.overall} missing=${missing.length}`);
if (missing.length) process.exit(1);
