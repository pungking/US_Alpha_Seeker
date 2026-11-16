// AS-INTEGRATION-61: offline GitHub artifact-to-run correlation only.
// Never claim exact producing attempt from Artifact REST metadata or unverified
// caller statements. No network, signatures, workflow changes or downloads.
const integer = v => Number.isSafeInteger(v) && v > 0;
const sha40 = v => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v);
const digest = v => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v);
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const iso = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(v) && Number.isFinite(Date.parse(v));
const result = (issues, correlation) => Object.freeze({
  schemaVersion:'github-artifact-attempt-origin-evidence-v1',
  issues:Object.freeze([...issues]),
  runCorrelation:correlation ? 'RUN_CORRELATED' : 'WITHHELD',
  producingAttempt:'UNPROVEN',
  attemptOriginEvidence:'NOT_AVAILABLE_FROM_ARTIFACT_REST',
  independentSignatureVerified:false,
  provenanceAttested:false,
  originAuthenticated:false,
  finalQualityJudgement:'withheld',
  actualDownloaderApproval:'HOLD',
  networkRequests:0
});
export function assessOfflineArtifactAttemptOrigin({
 repository, repositoryId, runId, runAttempt, commitSha, workflowId,
 run, attempt, artifact, attemptJobs
}={}) {
 const issues=[];
 const add = v => {if(!issues.includes(v)) issues.push(v);};
 if (typeof repository!=='string'||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
   || !integer(repositoryId)||!integer(runId)||!integer(runAttempt)
   || !sha40(commitSha)||!integer(workflowId)) add('INPUT_INVALID');
 if (!obj(run)||run.id!==runId||run.run_attempt!==runAttempt||run.workflow_id!==workflowId
   || run.head_sha!==commitSha||run.repository?.id!==repositoryId
   || run.repository?.full_name!==repository||run.status!=='completed'||run.conclusion!=='success')
   add('RUN_IDENTITY_MISMATCH');
 if (!obj(attempt)||attempt.id!==runId||attempt.run_attempt!==runAttempt
   || attempt.workflow_id!==workflowId||attempt.head_sha!==commitSha
   || attempt.status!=='completed'||attempt.conclusion!=='success')
   add('ATTEMPT_IDENTITY_MISMATCH');
 if (!obj(artifact)||!integer(artifact.id)||artifact.workflow_run?.id!==runId
   || artifact.workflow_run?.repository_id!==repositoryId
   || artifact.workflow_run?.head_repository_id!==repositoryId
   || artifact.workflow_run?.head_sha!==commitSha
   || artifact.expired!==false||!digest(artifact.digest))
   add('ARTIFACT_IDENTITY_MISMATCH');
 // A temporal overlap is a contradiction screen, NOT producer proof.
 // Require inclusive start/end bounds from the attempt response and at
 // least one matching job interval. All timestamps are forgeable input.
 const validWindow = (start,end) => iso(start)&&iso(end)
   && Date.parse(start)<=Date.parse(end);
 const attemptWindow=validWindow(attempt?.run_started_at,attempt?.updated_at);
 const artifactTime=iso(artifact?.created_at) ? Date.parse(artifact.created_at) : null;
 if (!attemptWindow||!iso(run?.created_at)||artifactTime===null
   || artifactTime<Date.parse(run.created_at)
   || artifactTime<Date.parse(attempt.run_started_at)
   || artifactTime>Date.parse(attempt.updated_at)) add('TIMELINE_UNVERIFIED');
 const jobsValid=Array.isArray(attemptJobs)&&attemptJobs.length>0
   && attemptJobs.every(j=>obj(j)&&integer(j.id)&&j.run_id===runId
     && j.head_sha===commitSha&&validWindow(j.started_at,j.completed_at));
 if (!jobsValid) add('ATTEMPT_JOBS_UNVERIFIED');
 // Job timestamps provide a narrower diagnostic window, but do not
 // identify which job uploaded any particular artifact.
 if (jobsValid && artifactTime!==null
   && !attemptJobs.some(j=>artifactTime>=Date.parse(j.started_at)
     && artifactTime<=Date.parse(j.completed_at))) add('TIMELINE_UNVERIFIED');
 return result(issues,issues.length===0);
}
