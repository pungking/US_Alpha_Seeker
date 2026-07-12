#!/usr/bin/env node
import fs from 'node:fs';

const universe = fs.readFileSync('components/UniverseGathering.tsx', 'utf8');
const stage6 = fs.readFileSync('components/AlphaAnalysis.tsx', 'utf8');

for (const token of [
  'targetMeanPriceSource: root.targetMeanPriceSource',
  'targetMeanPriceRetrievedAt: root.targetMeanPriceRetrievedAt',
  'targetMeanPriceAsOf: root.targetMeanPriceAsOf',
  'targetMeanPriceAsOfStatus: root.targetMeanPriceAsOfStatus'
]) {
  if (!universe.includes(token)) throw new Error(`Stage0 target lineage propagation missing: ${token}`);
}

for (const token of ['item?.targetMeanPriceRetrievedAt', 'item?.targetMeanPriceAsOfStatus']) {
  if (!stage6.includes(token)) throw new Error(`Stage6 target lineage consumption missing: ${token}`);
}

console.log('[TARGET_LINEAGE_PIPELINE] PASS');
