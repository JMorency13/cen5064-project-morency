# ADR-000 (EXAMPLE): Use SQLite instead of PostgreSQL for the data tier

**Date:** 2026-09-21
**Status:** accepted

## Context

The course scope allows exactly one data store. My system (a recipe
organizer) has a single user and modest data volume. PostgreSQL would
mirror industry setups but requires a running server on every machine
that clones the repo — including my partner's and my instructor's on
conference days, where "does it run as documented?" is checked literally.

## Decision

Use SQLite as the single data store, accessed only from the Data tier
behind a repository interface, so the Service and Domain tiers never
know which database is underneath.

## Consequences

Anyone can clone and run the system with zero database setup, which
protects my conference-day reviews. The repository interface means
swapping to PostgreSQL later is a Data-tier change only. I give up
practice with a client-server database, which I accept for this course.

---

*This is a worked example of the template in `adr-template.md`. Delete it
once you have real ADRs of your own — or keep it as a reference.*
