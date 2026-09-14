import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MODEL_ID, loadModel, loadModelsByRole, MAX_OUTPUT_TOKENS } from '../src/model'

describe('loadModelsByRole', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('runs all seven roles on one shared model', () => {
    const model = loadModel(DEFAULT_MODEL_ID)
    const models = loadModelsByRole(model)

    expect(models.extract.getConfig().modelId).toBe(DEFAULT_MODEL_ID)
    expect(models.extract).toBe(model)
    expect(models.investigate).toBe(model)
    expect(models.update).toBe(model)
    expect(models.plan).toBe(model)
    expect(models.judge).toBe(model)
    expect(models.summarize).toBe(model)
    expect(models.answer).toBe(model)
  })

  it('takes an Extractor model id override', () => {
    const models = loadModelsByRole(loadModel(DEFAULT_MODEL_ID), 'anthropic.stub-extractor')
    expect(models.extract.getConfig().modelId).toBe('anthropic.stub-extractor')
    expect(models.judge.getConfig().modelId).toBe(DEFAULT_MODEL_ID)
  })

  it('takes the Extractor model id from OPENLOOP_EXTRACTOR_MODEL_ID', () => {
    vi.stubEnv('OPENLOOP_EXTRACTOR_MODEL_ID', 'anthropic.stub-from-env')
    const model = loadModel(DEFAULT_MODEL_ID)
    const models = loadModelsByRole(model)

    expect(models.extract.getConfig().modelId).toBe('anthropic.stub-from-env')
    expect(models.extract).not.toBe(model)
    expect(models.judge).toBe(model)
  })

  it('bounds the output of every role, the Extractor on its own model included', () => {
    const models = loadModelsByRole(loadModel(DEFAULT_MODEL_ID), 'anthropic.stub-extractor')

    for (const [role, roleModel] of Object.entries(models)) {
      expect(roleModel.getConfig().maxTokens, role).toBe(MAX_OUTPUT_TOKENS)
    }
  })

  it('leaves sampling at the provider default: the demo was calibrated there', () => {
    expect(loadModel(DEFAULT_MODEL_ID).getConfig().temperature).toBeUndefined()
  })
})
