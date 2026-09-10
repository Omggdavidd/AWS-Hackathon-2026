---
status: proposed
date: 2026-09-10
decision-makers: team
---

# Persist the ledger in one DynamoDB table behind the storage adapter, with an in-process local adapter

## Context and Problem Statement

ADR-0004 requires an explicit ledger (OpenLoop, Evidence, ProposedAction, audit events) behind an adapter interface with a local and an AWS implementation. The AWS store must be serverless, cheap, quick to provision and reachable from both the AgentCore runtime and the web app.

## Considered Options

* DynamoDB, single table, via `@aws-sdk/lib-dynamodb`
* Amazon RDS or Aurora Serverless (PostgreSQL)
* A hosted third-party database outside AWS
* Files on S3

## Decision Outcome

Chosen option: "DynamoDB single table", because it needs no VPC, no connection pooling, no migrations, and the access patterns are few and known: loops by user and status, evidence by loop, actions by loop and status, audit events by loop in time order. Keys: `PK = USER#<id>`, `SK = LOOP#<id>` and `LOOP#<id>#EVIDENCE#<ts>` style prefixes, plus one GSI for status queries; designed in Phase 2 from the query list, not the other way round.

The local adapter is an in-process implementation (JSON file on disk, loaded at start) used by tests, `agentcore dev` and the seeded demo. DynamoDB Local (`amazon/dynamodb-local` 3.3.x in Docker) is available for integration checks but is not required for daily work.

### Consequences

* Good, because the seeded demo and the tests never touch AWS, and the AWS path differs only by adapter.
* Good, because the table costs nothing at hackathon scale and is created by a script in minutes.
* Bad, because single-table modelling front-loads a design decision; kept small by limiting the query list to what the dashboard needs.
* Bad, because two adapters can drift; the adapter contract has one shared test suite run against both.

## More Information

* DynamoDB Local: <https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html>
* Single-table guidance: <https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html>
