# 17. Generating on the server, and a site in Angular

- Status: accepted

## Context

The site used to generate in the browser, with the domain core compiled to WebAssembly, so it could be hosted with no server at all. Java
has no first-class way to do the same.

## Decision

The core runs only on the server. The site calls `/api/previews` with a link or a form, and shows what comes back. A preview is drawn on
the spot and stored nowhere, so browsing costs no rows; a run recorded on the ranking goes through the job table like any other stored
challenge. The site is in Angular, with standalone components and signals, and is served by the same process as the API.

| Considered         | Why not                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- |
| TeaVM              | Compiles the core to the browser, but limits the Java it may use, and is one more risk  |
| A site in Thymeleaf | All Java and simple, but what a Java team usually pairs with Spring is Angular or React |

## Consequences

- The site no longer works without the server, and a host that sleeps makes the first visit slow.
- A challenge now costs the server CPU, so previews have a rate limit of their own.
- The site is much lighter: about 93 kB transferred, with no runtime to download.
- A code from another version still opens, with a notice that it now gives another challenge. Only storing one is refused.
