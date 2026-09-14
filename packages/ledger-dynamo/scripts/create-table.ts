import {
  CreateTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  ResourceInUseException,
  UpdateTimeToLiveCommand,
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

// Rows that carry a `ttl` epoch-second attribute are meant to expire; without this they are kept
// for ever. TTL is a separate call from CreateTable, so an existing table picks it up on a re-run.
const { TimeToLiveDescription } = await client.send(
  new DescribeTimeToLiveCommand({ TableName: tableName }),
)
const ttlStatus = TimeToLiveDescription?.TimeToLiveStatus
if (ttlStatus === 'ENABLED' || ttlStatus === 'ENABLING') {
  console.log(`${tableName} TTL on ttl is already ${ttlStatus.toLowerCase()}`)
} else {
  try {
    await client.send(
      new UpdateTimeToLiveCommand({
        TableName: tableName,
        TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      }),
    )
    console.log(`enabling TTL on ttl for ${tableName}…`)
  } catch (err) {
    // An already-enabled TTL, and a second change inside the same hour, both come back as a plain
    // ValidationException the SDK does not model as a class. Neither should fail a re-run.
    if (err instanceof Error && err.name === 'ValidationException')
      console.log(`${tableName} TTL unchanged: ${err.message}`)
    else throw err
  }
}
