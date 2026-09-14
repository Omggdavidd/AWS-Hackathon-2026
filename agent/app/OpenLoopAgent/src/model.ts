import { BedrockModel } from '@strands-agents/sdk/models/bedrock'
import type { SpecialistRole } from './agents'

/** ADR-0007: Claude Sonnet 4.6 on Bedrock for every role; override per environment. */
export const DEFAULT_MODEL_ID = 'global.anthropic.claude-sonnet-4-6'
export const DEFAULT_EXTRACTOR_MODEL_ID = 'global.anthropic.claude-haiku-4-5-20251001-v1:0'

/**
 * Ceiling on one model response, so a role that starts rambling fails fast instead of burning the
 * runtime's 300s budget. The largest legitimate output is an `ActionPlan` with a 4000-character
 * email body or an `InvestigatorOutput` carrying a handful of 500-character excerpts, both well
 * under 2k tokens; 8192 leaves several times that headroom, since too small silently truncates.
 */
export const MAX_OUTPUT_TOKENS = 8192

export function loadModel(
  modelId = process.env.OPENLOOP_MODEL_ID ?? DEFAULT_MODEL_ID,
): BedrockModel {
  return new BedrockModel({
    modelId,
    region: process.env.AWS_REGION ?? 'us-east-1',
    maxTokens: MAX_OUTPUT_TOKENS,
  })
}

/** The Extractor defaults to Haiku; reasoning roles stay on the primary model. */
export function loadModelsByRole(
  model: BedrockModel = loadModel(),
  extractorModelId = process.env.OPENLOOP_EXTRACTOR_MODEL_ID ?? DEFAULT_EXTRACTOR_MODEL_ID,
): Record<SpecialistRole, BedrockModel> {
  const extract = extractorModelId ? loadModel(extractorModelId) : model
  return {
    extract,
    investigate: model,
    update: model,
    plan: model,
    judge: model,
    summarize: model,
    answer: model,
  }
}
