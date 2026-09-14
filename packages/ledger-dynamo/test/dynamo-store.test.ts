import { randomUUID } from 'node:crypto'
import { runStoreContract } from '@openloop/shared/testing'
import { describe } from 'vitest'
import { DynamoLedgerStore } from '../src/index'

/**
 * Runs the shared LedgerStore contract against DynamoDB. CI sets DYNAMODB_ENDPOINT to a
 * DynamoDB Local container, which needs no AWS credentials; OPENLOOP_DYNAMO_TEST_TABLE alone runs
 * the same contract against the real table in AWS (create either with
 * `pnpm --filter @openloop/ledger-dynamo create-table`). Each store instance gets its own
 * partition prefix so runs never see each other's rows.
 */
const endpoint = process.env.DYNAMODB_ENDPOINT
const table =
  process.env.OPENLOOP_DYNAMO_TEST_TABLE ?? (endpoint ? 'openloop-ledger-test' : undefined)

if (table) {
  runStoreContract(
    `DynamoLedgerStore (${endpoint ? `${table} on ${endpoint}` : table})`,
    async () =>
      new DynamoLedgerStore({
        tableName: table,
        partitionPrefix: `${randomUUID()}#`,
        ...(endpoint ? { endpoint } : {}),
      }),
  )
} else {
  describe.skip('DynamoLedgerStore contract (set DYNAMODB_ENDPOINT or OPENLOOP_DYNAMO_TEST_TABLE)', () => {})
}
