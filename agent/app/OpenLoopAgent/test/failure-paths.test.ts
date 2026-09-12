import { fileURLToPath } from 'node:url'
import { FixtureActionSink, FixtureSource, LocalLedgerStore } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import { handleWhatYouCan } from '../src/actions'
import type { Specialists } from '../src/agents'
import { runScan } from '../src/scan'

const seed = fileURLToPath(new URL('../../../../demo/seed-inbox-failures.json', import.meta.url))
const now = '2026-09-11T13:00:00.000Z'

/**
 * Deterministic stand-ins for the model-backed roles, branching on the failure fixture's threads.
 * The vague-deadline thread returns no dueAt and lower confidence, the way EXTRACTOR_PROMPT asks for.
 */
const stubs: Specialists = {
  async extract({ thread }) {
    const root = thread[0]
    if (!root) return { isResponsibility: false, confidence: 0.95, rationale: 'empty thread' }
    const sourceRef = {
      sourceType: 'email' as const,
      sourceId: root.id,
      threadId: root.threadId,
    }
    if (root.threadId === 'thr-advisor') {
      return {
        isResponsibility: true,
        candidate: {
          title: 'Send Dana a draft statement of purpose',
          category: 'reply',
          area: 'school',
          actionType: 'submit',
          requestedBy: 'Dana Whitfield',
          sourceRef,
        },
        confidence: 0.45,
        rationale: 'stub: "sometime next month" is vague, no dueAt',
      }
    }
    if (root.threadId === 'thr-scholarship') {
      return {
        isResponsibility: true,
        candidate: {
          title: "Renew the Dean's Scholarship",
          category: 'form',
          area: 'school',
          actionType: 'submit',
          dueAt: '2026-09-30T23:59:00-04:00',
          sourceRef,
        },
        confidence: 0.9,
        rationale: 'stub',
      }
    }
    if (root.threadId === 'thr-permit-notice') {
      return {
        isResponsibility: true,
        candidate: {
          title: 'Parking permit renewal for Lot C',
          category: 'payment',
          area: 'school',
          actionType: 'pay',
          amount: { value: 60, currency: 'USD' },
          sourceRef,
        },
        confidence: 0.6,
        rationale: 'stub: automated second notice',
      }
    }
    return {
      isResponsibility: true,
      candidate: {
        title: root.subject,
        category: 'payment',
        area: 'school',
        actionType: 'pay',
        dueAt:
          root.threadId === 'thr-permit'
            ? '2026-09-12T23:59:00-04:00'
            : '2026-09-20T23:59:00-04:00',
        amount: { value: root.threadId === 'thr-permit' ? 60 : 45, currency: 'USD' },
        sourceRef,
      },
      confidence: 0.9,
      rationale: 'stub',
    }
  },
  async investigate({ thread }) {
    const root = thread[0]
    const receipt = thread.find((m) => /payment received/i.test(m.body))
    if (root?.threadId === 'thr-permit-notice') {
      return {
        evidence: [
          {
            sourceRef: { sourceType: 'email', sourceId: root.id, threadId: root.threadId },
            observedAt: root.date,
            excerpt: root.snippet,
            supports: 'CONTRADICTS',
            confidence: 0.8,
          },
        ],
        proposedStatus: 'WATCHING',
        confidence: 0.8,
        rationale: 'stub: msg-103 already shows the renewal was paid; nothing for the user to do',
      }
    }
    return {
      evidence: thread.map((m) => ({
        sourceRef: { sourceType: 'email', sourceId: m.id, threadId: m.threadId },
        observedAt: m.date,
        excerpt: m.snippet,
        supports: m === receipt ? 'RESOLVED' : 'OPEN',
        confidence: 0.9,
      })),
      proposedStatus: receipt ? 'RESOLVED' : 'NEEDS_YOU',
      confidence: 0.9,
      rationale: 'stub',
    }
  },
  async update({ loop, newMessages }) {
    return {
      evidence: newMessages.map((m) => ({
        sourceRef: { sourceType: 'email', sourceId: m.id, threadId: m.threadId },
        observedAt: m.date,
        excerpt: m.snippet,
        supports: 'UPDATED',
        confidence: 0.9,
      })),
      proposedStatus: loop.status,
      confidence: 0.9,
      rationale: 'stub: informational',
    }
  },
  async plan({ action }) {
    if (action.type === 'remind')
      return {
        effect: { kind: 'reminder', at: '2026-09-25T09:00:00-04:00', note: 'Renewal form due' },
        summary: 'Reminder set',
      }
    if (action.type === 'draft_email')
      return {
        effect: {
          kind: 'draft_email',
          to: 'aid@northgate.edu',
          subject: "Re: Dean's Scholarship renewal",
          body: 'Could you resend the renewal form?',
        },
        summary: 'Drafted reply',
      }
    return { effect: { kind: 'note', text: `stub effect for ${action.type}` }, summary: 'stub' }
  },
  async summarize() {
    return { headline: 'stub', items: [], nothingElse: true }
  },
  async judge({ loop }) {
    if (loop.title === "Renew the Dean's Scholarship") {
      return {
        riskTier: 'high',
        priority: 'high',
        consequence: 'The award lapses for the spring term',
        nextAction: 'Submit the renewal form',
        proposedActions: [
          { type: 'remind', summary: 'Remind on September 25', riskTier: 'low', payload: {} },
          {
            type: 'draft_email',
            summary: 'Draft a reply asking for the form',
            riskTier: 'medium',
            payload: {},
          },
          {
            type: 'submit_form',
            summary: 'Submit the renewal form',
            riskTier: 'high',
            payload: {},
          },
        ],
        interruptUser: true,
        rationale: 'stub',
      }
    }
    return {
      riskTier: 'low',
      priority: 'medium',
      consequence: 'stub consequence',
      nextAction: 'stub next action',
      proposedActions: [],
      interruptUser: false,
      rationale: 'stub',
    }
  },
}

describe('failure paths', () => {
  it('ingesting the same messages twice creates nothing new', async () => {
    const source = await FixtureSource.load(seed)
    const store = new LocalLedgerStore()
    const first = await runScan({ source, store, userId: 'u', specialists: stubs, now })
    expect(first).toMatchObject({ threads: 5, created: 5, updated: 0, skipped: 0 })

    const loopsAfterFirst = await store.listLoops('u')
    const auditAfterFirst = await store.listAudit('u')
    const evidenceAfterFirst = (
      await Promise.all(loopsAfterFirst.map((l) => store.listEvidence(l.id)))
    ).flat()

    const second = await runScan({ source, store, userId: 'u', specialists: stubs, now })
    expect(second).toMatchObject({ threads: 5, created: 0, updated: 0, skipped: 5 })

    const loopsAfterSecond = await store.listLoops('u')
    expect(loopsAfterSecond.map((l) => l.id)).toEqual(loopsAfterFirst.map((l) => l.id))
    expect(loopsAfterSecond.map((l) => l.status)).toEqual(loopsAfterFirst.map((l) => l.status))
    expect(loopsAfterSecond.map((l) => l.updatedAt)).toEqual(
      loopsAfterFirst.map((l) => l.updatedAt),
    )
    expect(
      (await Promise.all(loopsAfterSecond.map((l) => store.listEvidence(l.id)))).flat(),
    ).toHaveLength(evidenceAfterFirst.length)

    const auditAfterSecond = await store.listAudit('u')
    expect(auditAfterSecond.filter((a) => a.kind === 'loop_created')).toHaveLength(5)
    expect(auditAfterSecond.filter((a) => a.kind === 'evidence_added')).toHaveLength(0)
    expect(auditAfterSecond.filter((a) => a.kind === 'state_changed')).toHaveLength(0)
    // Only the second scan_completed marker is new.
    expect(auditAfterSecond).toHaveLength(auditAfterFirst.length + 1)
  })

  it('a new thread about a resolved responsibility never becomes a second Needs You', async () => {
    const source = await FixtureSource.load(seed)
    const store = new LocalLedgerStore()
    await runScan({ source, store, userId: 'u', specialists: stubs, now })

    const loops = await store.listLoops('u')
    const permit = loops.find((l) => l.sourceRefs.some((r) => r.threadId === 'thr-permit'))
    expect(permit?.status).toBe('RESOLVED')

    const notice = loops.find((l) => l.sourceRefs.some((r) => r.threadId === 'thr-permit-notice'))
    expect(notice?.status).toBe('WATCHING')
    expect(notice?.owner).toBe('nobody')
    expect(notice?.id).not.toBe(permit?.id)
    const evidence = await store.listEvidence(notice?.id ?? '')
    expect(evidence.map((e) => e.supports)).toEqual(['CONTRADICTS'])

    const permitLoops = loops.filter((l) => /permit/i.test(l.title))
    expect(permitLoops.filter((l) => l.status === 'NEEDS_YOU')).toHaveLength(0)
  })

  it('a vague deadline leaves dueAt unset with low confidence instead of an invented date', async () => {
    const source = await FixtureSource.load(seed)
    const store = new LocalLedgerStore()
    await runScan({ source, store, userId: 'u', specialists: stubs, now })

    const loops = await store.listLoops('u')
    const advisor = loops.find((l) => l.sourceRefs.some((r) => r.threadId === 'thr-advisor'))
    expect(advisor).toBeDefined()
    expect(advisor?.dueAt).toBeUndefined()
    expect(advisor?.status).toBe('NEEDS_YOU')
    expect(advisor?.confidence).toBeLessThanOrEqual(0.5)
    // A dated sibling proves the pipeline does carry dueAt when the text gives one.
    const lab = loops.find((l) => l.sourceRefs.some((r) => r.threadId === 'thr-lab-fee'))
    expect(lab?.dueAt).toBe('2026-09-20T23:59:00-04:00')
  })

  it('handle executes the low and prepare-type actions and only lists the high-risk one', async () => {
    const source = await FixtureSource.load(seed)
    const store = new LocalLedgerStore()
    const sink = new FixtureActionSink()
    await runScan({ source, store, userId: 'u', specialists: stubs, now })

    const scholarship = (await store.listLoops('u')).find((l) =>
      l.sourceRefs.some((r) => r.threadId === 'thr-scholarship'),
    )
    const proposed = await store.listActions('u', { loopId: scholarship?.id ?? '' })
    expect(proposed.map((a) => a.riskTier).sort()).toEqual(['high', 'low', 'medium'])

    const result = await handleWhatYouCan({
      store,
      source,
      sink,
      userId: 'u',
      specialists: stubs,
      now,
    })

    const high = proposed.find((a) => a.riskTier === 'high')
    expect(high?.type).toBe('submit_form')
    expect(result.handled.map((h) => h.status)).toEqual(['EXECUTED', 'EXECUTED'])
    expect(result.handled.map((h) => h.actionId).sort()).toEqual(
      proposed
        .filter((a) => a.riskTier !== 'high')
        .map((a) => a.id)
        .sort(),
    )
    expect(result.needsYou).toEqual([
      {
        actionId: high?.id,
        loopId: scholarship?.id,
        summary: 'Submit the renewal form',
        reason: 'requires your approval',
      },
    ])
    expect((await store.getAction('u', high?.id ?? ''))?.status).toBe('PROPOSED')

    // ADR-0005: a high-risk action never reaches the sink.
    expect(sink.log).toHaveLength(2)
    expect(sink.log.map((e) => e.action.id)).not.toContain(high?.id)
    expect(sink.log.map((e) => e.action.riskTier)).not.toContain('high')
    expect(sink.log.map((e) => e.action.type)).not.toContain('submit_form')
  })
})
