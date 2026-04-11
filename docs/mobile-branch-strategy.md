# Mobile Branch Strategy

This doc defines the recommended branch model for `quiet-room-mobile`.

## Recommendation

Use two long-lived branches:

- `develop`
- `master`

Recommended roles:

- `develop` is the integration branch for active mobile work
- `master` is the production branch for the mobile app

This matches the release planning work already underway for QA vs prod mobile distribution.

## Current Repo State

At the time this was written:

- `master` already exists and tracks `origin/master`
- `develop` does not yet exist in `quiet-room-mobile`

That means the next branch setup step is to create `develop` from the current `master` tip.

## Branch Meanings

### `develop`

Use `develop` for:

- day-to-day mobile feature work after PR merge
- release-prep integration work
- QA-bound changes
- TestFlight / Play internal testing candidate builds

Think of `develop` as:

- the branch Emily QA builds usually come from
- the branch where mobile release candidates are assembled before promotion

### `master`

Use `master` for:

- production-ready mobile code only
- App Store / Play Store release commits
- hotfixes that must represent the currently shippable mobile state

Think of `master` as:

- the mobile branch that corresponds to prod intent
- the branch you can safely tag for store releases

## Recommended Workflow

Normal feature flow:

1. Branch from `develop`
2. Open a PR back into `develop`
3. Validate in QA from `develop`
4. Merge `develop` into `master` when ready for production
5. Tag the `master` release if desired

Hotfix flow:

1. Branch from `master` for urgent production fixes
2. Merge back into `master`
3. Forward-merge the same fix back into `develop`

## How This Maps To Mobile Distribution

Recommended mapping:

- `develop` -> QA/TestFlight internal / Play internal testing
- `master` -> production App Store / Play Store release path

Important clarification:

- branch does not decide the environment by itself
- the build env still needs to be explicit as `qa` or `prod`

That means branch strategy and environment strategy should work together:

- branch tells us workflow intent
- env tells the app which backend/Firebase configuration to use

## Safety Rules

To keep the two-branch model healthy:

1. Do not do day-to-day feature work directly on `master`.
2. Do not point production mobile store submissions at arbitrary feature branches.
3. Keep QA verification centered on `develop`.
4. Promote to `master` intentionally, not continuously.
5. If a fix lands on `master`, make sure it is merged back into `develop`.

## Setup Step

The initial repo setup should be:

```bash
git checkout master
git pull origin master
git branch develop
git push -u origin develop
```

If you later want GitHub PR defaults to match this workflow, set:

- default review/integration branch: `develop`
- protected production branch: `master`

## Recommended Decision

For `quiet-room-mobile`, the recommended branch model is:

- yes to `develop`
- yes to keeping `master` as the production branch
- yes to using `develop` for QA/mobile release-prep work
- yes to promoting intentionally from `develop` to `master`
