import {
  CreateRoleCommand,
  GetRoleCommand,
  IAMClient,
  PutRolePolicyCommand,
} from '@aws-sdk/client-iam'
import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  GetScheduleCommand,
  SchedulerClient,
  UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler'

/**
 * The agent checks in on its own (ADR-0013): an EventBridge Scheduler schedule invokes the deployed
 * runtime with the `catch_up` command once a day, 07:00 America/New_York, against the shared ledger.
 * One model call, about a cent. Idempotent: creates the IAM role and the schedule when missing and
 * updates them when present.
 *   pnpm --filter @openloop/agent create-schedule                    # create or update, enabled
 *   pnpm --filter @openloop/agent create-schedule -- --disable       # keep it, stop it firing (before a recording)
 *   pnpm --filter @openloop/agent create-schedule -- --enable        # fire again
 *   pnpm --filter @openloop/agent create-schedule -- --delete        # remove the schedule (the role stays)
 *   pnpm --filter @openloop/agent create-schedule -- --at "cron(0 7 * * ? *)" --tz America/New_York
 *   OPENLOOP_RUNTIME_ARN (required), OPENLOOP_LEDGER_TABLE, OPENLOOP_USER_ID, AWS_REGION override the rest
 */
const region = process.env.AWS_REGION ?? 'us-east-1'
const runtimeArn = process.env.OPENLOOP_RUNTIME_ARN
const table = process.env.OPENLOOP_LEDGER_TABLE ?? 'openloop-ledger'
const userId = process.env.OPENLOOP_USER_ID ?? 'user-alex'
const flag = (name: string) => process.argv.includes(name)
const value = (name: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const expression = value('--at') ?? 'cron(0 7 * * ? *)'
const timezone = value('--tz') ?? 'America/New_York'
const state = flag('--disable') ? 'DISABLED' : 'ENABLED'

const SCHEDULE = 'openloop-catch-up'
const ROLE = 'openloop-scheduler'

if (!runtimeArn) {
  console.log('OPENLOOP_RUNTIME_ARN is not set; `agentcore status --json` from agent/ prints it')
  process.exit(1)
}
const runtimeMatch = /^arn:aws:bedrock-agentcore:([^:]+):(\d+):runtime\/[\w-]+$/.exec(runtimeArn)
if (!runtimeMatch) {
  console.log(`OPENLOOP_RUNTIME_ARN does not look like a runtime ARN: ${runtimeArn}`)
  process.exit(1)
}
const [, runtimeRegion, account] = runtimeMatch as unknown as [string, string, string]
if (runtimeRegion !== region) {
  console.log(`runtime is in ${runtimeRegion} but AWS_REGION is ${region}; set them to match`)
  process.exit(1)
}

const scheduler = new SchedulerClient({ region })
const iam = new IAMClient({ region })

if (flag('--delete')) {
  try {
    await scheduler.send(new DeleteScheduleCommand({ Name: SCHEDULE }))
    console.log(`deleted schedule ${SCHEDULE}; the ${ROLE} role stays`)
  } catch (err) {
    if ((err as { name?: string }).name !== 'ResourceNotFoundException') throw err
    console.log(`schedule ${SCHEDULE} does not exist; nothing to delete`)
  }
  process.exit(0)
}

/** The role EventBridge Scheduler assumes: it may invoke this one runtime and nothing else. */
async function ensureRole(): Promise<string> {
  const trust = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Service: 'scheduler.amazonaws.com' },
        Action: 'sts:AssumeRole',
        Condition: { StringEquals: { 'aws:SourceAccount': account } },
      },
    ],
  }
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'InvokeRuntime',
        Effect: 'Allow',
        Action: ['bedrock-agentcore:InvokeAgentRuntime'],
        Resource: [runtimeArn, `${runtimeArn}/runtime-endpoint/*`],
      },
    ],
  }
  let arn: string | undefined
  try {
    arn = (await iam.send(new GetRoleCommand({ RoleName: ROLE }))).Role?.Arn
    console.log(`role ${ROLE} exists`)
  } catch (err) {
    if ((err as { name?: string }).name !== 'NoSuchEntityException') throw err
    arn = (
      await iam.send(
        new CreateRoleCommand({
          RoleName: ROLE,
          AssumeRolePolicyDocument: JSON.stringify(trust),
          Description:
            'EventBridge Scheduler invokes the Open Loops runtime for the daily catch-up',
        }),
      )
    ).Role?.Arn
    console.log(`created role ${ROLE}`)
  }
  if (!arn) throw new Error(`could not resolve the ARN of role ${ROLE}`)
  await iam.send(
    new PutRolePolicyCommand({
      RoleName: ROLE,
      PolicyName: 'InvokeOpenLoopRuntime',
      PolicyDocument: JSON.stringify(policy),
    }),
  )
  return arn
}

const roleArn = await ensureRole()

// EventBridge Scheduler calls the SDK operation with this input. The payload is the same JSON the
// web app sends for Catch me up; `<aws.scheduler.execution-id>` makes each run its own session.
const target = {
  Arn: 'arn:aws:scheduler:::aws-sdk:bedrockagentcore:invokeAgentRuntime',
  RoleArn: roleArn,
  Input: JSON.stringify({
    AgentRuntimeArn: runtimeArn,
    RuntimeSessionId: 'openloop-scheduled-<aws.scheduler.execution-id>',
    ContentType: 'application/json',
    Accept: 'text/event-stream',
    Payload: JSON.stringify({
      command: 'catch_up',
      userId,
      ledger: { kind: 'dynamo', table },
    }),
  }),
  RetryPolicy: { MaximumRetryAttempts: 0 },
}
const definition = {
  Name: SCHEDULE,
  Description: `Open Loops: the agent catches up on ${userId}'s ledger (${table}) once a day (ADR-0013)`,
  ScheduleExpression: expression,
  ScheduleExpressionTimezone: timezone,
  FlexibleTimeWindow: { Mode: 'OFF' as const },
  State: state as 'ENABLED' | 'DISABLED',
  Target: target,
}

let existing = false
try {
  await scheduler.send(new GetScheduleCommand({ Name: SCHEDULE }))
  existing = true
} catch (err) {
  if ((err as { name?: string }).name !== 'ResourceNotFoundException') throw err
}
if (existing) {
  await scheduler.send(new UpdateScheduleCommand(definition))
  console.log(`updated schedule ${SCHEDULE}`)
} else {
  await scheduler.send(new CreateScheduleCommand(definition))
  console.log(`created schedule ${SCHEDULE}`)
}
console.log(
  `${state === 'ENABLED' ? 'fires' : 'disabled; would fire'} ${expression} ${timezone}: catch_up for ${userId} on ${table} through ${runtimeArn.split('/').pop()}`,
)
