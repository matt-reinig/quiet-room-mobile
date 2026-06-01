# QR-MOB-009 Profile History Review

## Summary

The QA split-profile architecture is doing its main job: durable identity and spiritual patterns are staying in `core`, while active circumstances and short-horizon concerns are staying in `recent`. Across the reviewed histories, the current injected profile size is compact, third-person voice is stable, and there is no obvious line-level duplication between `core` and `recent`.

The biggest architecture gaps are not model choice. They are lifecycle gaps:

- `recent` includes profile timestamp metadata at chat time, but freshness is interpreted by the model rather than enforced by retrieval policy.
- history entries grow without a retention or compaction rule.
- `core` can become increasingly interpretive and should carry stronger evidence/age discipline.
- downstream chat has no deterministic rule to omit, downweight, or reframe old `recent` context if the profile update is old.

## Sample

Read-only QA review on 2026-06-01 found three users with split-profile state. All three were reviewed.

| Sample | Conversations | Split history entries | History range | Current core | Current recent | Builder model |
| --- | ---: | ---: | --- | ---: | ---: | --- |
| `2233fed7f1` | 287 | 100 | 2026-01-22 to 2026-05-30 | 256 words | 88 words | `gpt-5.2-chat-latest` |
| `26cc00cc6d` | 241 | 65 | 2026-01-18 to 2026-04-04 | 183 words | 87 words | `gpt-5.2-chat-latest` |
| `7dabd9e627` | 124 | 63 | 2025-11-22 to 2026-05-31 | 236 words | 68 words | `gpt-5.2-chat-latest` |

QA flags were enabled only for the three reviewed users:

- `new_profile_memory_write`
- `new_profile_memory_read`

No prod split-profile flags were present in the reviewed Firestore project.

## Quantitative Signals

| Sample | Core second-person hits | Recent second-person hits | Core temporal hits | Recent temporal hits | Core/recent line overlap | Update modes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `2233fed7f1` | 0 | 0 | 0 | 0 | 0.000 | 1 bootstrap, 99 steady-state |
| `26cc00cc6d` | 0 | 0 | 0 | 0 | 0.000 | 63 older unknown, 2 steady-state |
| `7dabd9e627` | 0 | 0 | 0 | 1 | 0.000 | 1 bootstrap, 62 steady-state |

Current injected profile size is sustainable:

- smallest combined current profile: 270 words
- largest combined current profile: 344 words
- current split documents are far below backend hard caps of 8,000 chars for `core` and 6,000 chars for `recent`
- the prompt only loads the most recent five split-history entries for the profile builder, so runtime prompt growth is bounded

Storage growth is not bounded:

- reviewed users already have 63, 65, and 100 split-history entries
- entries include full `core_profile` and `recent_profile` text
- account deletion removes these entries, but normal long-term use has no pruning, compaction, or archival policy

## Qualitative Evidence

This review was not judged only by counts. The main question was whether the split made the memory more pastorally useful and less noisy in real continuity.

### Sample `2233fed7f1`

This was the heaviest profile history reviewed. The split held up well across 100 updates.

Why it looked good:

- `core` preserved a multi-month spiritual frame without letting a single hard day rewrite the user's durable story.
- Older short-term events did not remain in the current `recent` layer once they were no longer active.
- `recent` carried immediate context such as current stress, relational circumstances, and a specific present prayer practice without duplicating the full durable profile.
- Downstream responses were able to recognize recurring patterns, such as over-responsibility and the user's existing discernment grammar, while still answering the current message.

What this suggests:

- The split is doing the thing we wanted: stable memory stays stable, and active context remains active without pretending to be permanent.
- This is better than a single rolling profile because the assistant can keep continuity without dragging every recent situation into the user's long-term identity.

Remaining concern:

- `core` contains rich interpretive material. It is useful, but it needs promotion rules so repeated observations become durable memory only when the evidence is strong.

### Sample `26cc00cc6d`

This profile had a clear durable work/spiritual pressure pattern and a short-horizon liturgical/practical context.

Why it looked good:

- `core` retained the long-running work-pressure and spiritual-discernment pattern as durable context.
- `recent` held the current Holy Week and immediate discernment context without turning those details into permanent memory.
- The current profile was short enough to be useful as prompt context rather than becoming a second hidden essay.
- Downstream responses used the durable frame to stay grounded, but the best responses still answered the immediate question first.

What this suggests:

- `core` is useful when the user repeatedly returns to a stable interpretive problem.
- `recent` is useful when the user is in a temporary liturgical, relational, or practical situation that should shape replies now but should not live forever.

Remaining concern:

- This sample also shows why `recent` needs a staleness rule. If the user paused for weeks after a liturgical moment, that context should not still be injected as if it were active.

### Sample `7dabd9e627`

This profile showed the clearest durable-vs-current distinction. Durable themes centered on performance-based spirituality, belonging, and prayer identity; recent context centered on a present theological/spiritual question.

Why it looked good:

- `core` retained the user's long-running spiritual wound and recurring prayer pattern without replacing it with the latest theological topic.
- `recent` held the active question about suffering, desolation, and consent without promoting it wholesale into durable identity.
- The profile preserved Catholic specificity while staying compact.
- Downstream responses could connect the present question to the user's durable pattern without needing to restate the whole profile.

What this suggests:

- The split architecture is especially helpful when a user has deep recurring themes but the surface topic changes.
- It lets the assistant say, in effect, "this new question touches an old pattern," without making the old pattern the whole answer.

Remaining concern:

- The profile can still become spiritually over-determined if chat responses lean too hard on familiar frameworks. That is a downstream prompt/retrieval concern, not a reason to merge `core` and `recent`.

## What Would Have Looked Bad

The review looked specifically for failure modes that would make the split architecture suspect. The clearest red flags did not appear in the current profiles:

- `recent` was not simply a duplicate of `core`.
- `core` was not rewritten around the latest conversation.
- temporary practical details were not generally promoted into durable identity.
- profile text was not bloated enough to threaten prompt usefulness.
- second-person profile voice was not present in current `core` or `recent`.
- the assistant did not consistently announce or expose the profile as a source.

This does not prove the architecture is finished. It does mean the major observed problems are lifecycle and guardrail problems, not evidence that the split itself is wrong.

## Manual Findings

### Core

`core` is the highest-value section. It preserved stable themes across months without being overwritten by a single difficult day. It captured recurring spiritual lenses, repeated discernment patterns, relationship/work tendencies, and long-term identity themes in a compact form.

The split architecture improved the most important behavior here: durable memory stayed durable. In the heaviest sample, the profile retained long-running spiritual and relational themes while letting temporary stress, dates, and immediate plans live in `recent`.

Risks:

- `core` can become dense with interpretive labels.
- Some claims read like durable psychological or relational conclusions rather than evidence-tethered observations.
- The profile has no field-level confidence, age, or source count beyond the metadata and history references.

### Recent

`recent` is also high value. It stayed compact and specific, and it generally held short-horizon pressures, recent conversations, temporary emotional states, and immediate discernment questions.

The strongest positive signal is that `recent` did not mirror the full durable profile. It gave chat enough present context without turning every response into a recitation of long-term history.

Risks:

- `recent` uses current-state wording by design. If a user stops chatting, that context can become stale while still being injected.
- Chat currently receives a profile timestamp, so the model can infer that the profile is old relative to `now_local`.
- There is no TTL or staleness gate that forces old `recent` context to be omitted or explicitly reframed as historical.
- A stale `recent` profile could make Gabriel assume an old pressure is still active.

### Meta

`spiritual_profile_meta` is useful operationally. It records the last conversation, update mode, builder model, source IDs, and timestamps needed to explain how a profile was generated.

The main missing bit is retrieval policy metadata:

- whether `recent` is fresh enough for chat injection,
- whether `core` or `recent` should be withheld,
- whether a profile is migrated, stale, or needs refresh.

### History

`spiritual_profile_history/entries/*` is valuable for evaluation, debugging, and understanding drift. It made this task possible.

For runtime use, full history is lower value because steady-state building only loads the last five entries. Older full-text entries mostly serve audit/eval use cases.

Risks:

- unbounded full-text history storage,
- no compaction of older entries,
- no privacy-minimized alternative for long-term architecture metrics.

### Legacy Profile And Legacy Snapshots

Legacy profile context remains useful for bootstrap and migration. In steady-state split updates, the backend already stops feeding legacy profile text into the split prompt when existing split state is present.

Longer term, legacy profile snapshots should become migration-only data. They should not remain a second conceptual memory architecture after a user has a healthy split profile.

## Drift And Duplication

No reviewed current profile showed obvious `core`/`recent` line duplication. Semantic duplication was limited and generally useful: for example, a durable anxiety or performance pattern might live in `core`, while a current manifestation of that pattern lives in `recent`.

The drift risk is subtler:

- repeated spiritual framing can harden into durable labels;
- relational interpretations can become more confident over time;
- `core` can gradually widen even when it remains compact.

This is a prompt/schema issue more than a reason to abandon the split architecture. The split makes the drift easier to see and control.

## Temporal Accuracy

Current profiles mostly avoided precise temporal claims. One `recent` profile used a current-state term, which is expected for a recent layer but highlights the need for freshness policy.

The chat prompt does include both current local time metadata and profile update metadata. That helps the model notice, for example, that a profile was last updated a week ago. The concern is that this is still an LLM judgment call: the backend does not currently enforce a cutoff where old `recent` context is omitted, downweighted, or labeled as historical before prompt injection.

Downstream chat has separate temporal safety concerns. In one reviewed downstream QA response, an internal timestamp metadata marker appeared in assistant text. That is not caused by the split architecture itself, but it shows that profile/time metadata still needs strong output hygiene in the chat path.

## Emotional Over-Certainty

The profiles usually stayed observational, but `core` sometimes used strong formulations for emotional or relational patterns. This is useful when grounded by repeated user language, but it needs better guardrails so durable memory does not become a permanent diagnosis.

Recommended guardrail:

- prefer "has described", "has repeatedly noticed", or "recurring pattern" language over hard claims about motives or identity;
- require repeated support before moving material from `recent` to `core`;
- soften or remove old core claims if later conversations contradict them.

## Catholic And Spiritual Fit

Catholic/spiritual fit was strong across all three histories. The profiles preserved relevant frameworks such as Carmelite dryness, Ignatian discernment, sacramental/liturgical context, prayer practice, Scripture, and identity in Christ.

The main risk is over-applying spiritual frameworks when the user is asking for ordinary relational or practical help. This is a downstream chat grounding risk, not primarily a split-storage risk.

## Downstream Response Grounding

Recent downstream responses after split-memory read enablement generally used memory well:

- responses silently connected current messages to durable patterns without saying "the profile says";
- context helped the assistant recognize recurring themes such as boundaries, spiritual dryness, discernment, and performance pressure;
- responses were usually relevant to the user's current message rather than generic profile replay.

Observed risks:

- the assistant can overframe a current issue through familiar spiritual categories until the user corrects it;
- profile context can make responses more confident about relational interpretations;
- stale `recent` context would be risky if a user resumed after a long gap.

## Root-Cause Classification

| Finding | Classification |
| --- | --- |
| Durable themes stay stable while recent context changes | Split architecture strength |
| Recent profile can become stale if no new profile run occurs | Retrieval/lifecycle issue |
| Full history grows indefinitely | Data-retention issue |
| Core can accumulate interpretive certainty | Prompt/schema issue |
| Chat may over-apply familiar spiritual labels | Downstream chat prompt issue |
| Candidate model verbosity and second-person behavior from QR-MOB-008 | Model-selection issue; defer to QR-MOB-018 |
