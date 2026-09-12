import { describe, expect, it } from 'vitest'
import { DEFAULT_MODEL_ID, EXTRACTOR_MODEL_ID, loadModel, loadModelsByRole } from '../src/model'

describe('loadModelsByRole', () => {
  it('runs the Extractor on Haiku and the other five roles on one shared model', () => {
    const model = loadModel(DEFAULT_MODEL_ID)
    const models = loadModelsByRole(model)

    expect(models.extract.getConfig().modelId).toBe(EXTRACTOR_MODEL_ID)
    expect(models.investigate.getConfig().modelId).toBe(DEFAULT_MODEL_ID)
    expect(models.investigate).toBe(model)
    expect(models.update).toBe(model)
    expect(models.plan).toBe(model)
    expect(models.judge).toBe(model)
    expect(models.summarize).toBe(model)
  })

  it('takes an Extractor model id override', () => {
    const models = loadModelsByRole(loadModel(DEFAULT_MODEL_ID), 'anthropic.stub-extractor')
    expect(models.extract.getConfig().modelId).toBe('anthropic.stub-extractor')
    expect(models.judge.getConfig().modelId).toBe(DEFAULT_MODEL_ID)
  })
})
