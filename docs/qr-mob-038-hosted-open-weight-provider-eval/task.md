# QR-MOB-038: Add Hosted Open-Weight Model Provider and Evaluation Support

## Goal

Add support for evaluating a hosted open-weight language model through the existing model provider and evaluation infrastructure.

The first version should use a hosted service with an OpenAI-compatible API. Do not introduce self-hosted model infrastructure.

The implementation should make it easy to run the existing Quiet Room evaluation suite against the new model and compare its performance with the current production-model baselines.

## Initial Investigation

Before making changes, inspect the relevant Quiet Room repositories to identify:

- The existing model provider abstraction and implementations.
- How providers and models are selected at runtime.
- The current evaluation entry points, scripts, and configuration.
- How evaluation results, latency, token usage, failures, and model metadata are currently recorded.
- Whether an OpenAI-compatible provider adapter already exists and can be reused.
- Any assumptions in the evaluation harness that are specific to OpenAI, Anthropic, or another current provider.
- Which repository actually owns each implementation change. This tracker entry lives in the mobile repository, but provider and evaluation work may belong primarily in the Gabriel backend repository.

Document the relevant architecture before choosing the implementation approach.

## Implementation

Add the thinnest compatible integration for a hosted open-weight model.

The implementation should:

- Use the existing provider abstraction rather than adding provider-specific logic throughout the application.
- Support an OpenAI-compatible hosted endpoint.
- Keep provider, endpoint, API key, model identifier, and optional timeout configurable through environment variables.
- Avoid hard-coding a specific hosting provider unless required by its API.
- Reuse an existing OpenAI-compatible client or adapter when practical.
- Preserve all current providers and evaluation behavior.
- Fail clearly when required configuration is missing.
- Avoid introducing self-hosted inference, GPU infrastructure, model downloads, containers, or model deployment work.

Use the repository's existing configuration and naming conventions rather than introducing new conventions unnecessarily.

## Evaluation

Run the existing evaluation suite against:

1. The hosted open-weight model.
2. GPT-5.5 as the OpenAI baseline.
3. Sonnet 4.6 as the Anthropic baseline.

Use identical prompts, personas, scenarios, judge behavior, and evaluation settings wherever possible so the results are directly comparable.

Capture at minimum:

- Provider and model identifier.
- Evaluation score or judge result.
- Per-scenario success and failure.
- Request latency.
- Total evaluation duration.
- Input token usage.
- Output token usage.
- Cached-token usage when available.
- Reasoning-token usage when available.
- API errors, timeouts, malformed responses, retries, and unusable responses.

Do not silently exclude failed scenarios from the comparison.

## Cost Analysis

Generate a cost comparison between:

- The hosted open-weight model.
- GPT-5.5.
- Sonnet 4.6.

Where current provider pricing is available, include:

- Published input-token price.
- Published output-token price.
- Cached-input or other relevant pricing tiers when applicable.
- Measured total input and output tokens for each evaluation run.
- Estimated cost per complete evaluation run.
- Estimated cost per 1,000 equivalent runs.
- Estimated cost per 10,000 equivalent runs.
- Effective cost per successful scenario or completed evaluation.
- The open-weight model's cost difference and percentage savings or premium versus GPT-5.5 and Sonnet 4.6.

Use the actual measured token counts from the same evaluation runs whenever possible. Clearly separate measured usage, published pricing, calculated estimates, and assumptions.

Record the pricing source and the date the pricing was checked so the analysis can be updated later. Do not hard-code pricing into long-lived provider behavior; pricing may live in the report or a clearly identified evaluation configuration layer.

If current application usage data is available and trustworthy, add a clearly labeled monthly projection. Do not invent a usage level merely to produce a monthly estimate.

## Comparison Report

Produce a concise comparison covering:

- Overall evaluation quality.
- Scenario-level wins, regressions, and failures.
- Response-quality differences not captured by numeric scores.
- Latency and total runtime.
- Reliability and failure rate.
- Token usage.
- Estimated operating cost.
- API and structured-output compatibility.
- Any prompt changes that would be required for the hosted model.
- A recommendation on whether the hosted model is worth further Quiet Room testing.

Clearly distinguish measured results from subjective observations.

## Documentation

Document:

- The provider architecture used.
- Required environment variables.
- How to select the hosted provider and model.
- How to switch among the hosted model, GPT-5.5, and Sonnet 4.6.
- How to run the evaluation suite.
- How to reproduce the cost analysis.
- Where results and logs are written.
- Known OpenAI-compatible API differences across hosted providers.
- How another hosted provider could be evaluated later through the same adapter.

Do not commit API keys or other secrets.

## Success Criteria

The task is complete when:

- A hosted open-weight model can be selected through configuration.
- Existing providers continue to work.
- No self-hosted model infrastructure has been introduced.
- The same evaluation suite runs against the hosted model, GPT-5.5, and Sonnet 4.6.
- Results include quality, latency, usage, failure, and model metadata.
- Failed requests and incomplete scenarios remain visible.
- A reproducible cost analysis compares all three models using measured token usage and current published pricing.
- Documentation explains how to configure providers, switch models, rerun evaluations, and update the cost comparison.
- Relevant automated tests cover provider selection, configuration validation, and response handling.

## Constraints

- Do not change Quiet Room's production default model as part of this task.
- Do not route production traffic to the new model.
- Do not change the spiritual-companion behavior or prompts solely to make the hosted model pass.
- Do not add GPU, container, inference-server, or model-weight hosting infrastructure.
- Do not create a separate evaluation framework.
- Do not duplicate existing provider abstractions.
- Do not commit secrets.
- Prefer a small adapter that can work with multiple OpenAI-compatible hosting services.
- If the existing architecture makes a generic adapter unsafe or impractical, document the limitation and implement the smallest provider-specific extension necessary.
