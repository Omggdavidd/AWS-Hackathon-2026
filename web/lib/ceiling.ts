import 'server-only'
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { LEDGER_TABLE } from './ledger'

/**
 * How many runtime invocations the deployment will pay for in a UTC day, across Scan, Check for new
 * mail, Handle, Catch me up and Approve together. `isSameOrigin` is a bill boundary anyone willing
 * to set one header walks through, and the $60 budget alarm mails somebody rather than refusing the
 * next call (`docs/security.md`), so this is the only thing that bounds a script.
 *
 * 500 is deliberately far above any human. A scan is a minute and a half on the runtime, so one
 * person clicking cannot reach a tenth of it in a day; a whole team rehearsing plus a day of judges
 * is on the order of 500 invocations in total, not each. A script reaches it in a minute and stops.
 */
export const DAILY_CEILING = Number(process.env.OPENLOOP_DAILY_INVOCATIONS ?? 500)

/** The refusal each caller renders, through the error path it already has. */
export const CEILING_MESSAGE =
  'This demo has run the agent as many times as it may today. The limit resets at midnight UTC.'

/** Two days, so the row for a day still in progress somewhere is never collected early. */
const TTL_SECONDS = 2 * 24 * 60 * 60

let client: DynamoDBClient | undefined

function getClient(): DynamoDBClient {
  // Short timeouts and one retry: a slow or wedged table must not add to the wait before a scan.
  client ??= new DynamoDBClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 1000, requestTimeout: 2000 },
  })
  return client
}

/**
 * Count this invocation and say whether it may go ahead.
 *
 * **Fails open by construction.** No table, an unusable ceiling, an unreachable or throttled table,
 * a response without the counter, a counter that is not a number: every one of those returns true.
 * Locking a judge out of the live demo mid-evaluation would cost more than the abuse this prevents,
 * so the only path that returns false is a successful read of a count above the ceiling.
 */
export async function withinDailyCeiling(): Promise<boolean> {
  if (!LEDGER_TABLE) return true
  if (!Number.isFinite(DAILY_CEILING) || DAILY_CEILING <= 0) return true
  try {
    const used = await countInvocation(LEDGER_TABLE)
    return used === undefined || used <= DAILY_CEILING
  } catch {
    return true
  }
}

/**
 * One atomic UpdateItem: ADD returns the count including this request, so two lambdas racing get 1
 * and 2 rather than both reading 0. The row sits outside the `USER#` partitions the ledger and
 * `purgeUser` use, so resetting the demo cannot also reset the ceiling.
 */
async function countInvocation(table: string): Promise<number | undefined> {
  const res = await getClient().send(
    new UpdateItemCommand({
      TableName: table,
      Key: { PK: { S: `RATE#${utcDay()}` }, SK: { S: 'INVOCATIONS' } },
      UpdateExpression: 'SET #ttl = :ttl ADD #used :one',
      ExpressionAttributeNames: { '#ttl': 'ttl', '#used': 'used' },
      ExpressionAttributeValues: {
        ':ttl': { N: String(Math.floor(Date.now() / 1000) + TTL_SECONDS) },
        ':one': { N: '1' },
      },
      ReturnValues: 'UPDATED_NEW',
    }),
  )
  const used = Number(res.Attributes?.used?.N)
  return Number.isFinite(used) ? used : undefined
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10)
}
