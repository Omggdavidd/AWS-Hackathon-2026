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
import { Agent, type Model, type ToolList } from '@strands-agents/sdk'
import type { z } from 'zod'
import type { AskContext } from '../ask'
import type { CatchUpDigest } from '../catch-up'
import { renderFreeText, renderJson, renderThread } from '../render'
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

/**
 * Paths and issue codes only. These messages end up in CloudWatch and the model's output carries
 * the user's mail, so the rejected value itself is never named.
 */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'} (${issue.code})`)
    .join(', ')
}

export function createSpecialists({
  model,
  models,
  source,
  store,
  userId,
}: SpecialistDeps): Specialists {
  /** Every role is the same shape: one agent, one prompt, one schema. Generation config lives here. */
  async function run<Schema extends z.ZodType>(
    role: SpecialistRole,
    systemPrompt: string,
    schema: Schema,
    prompt: string,
    tools?: ToolList,
  ): Promise<z.infer<Schema>> {
    const agent = new Agent({
      model: models?.[role] ?? model,
      systemPrompt,
      structuredOutputSchema: schema,
      printer: false,
      ...(tools ? { tools } : {}),
    })
    const result = await agent.invoke(prompt)
    const parsed = schema.safeParse(result.structuredOutput)
    if (!parsed.success) {
      throw new Error(
        `${role} returned output its schema rejected: ${describeIssues(parsed.error)}`,
      )
    }
    return parsed.data
  }

  return {
    async extract({ thread, now }) {
      return run(
        'extract',
        EXTRACTOR_PROMPT,
        ExtractorOutput,
        `Today is ${now}.\n\nThread:\n${renderThread(thread)}`,
      )
    },

    async investigate({ candidate, thread, now }) {
      return run(
        'investigate',
        INVESTIGATOR_PROMPT,
        InvestigatorOutput,
        `Today is ${now}.\n\nCandidate responsibility:\n${renderJson(candidate)}\n\nOriginating thread:\n${renderThread(thread)}`,
        [...inboxTools(source), ...ledgerTools(store, userId)],
      )
    },

    async update({ loop, existingEvidence, newMessages, thread, now }) {
      const known = existingEvidence
        .map((e) => `${e.sourceId} (${e.supports}): ${renderFreeText(e.excerpt)}`)
        .join('\n')
      return run(
        'update',
        UPDATE_PROMPT,
        InvestigatorOutput,
        `Today is ${now}.\n\nTracked responsibility:\n${renderJson(loop)}\n\nEvidence already recorded:\n${known || '(none)'}\n\nNew messages in the thread:\n${renderThread(newMessages)}\n\nFull thread for context:\n${renderThread(thread)}`,
        [...inboxTools(source), ...ledgerTools(store, userId)],
      )
    },

    async plan({ loop, evidence, action, thread, now }) {
      return run(
        'plan',
        ACTION_PROMPT,
        ActionPlan,
        `Today is ${now}. The user is Alex Rivera <alex.rivera@student.northgate.edu>.\n\nResponsibility:\n${renderJson(loop)}\n\nEvidence:\n${renderJson(evidence)}\n\nProposed action:\n${renderJson(action)}\n\nThread:\n${renderThread(thread)}`,
      )
    },

    async summarize({ digest, now }) {
      return run(
        'summarize',
        CATCH_UP_PROMPT,
        CatchUpSummary,
        `Now is ${now}. Digest since ${digest.since}:\n${renderJson(digest)}`,
      )
    },

    async answer({ question, context, now }) {
      return run(
        'answer',
        ASK_PROMPT,
        AskAnswer,
        `Now is ${now}.\n\nLedger:\n${renderJson(context)}\n\nQuestion:\n${renderFreeText(question)}`,
        [...ledgerTools(store, userId), loopEvidenceTool(store, userId)],
      )
    },

    async judge({ loop, evidence, now }) {
      return run(
        'judge',
        RISK_JUDGE_PROMPT,
        RiskJudgment,
        `Today is ${now}.\n\nResponsibility:\n${renderJson(loop)}\n\nEvidence:\n${renderJson(evidence)}`,
      )
    },
  }
}
