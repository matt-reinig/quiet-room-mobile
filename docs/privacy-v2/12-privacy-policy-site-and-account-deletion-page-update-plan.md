# Task 12 — Privacy Policy Site And Account Deletion Page Update Plan

## Goal

Update the public Quiet Room privacy-policy site so it truthfully reflects the current implemented product behavior on `develop`, including:
- account creation and authentication behavior
- AI-provider usage and consent behavior
- account deletion behavior
- operational log retention and deletion exceptions
- support/contact paths

This task should produce a public policy/account-deletion site that is aligned with the product, backend, and store disclosures.

---

## Why This Task Exists

The current public-site update cannot be done safely by editing copy in isolation.

Right now, the public policy must be driven by a refreshed truth source because the existing data inventory on `develop` still contains stale statements about:
- account deletion not yet existing
- AI consent not yet being implemented
- operational-log retention not yet being finalized

This task fixes that by requiring a source-of-truth refresh first, then updating the public site from that refreshed source.

---

## Required Outputs

This task must produce all of the following:

1. refreshed truth-source docs that match current implemented behavior
2. updated public privacy-policy site content
3. updated public account-deletion page content
4. stable privacy/support/account-deletion URLs suitable for app links and reviewer notes
5. final wording inputs for Play Store / App Store disclosures and reviewer notes

---

## Scope

### In scope
- refresh `docs/privacy/data-inventory.md`
- update public `/privacy`
- update public `/account-deletion`
- ensure support/contact path is visible and real
- ensure public deletion wording matches implemented in-app deletion flow
- ensure operational-log wording matches Task 11 decisions

### Out of scope
- implementing new backend or mobile behavior
- inventing new product behavior that is not already present on `develop`
- setting up analytics

This is a truth-and-copy alignment task, not a new product-feature task.

---

## Implementation Order

This task must happen in this order:

### Phase A — Refresh internal truth source
### Phase B — Update public site from that truth source
### Phase C — Verify links and reviewer-facing language

Do not start by editing the public site first.

---

## Phase A — Refresh Internal Truth Source

### Step 1 — Refresh `docs/privacy/data-inventory.md`

Update the inventory so it reflects the actual implemented state on `develop`.

The refreshed inventory should no longer incorrectly imply that these are missing if they now exist:
- account deletion flow
- AI consent flow
- deployed operational-log retention decision

The refreshed inventory should clearly state:
- what auth/account types exist
- what conversation/profile/memory data is stored
- what data is sent to OpenAI
- what operational logs retain and for how long
- what account deletion now deletes
- what exceptions remain after deletion (for example operational logs until expiry)

### Step 2 — Refresh the deletion notes section

The inventory must truthfully describe current deletion behavior, including:
- backend `DELETE /api/account`
- deletion of Firebase Auth user
- deletion of Firestore conversation/profile/history data if implemented
- any remaining log-related exceptions

### Step 3 — Refresh the consent section implicitly through data handling

The inventory should reflect the implemented AI-consent behavior if it now exists on `develop`.

It should not keep stale statements implying consent is merely planned if the feature is implemented.

### Step 4 — Refresh operational-log wording

The inventory must use the final Task 11 outcome, including:
- 90-day retention
- metadata-first production logs
- accurate deletion language for logs
- any temporary exception if one still remains

---

## Phase B — Update The Public Privacy Site

### Pages required

At minimum, the public site must include:
- `/privacy`
- `/account-deletion`

If support/contact has its own page, that is acceptable, but the privacy and deletion pages must still clearly point to it.

---

### Step 5 — Update `/privacy`

The public privacy page should include clearly labeled sections for:

#### 5.1 Who operates Quiet Room
Include:
- developer/operator identity
- a real support/contact path

#### 5.2 What data we collect
Cover in plain language:
- account/authentication data
- chat messages and assistant replies
- inferred profile/memory data
- technical metadata
- voice-related request handling if applicable

#### 5.3 How data is used
Explain that data is used to:
- provide the chat experience
- maintain account state
- support continuity/personalization
- generate voice responses if applicable
- support debugging, security, and account/support operations

#### 5.4 Third-party services
Explicitly name the categories actually in use, such as:
- Firebase Authentication / Firestore
- OpenAI
- logging/hosting infrastructure where appropriate

Do not over-describe infrastructure if the public copy does not need that level of detail, but do not hide third-party AI/provider use.

#### 5.5 Retention
Use concrete and truthful language.

Target direction:
- account-linked product data retained until deletion unless otherwise stated
- operational logs retained for up to 90 days and then expire automatically
- logs are not generally deleted individually when an account is deleted

#### 5.6 Support and debugging access
Explain in simple terms that:
- Quiet Room does not rely on operational logs as the primary place to review conversations
- if support/debugging review of user content is needed, review is scoped to the relevant account/conversation data

Do not promise stronger restrictions than the product and support practice can actually uphold.

---

### Step 6 — Update `/account-deletion`

The public account-deletion page must reflect the implemented in-app deletion flow.

It should clearly explain:
- deletion can be initiated inside the app
- where to find it in the app
- what data is deleted
- what may remain temporarily or by exception
- what happens to operational logs
- what a user should do if the in-app flow fails

### Required placement language

Because the current product uses the profile icon menu, the public page should describe the actual entry point, for example:
- open the app
- tap the profile icon
- choose `Delete Account`

Do not say “Settings” if the actual current entry point is not a settings screen.

### Required deletion explanation

The page should distinguish between:
- deleted account/application data
- temporary/cache data on device
- operational logs retained under the stated retention schedule

---

### Step 7 — Remove stale or weak language

The public site should not include copy that is:
- generic legal filler
- vague about AI-provider use
- vague about retention
- stale relative to the actual app flow
- misleading about support-only deletion if in-app deletion exists

The site should be simple, specific, and defensible.

---

## Phase C — Link And Reviewer Alignment

### Step 8 — Confirm app links point to the right public URLs

Verify that the URLs used in the app for:
- privacy policy
- account deletion
- support/contact

all point to the correct published destinations.

### Step 9 — Align reviewer notes

Prepare reviewer-facing wording that can truthfully say:
- privacy policy available at [URL]
- account deletion available at [URL]
- in-app deletion can be initiated from the profile icon menu via `Delete Account`
- AI disclosure/consent is shown before first content send

This task is not complete until reviewer notes can be written cleanly from the final public site.

---

## Public Copy Requirements Checklist

By the end of this task, the public site must answer these clearly:

- Who operates Quiet Room?
- What account and chat data is collected?
- Is conversation content sent to an AI provider?
- Are inferred profiles or memories stored?
- How long are operational logs retained?
- Can users delete their account in-app?
- Where exactly do users start account deletion in the app?
- What data remains after deletion, if anything?
- How can a user contact support?

---

## Test / Verification Strategy

### Verification 1 — Truth-source refresh complete

Confirm `docs/privacy/data-inventory.md` no longer contains stale statements about:
- missing account deletion
- missing AI consent
- undefined operational-log retention

### Verification 2 — Public page content review

Review `/privacy` and `/account-deletion` against the refreshed data inventory and confirm there are no major mismatches.

### Verification 3 — Link reachability

Use the existing policy-link verification approach to confirm:
- privacy URL loads
- account-deletion URL loads
- support/contact path is reachable

### Verification 4 — Reviewer-note readiness

Confirm reviewer notes can be drafted without caveats or “this is planned” language for features that are already implemented.

---

## Suggested Deliverables

- refreshed `docs/privacy/data-inventory.md`
- updated public privacy page
- updated public account-deletion page
- final support/contact path confirmed
- reviewer-note draft inputs ready

---

## Definition Of Done

- `docs/privacy/data-inventory.md` is refreshed to match actual implemented behavior on `develop`
- the public `/privacy` page matches the refreshed truth source
- the public `/account-deletion` page matches the implemented in-app deletion flow
- AI-provider usage and consent behavior are described truthfully
- operational-log retention is described concretely using the final Task 11 decision
- privacy/support/account-deletion links are stable and reviewer-ready
- no major mismatch remains between the public site, the app, the backend, and the planned store disclosures
