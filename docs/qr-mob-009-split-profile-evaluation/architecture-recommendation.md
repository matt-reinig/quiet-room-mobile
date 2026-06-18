# QR-MOB-009 Architecture Recommendation

## Recommendation

Keep the split-profile architecture and continue improving it. The reviewed QA histories show that separating durable `core` memory from short-horizon `recent` context is directionally correct and better than a single rolling profile for long-term personalization.

Do not broaden rollout solely on the current architecture. Before moving beyond the current QA allowlist, add lifecycle controls for `recent`, compaction for history, and sharper prompt/schema rules for promoting material into `core`.

## Why This Is Better

The qualitative case for the split architecture is not just "the profiles are shorter" or "the docs are cleaner." The split changes what kind of mistakes the memory system is likely to make.

With one rolling profile, a recent stressful conversation can easily become part of the user's durable portrait, or a durable spiritual theme can be repeated so often that every current reply feels pre-interpreted. The reviewed split histories showed a better pattern:

- durable themes stayed available without being rewritten around the latest event;
- current pressures stayed visible without becoming permanent identity;
- downstream replies could draw on continuity while still answering the user's actual present message;
- the profile became easier to audit because `core` and `recent` failures are different kinds of failures.

Concrete examples from the reviewed QA histories:

| Sample | What `core` did well | What `recent` did well | Why that matters |
| --- | --- | --- | --- |
| `2233fed7f1` | Preserved long-running spiritual and relational discernment patterns across 100 updates. | Held immediate stress, current prayer practice, and short-horizon relational context. | The assistant could honor months of continuity without treating one depleted day as the user's identity. |
| `26cc00cc6d` | Kept a durable work-pressure and spiritual-discernment frame. | Kept temporary Holy Week/practical discernment context out of permanent memory. | The assistant had enough background to respond sensitively while avoiding permanent storage of seasonal details. |
| `7dabd9e627` | Retained a recurring performance/belonging/prayer pattern. | Held a current question about suffering and desolation as the active topic. | The assistant could connect a new question to an old pattern without making the old pattern the whole response. |

That is the main win: the system is starting to distinguish "this is part of the person's long-term map" from "this is the weather they are currently walking through."

## Future Direction

### Keep Persistent

`spiritual_profile_core` should remain persistent.

Reason:

- highest downstream value,
- compact enough for prompt injection,
- preserves durable spiritual and relational patterns,
- resists being overwritten by temporary stress.

Recommended changes:

- keep target length near 200-400 words;
- require repeated evidence before promoting recent material into core;
- prefer observational language over diagnostic or motive-certainty language;
- allow old core claims to be weakened or removed when later evidence contradicts them.

### Keep But Decay

`spiritual_profile_recent` should remain separate but become explicitly freshness-aware.

Reason:

- high value when fresh,
- risky when stale,
- current wording can imply an old emotional or practical state is still active.
- chat receives profile update metadata today, but the decision to discount stale `recent` content is left to model interpretation.

Recommended changes:

- add prompt-level freshness guidance behind the split-profile read path as the first low-risk step;
- add a freshness policy for chat injection:
  - fresh: inject normally;
  - aging: inject with a staleness note to the model;
  - stale: omit from chat injection or summarize as historical recent context only.
- candidate thresholds:
  - 14 days: mark as aging,
  - 30 days: omit or downweight unless the user resumes the same thread.
- keep `recent` available to the profile builder even when omitted from chat.

### Keep As Operational Metadata

`spiritual_profile_meta` should remain and gain policy fields.

Useful additional fields:

- `recent_freshness_status`
- `recent_expires_at_ms`
- `core_evidence_count`
- `core_last_material_change_at_ms`
- `recent_injected_at_ms`
- `last_chat_profile_source`

These fields would make QA and debugging much easier without reading raw profile text.

### Compact Or Prune

`spiritual_profile_history/entries/*` should not remain unbounded full-text storage forever.

Recommended policy:

- retain the most recent 20 full split-history entries per user;
- compact older entries into monthly summaries or metrics-only records;
- keep enough metadata to support drift review:
  - updated time,
  - source conversation ID,
  - builder model,
  - update mode,
  - core/recent lengths,
  - optional hashed content fingerprint,
  - optional manually approved eval snapshot.

This preserves architecture observability while reducing raw derived-content accumulation.

### Migrate Then Retire

Legacy profile docs and `profile_*` snapshots should be treated as bootstrap/migration inputs once split memory is healthy.

Recommended direction:

- continue using legacy profile for initial bootstrap only;
- avoid feeding legacy profile into steady-state split updates;
- after a successful split profile exists, consider pruning old legacy snapshots according to a documented retention policy;
- keep backward compatibility for users who do not have split-memory flags enabled.

## Retrieval And Prompt Injection

Current chat injection combines `core` and `recent` into one profile string. That is good enough for QA, but the assistant cannot reason cleanly about freshness or source type.

Recommended injection shape:

```text
Core Spiritual Profile:

...

Recent Spiritual Context:
[freshness=aging updated_at=...]

...
```

The model should be told:

- use `core` as durable background only;
- use `recent` only when it connects to the current message;
- do not assume old `recent` context is still active;
- do not surface profile labels or exact time metadata;
- use broad continuity language when drawing from memory.

## Suggested Follow-Up Work

1. Keep prompt-level freshness guidance behind split-profile read, then add a deterministic freshness gate for `recent` chat injection if QA shows model interpretation is not enough.
2. Add policy fields to `spiritual_profile_meta`.
3. Add history compaction or retention for older split-history entries.
4. Tighten the split-builder prompt around:
   - evidence thresholds for core promotion,
   - softening unsupported emotional certainty,
   - removing contradicted durable claims,
   - keeping recent short and explicitly temporary.
5. Add a lightweight response-grounding eval:
   - replay selected real conversations with split profile on/off,
   - score whether memory improves relevance,
   - flag over-personalization, stale-context use, and spiritual overframing.

## Rollout Position

Current position: keep the QA allowlist and do not change the default model or production rollout posture as part of QR-MOB-009.

The architecture is worth keeping, but it should graduate only after:

- stale `recent` context is handled,
- history growth has a policy,
- response-grounding evals show a net benefit,
- QR-MOB-018 separately answers whether any model change improves split-profile generation quality.

## Final Assessment

The split architecture is improving the system. It makes durable memory more stable, makes short-term context easier to isolate, and gives future retrieval controls a clean place to attach.

The next improvement should not be "one better profile." It should be lifecycle-aware memory: persistent where the signal is durable, temporary where the signal is seasonal, and humble everywhere the evidence is thin.
