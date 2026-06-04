# Quiet Room Mobile Project Tracker

This document is a living tracker for mobile app follow-up work, investigations, and future improvements.

## Status key

- `Backlog`
- `Investigating`
- `Ready`
- `In Progress`
- `Done`
- `Blocked`

## Current tracker

| ID | Status | Priority | Area | Item | Notes / next step |
| --- | --- | --- | --- | --- | --- |
| QR-MOB-001 | Done | High | Production logs / retention | Confirm whether production logs have a 90-day TTL and update retention if they do not. | Verified on 2026-05-21. Prod Lambda log groups were updated from `Never expire` to 90 days. |
| QR-MOB-002 | In Progress | High | Android/iOS UI | Fix mobile composer spacing around the keyboard and bottom safe area. | Android/iOS revision is merged to `develop` at `b7ed619` and both QA store lanes have uploaded. Android QA is deployed to Play internal as draft release `QA internal 12