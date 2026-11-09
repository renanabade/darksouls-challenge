# 18. Hosting on Cloudflare Containers

- Status: accepted

## Context

The site and the API are one process, in one image, and it needs PostgreSQL. It is a fan project, idle most of the time.

## Decision

A Worker in `deploy/` runs the image as a Cloudflare Container, one instance, which sleeps when nobody plays (ADR 0019 has how long, and
what keeps the wake short). Memory and
disk are billed while it runs, so an idle site costs close to nothing, and the price of that is a slower first visit. PostgreSQL lives
outside, because Cloudflare does not host it for a container.

The instance has 1 vCPU, because the server took 12 seconds to start on one in CI, and the Worker waits 20 seconds for the port by default;
the predefined types below a whole vCPU give it a quarter of one. A custom type asks for at least 3 GiB of memory per vCPU, so it has 3 GiB,
of which the server uses about 300 MiB. At 0.0000025 USD per GiB-second, that is about 0.027 USD for each hour it is awake, after the 25
GiB-hours a month the plan includes, or about 8 hours awake.

The image is built by a manual GitHub Actions workflow, whose runner has Docker. Nothing needs Docker on a developer's machine.

The container only hears from the Worker, so the rate limits read the player's address from `CF-Connecting-IP`. Cloudflare sets that header
at its edge, so a client cannot choose it. The header is a setting, off by default: on a server reached directly, anyone could forge it.

## Proved on the first deploy

The docs say a container has internet access by default, but no page says that a TCP connection to port 5432 works. It does: on the
first deploy the server reached Neon and was refused only for a wrong password.

## Consequences

- Cold starts are the cost of sleeping. If they hurt, a native image is the next thing to try, or a longer `sleepAfter`.
- One instance is what the in-memory rate limits assume.
- The operations endpoints stay on a port the Worker never forwards to.
