import { BedrockModel } from '@strands-agents/sdk/models/bedrock'
import type { SpecialistRole } from './agents'

/** ADR-0007: Claude Sonnet 4.6 on Bedrock for every role; override per environment. */
export const DEFAULT_MODEL_ID = 'global.anthropic.claude-sonnet-4-6'

export function loadModel(
  modelId = process.env.OPENLOOP_MODEL_ID ?? DEFAULT_MODEL_ID,
): BedrockModel {
  return new BedrockModel({ modelId, region: process.env.AWS_REGION ?? 'us-east-1' })
}

/** One model per specialist role: all seven share `model` unless the Extractor is overridden. */
export function loadModelsByRole(
  model: BedrockModel = loadModel(),
  extractorModelId = process.env.OPENLOOP_EXTRACTOR_MODEL_ID,
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
