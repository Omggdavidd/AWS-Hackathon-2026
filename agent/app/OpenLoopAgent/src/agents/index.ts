import {
  type EmailMessage,
  ExtractorOutput,
  type IngestionSource,
  InvestigatorOutput,
  type LedgerStore,
  type OpenLoop,
  RiskJudgment,
} from '@openloop/shared'
import { Agent, type Model } from '@strands-agents/sdk'
import { renderThread } from '../render'
import { inboxTools } from '../tools/inbox'
import { ledgerTools } from '../tools/ledger'
import { EXTRACTOR_PROMPT, INVESTIGATOR_PROMPT, RISK_JUDGE_PROMPT } from './prompts'

/** The specialist roles as plain async functions so the orchestrator can be tested with stubs (ADR-0003). */
export interface Specialists {
  extract(input: { thread: EmailMessage[]; now: string }): Promise<ExtractorOutput>
  investigate(input: {
    candidate: NonNullable<ExtractorOutput['candidate']>
    thread: EmailMessage[]
    now: string
  }): Promise<InvestigatorOutput>
  judge(input: {
    loop: Pick<
      OpenLoop,
      | 'title'
      | 'category'
      | 'actionType'
      | 'dueAt'
      | 'amount'
      | 'requestedBy'
      | 'status'
      | 'waitingOn'
    >
    evidence: InvestigatorOutput['evidence']
    now: string
  }): Promise<RiskJudgment>
}

export interface SpecialistDeps {
  model: Model
  source: IngestionSource
  store: LedgerStore
  userId: string
}

export function createSpecialists({ model, source, store, userId }: SpecialistDeps): Specialists {
  return {
    async extract({ thread, now }) {
      const agent = new Agent({
        model,
        systemPrompt: EXTRACTOR_PROMPT,
        structuredOutputSchema: ExtractorOutput,
        printer: false,
      })
      const result = await agent.invoke(`Today is ${now}.\n\nThread:\n${renderThread(thread)}`)
      return ExtractorOutput.parse(result.structuredOutput)
    },

    async investigate({ candidate, thread, now }) {
      const agent = new Agent({
        model,
        systemPrompt: INVESTIGATOR_PROMPT,
        tools: [...inboxTools(source), ...ledgerTools(store, userId)],
        structuredOutputSchema: InvestigatorOutput,
        printer: false,
      })
      const result = await agent.invoke(
        `Today is ${now}.\n\nCandidate responsibility:\n${JSON.stringify(candidate, null, 2)}\n\nOriginating thread:\n${renderThread(thread)}`,
      )
      return InvestigatorOutput.parse(result.structuredOutput)
    },

    async judge({ loop, evidence, now }) {
      const agent = new Agent({
        model,
        systemPrompt: RISK_JUDGE_PROMPT,
        structuredOutputSchema: RiskJudgment,
        printer: false,
      })
      const result = await agent.invoke(
        `Today is ${now}.\n\nResponsibility:\n${JSON.stringify(loop, null, 2)}\n\nEvidence:\n${JSON.stringify(evidence, null, 2)}`,
      )
      return RiskJudgment.parse(result.structuredOutput)
    },
  }
}
