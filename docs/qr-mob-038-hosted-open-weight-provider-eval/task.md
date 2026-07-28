# QR-MOB-038: Evaluate Hosted Open-Weight Model Providers and Integrate the Best Candidate

## Goal

Determine whether Quiet Room should adopt a hosted open-weight model by performing an engineering evaluation of the available hosting providers, selecting the best implementation strategy, integrating the chosen provider into the existing model abstraction, and comparing it against GPT-5.5 and Sonnet 4.6.

The first implementation should remain fully hosted. Do not introduce any self-hosted inference, GPU infrastructure, or dedicated model deployments.

## Phase 1 — Provider Research

Before writing code, perform a technical investigation of the current hosted ecosystem for the target open-weight model, currently Qwen3.6 27B.

Research at minimum:

- OpenRouter.
- DeepInfra.
- Together AI.
- Fireworks AI.
- Any other provider that appears to be a realistic production candidate.

Evaluate each provider on:

- Exact target-model availability.
- API compatibility.
- OpenAI compatibility.
- Structured-output support.
- Streaming support.
- Reliability and available uptime evidence.
- Latency and throughput.
- Context window.
- Input, output, cached-input, and other relevant pricing.
- Authentication and configuration.
- Privacy, data-retention, and model-training policies.
- Ease of integration.
- Long-term production viability.
- Risk of provider or gateway lock-in.

Document for each provider:

- Strengths.
- Weaknesses.
- Tradeoffs.
- Whether the exact target model is available as ordinary serverless inference.
- Why the provider was or was not selected.

Use current primary provider documentation and pricing sources wherever possible. Record the source and date checked because model catalogs and prices may change.

The recommendation should be evidence-based rather than assuming a provider up front.

## Phase 2 — Select the Initial Provider

Based on the research, recommend one provider and one exact model deployment for the first Quiet Room implementation.

The recommendation should explain:

- Why the provider and deployment were selected.
- Why the competing providers were rejected.
- Whether the selected service should be considered evaluation-only or a long-term production candidate.
- What migration path would exist if Quiet Room later changes providers.
- Whether a gateway and the underlying inference provider should be recorded separately.

If a gateway such as OpenRouter is selected:

- Pin the primary evaluation to one underlying inference provider.
- Disable automatic provider fallback for the controlled baseline unless there is a documented reason not to.
- Require support for the parameters Quiet Room uses.
- Apply the strongest available no-training, no-data-collection, and zero-data-retention controls compatible with the provider.
- Record the gateway, underlying inference provider, model identifier, quantization when exposed, and routing configuration in evaluation results.

Do not allow the primary evaluation to silently mix inference providers.

Optionally run a small provider-variance check against a second host for a limited set of representative scenarios. Keep that comparison separate from the primary score.

## Phase 3 — Repository Investigation

Before implementation, inspect the relevant Quiet Room repositories to identify:

- The current provider abstraction and implementations.
- How providers and models are selected at runtime.
- The current evaluation entry points, scripts, and configuration.
- Environment-variable and secret-management conventions.
- Streaming and structured-output expectations.
- Token accounting.
- Latency and failure logging.
- Evaluation result storage and reporting.
- Whether an OpenAI-compatible client or adapter already exists and can be reused.
- Assumptions specific to OpenAI, Anthropic, or another current provider.
- Which repository owns each change. This tracker entry lives in the mobile repository, but most provider and evaluation work may belong in the Gabriel backend repository.

Document the relevant architecture and proposed change boundaries before modifying code.

## Phase 4 — Implementation

Implement the selected provider and model deployment through the existing model abstraction.

Requirements:

- Preserve all existing providers and model behavior.
- Reuse the existing provider abstraction rather than spreading provider-specific logic throughout the codebase.
- Make provider, gateway, base URL, model identifier, API key, timeout, and applicable routing controls configurable through environment variables or the repository's existing configuration system.
- Reuse an existing OpenAI-compatible client or adapter when practical.
- Keep gateway-specific routing isolated from generic provider behavior.
- Fail clearly when required configuration is missing or invalid.
- Do not commit credentials or secrets.
- Do not redirect production traffic or change the production default model.
- Do not introduce self-hosted inference, GPU infrastructure, model downloads, containers, or dedicated model deployments.

The implementation should make it straightforward to evaluate another OpenAI-compatible provider later without rewriting the evaluation framework.

## Phase 5 — Evaluation

Run the existing evaluation suite against:

1. The selected hosted open-weight model and pinned deployment.
2. GPT-5.5 as the OpenAI baseline.
3. Sonnet 4.6 as the Anthropic baseline.

Use identical prompts, personas, scenarios, judge behavior, and evaluation settings wherever possible.

Capture at minimum:

- Logical provider.
- Gateway, when applicable.
- Underlying inference provider, when applicable.
- Exact model identifier.
- Quantization or deployment metadata when exposed.
- Evaluation score or judge result.
- Per-scenario success and failure.
- Request latency.
- Total evaluation duration.
- Time to first token when available.
- Input tokens.
- Output tokens.
- Cached-input tokens when available.
- Reasoning tokens when available.
- Retries.
- API errors.
- Timeouts.
- Malformed or unusable responses.
- Structured-output compatibility issues.

Do not silently exclude failed scenarios from the comparison.

If a provider-variance check is performed, run the same small scenario subset against a second deployment and compare output quality, latency, usage accounting, errors, and structured-output behavior. Do not mix those results into the primary benchmark.

## Phase 6 — Cost Analysis

Produce a detailed comparison between:

- GPT-5.5.
- Sonnet 4.6.
- The selected hosted open-weight model deployment.

Include:

- Published input-token pricing.
- Published output-token pricing.
- Cached-input or other relevant pricing tiers.
- Gateway fees or pricing differences, when applicable.
- Measured total input and output tokens for each evaluation run.
- Estimated cost per complete evaluation run.
- Estimated cost per 1,000 equivalent runs.
- Estimated cost per 10,000 equivalent runs.
- Effective cost per successful scenario or completed evaluation.
- Percentage savings or premium versus GPT-5.5 and Sonnet 4.6.
- Pricing assumptions and source dates.

Use actual measured token counts from the same evaluation runs whenever possible. Clearly distinguish:

- Measured usage.
- Published prices.
- Calculated estimates.
- Assumptions.

If trustworthy current application usage data is available, add a clearly labeled monthly projection. Do not invent a usage level merely to produce a monthly estimate.

Do not hard-code pricing into long-lived provider runtime behavior. Keep pricing in the report or a clearly identified evaluation configuration layer.

## Phase 7 — Final Recommendation

Produce a report summarizing:

- Provider comparison.
- Selected provider and deployment rationale.
- Evaluation quality.
- Scenario-level wins and regressions.
- Latency and runtime comparison.
- Reliability and failure rates.
- Token usage.
- Cost comparison.
- Structured-output and API compatibility.
- Implementation complexity.
- Privacy and retention considerations.
- Production readiness.
- Remaining risks.

Conclude with a recommendation on whether Quiet Room should:

- Remain on proprietary models.
- Add the hosted open-weight model as another option.
- Use the gateway only for evaluation and move to a direct provider integration for production.
- Move future development toward hosted open-weight models.

Support the recommendation with evidence gathered during the investigation and evaluation.

## Documentation

Document:

- Provider research and source dates.
- The selected architecture.
- Required environment variables.
- How to select the hosted provider and model.
- How to configure deterministic provider routing when applicable.
- How to switch among the hosted model, GPT-5.5, and Sonnet 4.6.
- How to run the evaluation suite.
- How to reproduce the cost analysis.
- Where results and logs are written.
- Known OpenAI-compatible API differences.
- How to evaluate another hosted provider through the same adapter.
- How to migrate from a gateway to a direct provider integration if that becomes desirable.

## Success Criteria

The task is complete when:

- A current, sourced comparison of realistic hosted providers exists.
- One provider and exact model deployment are selected with a documented rationale.
- A hosted open-weight model can be selected through configuration.
- Existing providers continue to work.
- No self-hosted model infrastructure has been introduced.
- The same evaluation suite runs against the hosted model, GPT-5.5, and Sonnet 4.6.
- The primary open-weight benchmark uses a deterministic deployment configuration.
- Results include quality, latency, usage, failures, gateway metadata, inference-provider metadata, and model metadata where applicable.
- Failed requests and incomplete scenarios remain visible.
- A reproducible cost analysis compares all three models using measured token usage and current published pricing.
- Documentation explains configuration, routing, model switching, evaluation execution, and cost-analysis reproduction.
- Relevant automated tests cover provider selection, configuration validation, routing configuration, and response handling.

## Constraints

- Do not change Quiet Room's production default model as part of this task.
- Do not route production traffic to the new model.
- Do not change the spiritual-companion behavior or prompts solely to make the hosted model pass.
- Do not add GPU, container, inference-server, or model-weight hosting infrastructure.
- Do not create a separate evaluation framework.
- Do not duplicate existing provider abstractions.
- Do not commit secrets.
- Do not silently route the primary benchmark across multiple inference providers.
- Prefer a small adapter that can work with multiple OpenAI-compatible services.
- If the existing architecture makes a generic adapter unsafe or impractical, document the limitation and implement the smallest provider-specific extension necessary.