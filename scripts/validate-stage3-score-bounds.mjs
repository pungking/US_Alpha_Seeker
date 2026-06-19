#!/usr/bin/env node
import fs from 'node:fs';

const fixturePath = process.env.STAGE3_SCORE_BOUNDS_FIXTURE || 'docs/fixtures/stage3_score_bounds.fixture.json';
const producerPath = process.env.STAGE3_PRODUCER_FILE || 'components/FundamentalAnalysis.tsx';
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const producer = fs.readFileSync(producerPath, 'utf8');
const errors = [];

const clampScore = (value) => {
  const n = Number(value);
  const finite = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, finite));
};
const round2 = (value) => Number(Number(value).toFixed(2));

if (!/const\s+clampScore\s*=/.test(producer)) {
  errors.push('producer missing clampScore helper');
}
if (!/fundamentalScoreRawAfterSectorBonus[\s\S]*r\.fundamentalScore\s*=\s*clampScore\(fundamentalScoreRawAfterSectorBonus\)/.test(producer)) {
  errors.push('producer does not clamp fundamentalScore after sector/momentum bonus');
}
if (!/r\.compositeAlpha\s*=\s*clampScore\(/.test(producer)) {
  errors.push('producer does not clamp recalculated compositeAlpha');
}

const cases = Array.isArray(fixture.cases) ? fixture.cases : [];
if (!cases.length) errors.push('fixture has no cases');

for (const [idx, row] of cases.entries()) {
  const label = row.symbol || `case_${idx}`;
  const before = clampScore(row.fundamentalScoreBeforeSectorBonus);
  const rawAfter = before + Number(row.sectorScore || 0) + Number(row.sectorRankBonus || 0);
  const finalFundamentalScore = clampScore(rawAfter);
  const clampApplied = rawAfter !== finalFundamentalScore;
  const compositeAlpha = clampScore((clampScore(row.qualityScore) * 0.3) + (finalFundamentalScore * 0.7));

  if (finalFundamentalScore < 0 || finalFundamentalScore > 100) {
    errors.push(`${label}: final fundamentalScore outside 0-100`);
  }
  if (compositeAlpha < 0 || compositeAlpha > 100) {
    errors.push(`${label}: compositeAlpha outside 0-100`);
  }
  if (round2(finalFundamentalScore) !== round2(row.expectedFundamentalScore)) {
    errors.push(`${label}: expected fundamentalScore=${row.expectedFundamentalScore}, got ${round2(finalFundamentalScore)}`);
  }
  if (clampApplied !== Boolean(row.expectedClampApplied)) {
    errors.push(`${label}: expected clampApplied=${row.expectedClampApplied}, got ${clampApplied}`);
  }
  if (round2(compositeAlpha) !== round2(row.expectedCompositeAlpha)) {
    errors.push(`${label}: expected compositeAlpha=${row.expectedCompositeAlpha}, got ${round2(compositeAlpha)}`);
  }
}

if (errors.length) {
  console.error(`[STAGE3_SCORE_BOUNDS] FAIL ${errors.join('; ')}`);
  process.exit(1);
}
console.log(`[STAGE3_SCORE_BOUNDS] PASS cases=${cases.length} fixture=${fixturePath}`);
