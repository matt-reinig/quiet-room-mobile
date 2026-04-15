# Task 03 — AI Consent Plan

## Goal
Ensure users explicitly consent before data is sent to AI provider.

## UX Flow
- First message attempt triggers modal
- User must accept before continuing

## Copy
"We use AI to generate responses. Your messages are sent securely to our provider."

## Steps
1. Add frontend gate before sending message
2. Store consent flag
3. Skip gate after consent

## Done When
- No messages are sent before consent
