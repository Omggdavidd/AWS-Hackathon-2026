import { randomUUID } from 'node:crypto'
import { runStoreContract } from '@openloop/shared/testing'
import { describe } from 'vitest'
import { DynamoLedgerStore } from '../src/index'

/**
 * Runs the shared LedgerStore contract against a real table. Skipped unless
 * OPENLOOP_DYNAMO_TEST_TABLE is set (create it with `pnpm --filter @openloop/ledger-dynamo create-table`).
 * Each store instance gets its own partition prefix so runs never see each other's rows.
 */
const table = process.env.OPENLOOP_DYNAMO_TEST_TABLE

if (table) {
  runStoreContract(
    `DynamoLedgerStore (${table})`,
    async () => new DynamoLedgerStore({ tableName: table, partitionPrefix: `${randomUUID()}#` }),
  )
} else {
  describe.skip('DynamoLedgerStore contract (set OPENLOOP_DYNAMO_TEST_TABLE to run)', () => {})
}
