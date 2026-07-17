# QR-MOB-035 – One-Time QA Anonymous Retention Cleanup

## Goal

Run the existing guarded anonymous-retention endpoint against QA until every eligible anonymous account and its application-owned Firestore data have been removed.

This is the operational cleanup that QR-MOB-031 deliberately left separate from its targeted mobile recovery proof. It is not the future scheduled-retention phase.

## Scope

- Firebase project: `gabriel-qa-89f20` only.
- Backend endpoint: `POST /internal/anonymous-retention`.
- Eligible accounts: anonymous Firebase Auth users whose creation timestamp is at least 30 days old and that have no linked identity provider, email address, phone number, or password hash.
- Data removal order: recursively delete `users/{uid}` in Firestore, then delete the Firebase Auth user.
- Execution mode: manual, bounded batches using the existing endpoint controls.

## Preconditions

- Confirm the QA backend contains the guarded retention implementation and is healthy.
- Confirm `ANONYMOUS_RETENTION_ENABLED=true` and the QA-only `ANONYMOUS_RETENTION_JOB_TOKEN` are configured without displaying or committing the secret.
- Confirm the credentials, API base, and Firebase project all resolve to `gabriel-qa-89f20`.
- Confirm QR-MOB-031 recovery and QR-MOB-032 cold-relaunch persistence remain the accepted mobile behavior.
- Obtain explicit user approval immediately before the first destructive `apply: true` request. Approval to create or prepare this task is not approval to delete QA data.

## Execution Plan

1. Run an aggregate dry run with no `targetUid`. Record scanned, candidate, deletion, and error counts without recording UIDs.
2. If the dry run reports errors or any eligibility invariant is uncertain, stop without applying.
3. Establish at least one registered QA control and record metadata needed to verify that its Auth account and Firestore data remain unchanged. Do not include its UID or content in committed evidence.
4. With explicit approval, submit the exact destructive confirmation value through the guarded endpoint in batches no larger than the endpoint's 100-candidate maximum.
5. After each batch, record aggregate counts and errors. Stop on any error before starting another batch.
6. Repeat until an aggregate dry run reports zero eligible accounts and zero errors.
7. Verify that the deleted candidate Auth records and corresponding `users/{uid}` Firestore subtrees are absent. Candidate UIDs used for direct verification must remain ephemeral and must not be committed.
8. Verify that the registered control's Auth account and Firestore data remain present and unchanged.
9. Record the aggregate proof and final zero-candidate readback in a QA evidence document, then update the tracker status.

## Safety Boundaries

- Do not run against production or project `gabriel-e6156`.
- Do not lower or bypass the 30-day eligibility threshold.
- Do not delete registered, email/password, Apple, Google, email-bearing, phone-bearing, or linked-provider accounts.
- Do not use broad Firestore collection deletion; deletion must remain rooted at the literal candidate path `users/{uid}`.
- Do not expose endpoint secrets, account UIDs, conversation text, profile content, or other user content in commands captured for documentation or in committed evidence.
- Do not add EventBridge, Firebase Extensions, Identity Platform automatic cleanup, or any other scheduler in this task.
- Do not treat a dry run as authorization for the destructive apply run.

## Success Criteria

1. The initial QA dry run and every apply batch complete with aggregate evidence.
2. The final QA dry run reports zero eligible anonymous accounts and zero errors.
3. Every account deleted by the run is absent from Firebase Auth and has no remaining `users/{uid}` Firestore subtree.
4. Registered QA controls remain present and unchanged.
5. No production system or data is read or changed by the cleanup workflow.
6. No secret, UID, conversation content, or profile content is committed in the evidence.
7. The tracker clearly records completion of this one-time QA cleanup while leaving scheduled cleanup as a separate future phase.

## Out of Scope

- Production anonymous-account cleanup.
- Recurring or scheduled cleanup.
- Changing retention eligibility or the 30-day cutoff.
- Changing QR-MOB-031 mobile recovery or QR-MOB-032 conversation persistence.
