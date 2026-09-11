import {
  CreateTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb'

/**
 * Create the single ledger table (ADR-0009). Idempotent.
 *   pnpm --filter @openloop/ledger-dynamo create-table               # openloop-ledger in AWS_REGION
 *   OPENLOOP_LEDGER_TABLE=openloop-ledger-test pnpm --filter @openloop/ledger-dynamo create-table
 *   DYNAMODB_ENDPOINT=http://localhost:8000 ...                       # DynamoDB Local
 */
const tableName = process.env.OPENLOOP_LEDGER_TABLE ?? 'openloop-ledger'
const region = process.env.AWS_REGION ?? 'us-east-1'
const endpoint = process.env.DYNAMODB_ENDPOINT
const client = new DynamoDBClient({ region, ...(endpoint ? { endpoint } : {}) })

try {
  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      Tags: [{ Key: 'project', Value: 'openloop' }],
    }),
  )
  console.log(`creating ${tableName} in ${region}…`)
} catch (err) {
  if (err instanceof ResourceInUseException) console.log(`${tableName} already exists`)
  else throw err
}
await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: tableName })
console.log(`${tableName} is active`)
