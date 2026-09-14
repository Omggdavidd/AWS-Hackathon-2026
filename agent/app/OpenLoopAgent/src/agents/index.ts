import {
  ActionPlan,
  AskAnswer,
  CatchUpSummary,
  type EmailMessage,
  type Evidence,
  ExtractorOutput,
  type IngestionSource,
  InvestigatorOutput,
  type LedgerStore,
  type OpenLoop,
  type ProposedAction,
  RiskJudgment,
} from '@openloop/shared'
import { Agent, type Model } from '@strands-agents/sdk'
import type { AskContext } from '../ask'
import type { CatchUpDigest } from '../catch-up'
import { renderThread } from '../render'
import { inboxTools } from '../tools/inbox'
import { ledgerTools, loopEvidenceTool } from '../tools/ledger'
import {
  ACTION_PROMPT,
  ASK_PROMPT,
  CATCH_UP_PROMPT,
  EXTRACTOR_PROMPT,
  INVESTIGATOR_PROMPT,
  RISK_JUDGE_PROMPT,
  UPDATE_PROMPT,
} from './prompts'

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
  /** Delta path (plan step 7): new messages arrived in a thread that already has a loop. */
  update(input: {
    loop: OpenLoop
    existingEvidence: Evidence[]
    newMessages: EmailMessage[]
    thread: EmailMessage[]
    now: string
  }): Promise<InvestigatorOutput>
  /** Action Agent (plan steps 10-11): turn an allowed proposed action into a concrete effect. */
  plan(input: {
    loop: OpenLoop
    evidence: Evidence[]
    action: ProposedAction
    thread: EmailMessage[]
    now: string
  }): Promise<ActionPlan>
  /** Catch me up (plan step 12): the digest is computed in code; the model only writes the words. */
  summarize(input: { digest: CatchUpDigest; now: string }): Promise<CatchUpSummary>
  /** Ask (SPEC §8G): answer one question from the ledger. Reads only; it can look, never act. */
  answer(input: { question: string; context: AskContext; now: string }): Promise<AskAnswer>
}

/** The keys of `Specialists`, so a caller can give a role its own model (ADR-0007). */
export type SpecialistRole = keyof Specialists

export interface SpecialistDeps {
  model: Model
  /** Per-role models; a role without one runs on `model`. */
  models?: Partial<Record<SpecialistRole, Model>>
  source: IngestionSource
  store: LedgerStore
  userId: string
}

export function createSpecialists({
  model,
  models,
  source,
  store,
  userId,
}: SpecialistDeps): Specialists {
  return {
    async extract({ thread, now }) {
      const agent = new Agent({
        model: models?.extract ?? model,
        systemPrompt: EXTRACTOR_PROMPT,
        structuredOutputSchema: ExtractorOutput,
        printer: false,
      })
      const result = await agent.invoke(`Today is ${now}.\n\nThread:\n${renderThread(thread)}`)
      return ExtractorOutput.parse(result.structuredOutput)
    },

    async investigate({ candidate, thread, now }) {
      const agent = new Agent({
        model: models?.investigate ?? model,
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

    async update({ loop, existingEvidence, newMessages, thread, now }) {
      const agent = new Agent({
        model: models?.update ?? model,
        systemPrompt: UPDATE_PROMPT,
        tools: [...inboxTools(source), ...ledgerTools(store, userId)],
        structuredOutputSchema: InvestigatorOutput,
        printer: false,
      })
      const known = existingEvidence
        .map((e) => `${e.sourceId} (${e.supports}): ${e.excerpt}`)
        .join('\n')
      const result = await agent.invoke(
        `Today is ${now}.\n\nTracked responsibility:\n${JSON.stringify(loop, null, 2)}\n\nEvidence already recorded:\n${known || '(none)'}\n\nNew messages in the thread:\n${renderThread(newMessages)}\n\nFull thread for context:\n${renderThread(thread)}`,
      )
      return InvestigatorOutput.parse(result.structuredOutput)
    },

    async plan({ loop, evidence, action, thread, now }) {
      const agent = new Agent({
        model: models?.plan ?? model,
        systemPrompt: ACTION_PROMPT,
        structuredOutputSchema: ActionPlan,
        printer: false,
      })
      const result = await agent.invoke(
        `Today is ${now}. The user is Alex Rivera <alex.rivera@student.northgate.edu>.\n\nResponsibility:\n${JSON.stringify(loop, null, 2)}\n\nEvidence:\n${JSON.stringify(evidence, null, 2)}\n\nProposed action:\n${JSON.stringify(action, null, 2)}\n\nThread:\n${renderThread(thread)}`,
      )
      return ActionPlan.parse(result.structuredOutput)
    },

    async summarize({ digest, now }) {
      const agent = new Agent({
        model: models?.summarize ?? model,
        systemPrompt: CATCH_UP_PROMPT,
        structuredOutputSchema: CatchUpSummary,
        printer: false,
      })
      const result = await agent.invoke(
        `Now is ${now}. Digest since ${digest.since}:\n${JSON.stringify(digest, null, 2)}`,
      )
      return CatchUpSummary.parse(result.structuredOutput)
    },

    async answer({ question, context, now }) {
      const agent = new Agent({
        model: models?.answer ?? model,
        systemPrompt: ASK_PROMPT,
        tools: [...ledgerTools(store, userId), loopEvidenceTool(store, userId)],
        structuredOutputSchema: AskAnswer,
        printer: false,
      })
      const result = await agent.invoke(
        `Now is ${now}.\n\nLedger:\n${JSON.stringify(context, null, 2)}\n\nQuestion:\n${question}`,
      )
      return AskAnswer.parse(result.structuredOutput)
    },

    async judge({ loop, evidence, now }) {
      const agent = new Agent({
        model: models?.judge ?? model,
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
