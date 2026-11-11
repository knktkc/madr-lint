# Use PostgreSQL for the order service

* Status: accepted
* Deciders: platform team, order team
* Date: 2026-05-01

Technical Story: the order service outgrew its embedded SQLite file.

## Context and Problem Statement

The order service stores orders in an embedded SQLite file. Write volume grew
tenfold this year, and the file lock now limits throughput. Which database
should replace it?

## Decision Drivers

* Sustained write throughput of 2,000 orders per second
* Point-in-time recovery
* Existing operational experience in the team

## Considered Options

* PostgreSQL
* MySQL
* A managed document store

## Decision Outcome

Chosen option: "PostgreSQL", because the team already operates it and it meets
the throughput target in the load test.

### Positive Consequences

* Mature backup and recovery tooling
* One fewer technology to learn

### Negative Consequences

* Another cluster to run and patch

## Pros and Cons of the Options

### PostgreSQL

* Good, because the team runs three clusters already
* Good, because it supports point-in-time recovery
* Bad, because vertical scaling has a ceiling

### MySQL

* Good, because it meets the throughput target
* Bad, because nobody on the team has run it in production

### A managed document store

* Good, because there is nothing to operate
* Bad, because orders are relational and joins would move into code

## Links

* Refines [ADR-0003](0003-split-the-monolith.md)
