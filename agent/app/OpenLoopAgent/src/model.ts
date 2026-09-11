import { BedrockModel } from '@strands-agents/sdk/models/bedrock'

/** ADR-0007: Claude Sonnet 4.6 on Bedrock for every role; override per environment. */
export const DEFAULT_MODEL_ID = 'global.anthropic.claude-sonnet-4-6'

export function loadModel(
  modelId = process.env.OPENLOOP_MODEL_ID ?? DEFAULT_MODEL_ID,
): BedrockModel {
  return new BedrockModel({ modelId, region: process.env.AWS_REGION ?? 'us-east-1' })
}
