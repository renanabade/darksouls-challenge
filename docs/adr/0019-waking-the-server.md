# 19. Waking the server cheaply and quickly

- Status: accepted

## Context

The server is a container that sleeps when nobody plays (ADR 0018). Memory is billed for every second it is awake, and a custom instance
with a whole vCPU must have 3 GiB, so the time it stays awake is the cost. Starting it is the wait: the JVM and Spring took about 10
seconds on Cloudflare before the database was reached. Cloudflare offers no way to keep an instance warm, and a snapshot keeps only the
disk, so every wake starts the JVM from nothing.

At first the container served the site too, so opening the page woke it and every visitor waited for the start before seeing anything.

## Decision

- **The site is static assets.** The Worker serves the built Angular app from the edge, free and without waking the server; only `/api/*`
  reaches the Worker's code. The image still holds the site, so it runs alone as before.
- **It sleeps two minutes after its last request**, not fifteen. A player who generates a challenge and goes to play needs nothing more
  from it, and one who rerolls finds it awake. Stopping it after every request would make each click pay the start again.
- **The page wakes it as it opens**, with a call nobody waits for, so it starts while the player reads and chooses.
- **Answers that cannot change are kept at the edge** with the Cache API: the options and the challenges of a link (a code always makes
  the same challenge) until the next deploy, whose version is in the cache key, and the ranking for 30 seconds. A link shared around then
  wakes the server once per data center. Nothing personal is kept: a call with a token is never cached.
- **The image archives the classes the server loads as it starts** (CDS). The archive comes from a start at build time that stops once
  the context is up, with no database. Measured on a laptop, the start went from 4.6 to 2.9 seconds.
- **A small game fills the wait**: a knight jumps flames and gathers souls while the server wakes or a challenge is generated. It only
  shows when a request takes more than a moment, and only moves once the player starts it.

## Consequences

- Rough cost, besides the plan: about 2 minutes awake per visit, so the 25 GiB-hours a month included cover some 250 visits spread out.
  A site busy all day costs at most about 20 USD a month more, since there is one instance.
- After a deploy, the first request for each cached answer wakes the server again.
- Java 25's AOT cache, Spring AOT or a native image would start faster still. They are the next step if the start still hurts.
- Generating in the browser would wake the server only for accounts and the ranking, but undoes ADR 0017; it waits for a reason.
