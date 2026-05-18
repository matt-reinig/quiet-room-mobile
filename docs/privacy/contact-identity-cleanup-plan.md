# Quiet Room contact identity cleanup plan

## Context

Quiet Room's public-facing privacy and support surfaces should use a branded app contact email instead of a personal name or personal email.

Use this exact email everywhere public-facing contact info appears:

`Quietroomapp@gmail.com`

This is mainly for the privacy policy/help/support pages used for app review and users. The goal is not to change legal developer account identity or unrelated internal metadata. The goal is to make the public-facing website and support copy point to Quiet Room rather than to a personal identity.

The main public site files to update are:

- `site/quiet-room-privacy-policy/index.html`
- `site/quiet-room-privacy-policy/privacy/index.html`
- `site/quiet-room-privacy-policy/support/index.html`

Also review store disclosure/planning docs that may be copied into store metadata:

- `docs/privacy/store-console-disclosure-worksheet.md`
- `docs/privacy-v2/16-store-console-disclosure-pass-plan.md`

## Goal

Replace personal identity/contact language on the public privacy/help pages with Quiet Room-branded contact language.

After this change, users and app reviewers should see Quiet Room as the contact identity, with `Quietroomapp@gmail.com` as the support/privacy contact email.

## Implementation plan

### 1. Review the current public pages

Start by opening these files:

```text
site/quiet-room-privacy-policy/index.html
site/quiet-room-privacy-policy/privacy/index.html
site/quiet-room-privacy-policy/support/index.html
```

Look specifically for:

- contact sections
- footer text
- support email text
- privacy questions text
- `mailto:` links
- any visible references to Matt / Matthew / Reinig
- any personal Gmail address

### 2. Update privacy policy contact language

In `site/quiet-room-privacy-policy/privacy/index.html`, replace personal-contact wording with app-branded wording.

Use wording like:

```text
If you have questions about this Privacy Policy or your data, contact Quiet Room at Quietroomapp@gmail.com.
```

If this is inside an HTML link, use:

```html
<a href="mailto:Quietroomapp@gmail.com">Quietroomapp@gmail.com</a>
```

Keep the existing design and page structure. This should be a small content update, not a redesign.

### 3. Update support page contact language

In `site/quiet-room-privacy-policy/support/index.html`, replace any personal support contact wording with app-branded wording.

Use wording like:

```text
For support, email Quietroomapp@gmail.com.
```

If there is a support link/button, make sure it points to:

```text
mailto:Quietroomapp@gmail.com
```

The visible label can stay simple, such as:

```text
Email support
```

### 4. Update homepage/index references if needed

In `site/quiet-room-privacy-policy/index.html`, update any visible support/privacy contact references to use `Quietroomapp@gmail.com`.

Do not add unnecessary new content if the homepage only links to the privacy/support pages. Only change existing personal-contact references.

### 5. Review store disclosure docs

Review these files:

```text
docs/privacy/store-console-disclosure-worksheet.md
docs/privacy-v2/16-store-console-disclosure-pass-plan.md
```

If they contain a support/privacy contact email that is intended to be copied into the App Store / Play Store, update it to:

```text
Quietroomapp@gmail.com
```

Do not rewrite historical planning notes unless they are used as current store submission copy.

### 6. Search for remaining personal references

Run a repo-wide search:

```bash
rg -n --hidden --glob '!node_modules' --glob '!dist' --glob '!build' --glob '!ios/Pods' "Matt|Matthew|Reinig|matthew\.reinig|mailto:|gmail\.com" .
```

For any remaining references:

- Fix them if they are public-facing privacy/help/support/store-submission text.
- Leave them alone if they are clearly internal notes, Git/package metadata, or unrelated historical docs.
- Mention remaining references in the final summary if they were intentionally left alone.

### 7. Build/check

Build or locally verify the static privacy site.

From:

```bash
site/quiet-room-privacy-policy
```

Run the appropriate command based on the package manager in that folder. If it is plain static HTML with no build step, say that no build step exists and verify the changed pages directly.

Also run a lightweight repo check if available, such as lint/typecheck, but do not spend time inventing new test setup for this content-only change.

## Acceptance criteria

- `site/quiet-room-privacy-policy/privacy/index.html` uses `Quietroomapp@gmail.com` for privacy contact.
- `site/quiet-room-privacy-policy/support/index.html` uses `Quietroomapp@gmail.com` for support contact.
- Any `mailto:` support/privacy links point to `mailto:Quietroomapp@gmail.com`.
- Public privacy/help/support pages do not visibly display a personal name.
- Public privacy/help/support pages do not visibly display a personal email.
- Store disclosure docs are updated only where they represent current store-facing contact copy.
- Final response lists the exact files changed and any remaining personal references that were intentionally left untouched.

## Suggested commit message

```text
Update Quiet Room public contact email
```
