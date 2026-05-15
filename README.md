# AOC Enterprise

AOC Enterprise is the runtime implementation layer for Architects of Change Protocol.

It contains enterprise-grade runtime infrastructure for:

- policy evaluation
- capability requests and grants
- delegated authority chains
- execution grants
- AI agent scoped access
- audit and reliability helpers
- SDK implementation
- Supabase runtime migrations

## Layering

- AOC Protocol: semantic contracts and interfaces
- AOC Enterprise: runtime, persistence, APIs, SDK implementation
- PMFreak: vertical PM product consuming AOC Enterprise and AOC Protocol

## Current status

Initial copy-first runtime extraction from PMFreak. This repository is being populated before PMFreak switches imports to package boundaries.
