# 0015. Accounts with ASP.NET Core Identity, and a self-declared ranking

## Status

Accepted. Both are first choices, easy to change while there are few players.

## Context

The project needs login and a ranking. The game is never modified, so the server cannot see a run. A mod could report one,
but that breaks the rule that the game stays untouched, and it brings the game's terms of use into question.

## Decision

**Accounts:** ASP.NET Core Identity's API endpoints, with email and password, stored in PostgreSQL, and bearer tokens. It is
the framework's own answer, needs no third party and no secrets to configure. A public display name, chosen separately, is
what the ranking shows; the email is never shown.

**Ranking:** a run is the player's own word, as the site says. The server checks that the challenge exists, and takes the
score from what it generated, never from the client. A player has one run per challenge, and can correct or remove it. An
optional https link can point at proof, for other players to judge. Players are ranked by the sum of their scores, ties going
to whoever got there first.

**Score:** the sum of the difficulty weights of the challenge's rules, times 10, times a factor per difficulty (1, 1.5, 2,
3). A first estimate, in the core, to tune by playing.

## Consequences

- Anyone can claim anything. That is acceptable for a community ranking of a fan project, and the proof link makes claims
  checkable by people. If it gets abused, moderation or the mod question can be reopened.
- No email is sent yet, so there is no email confirmation and no password reset. A forgotten password needs a mail provider,
  which is a decision for when the site is deployed.
- Tokens are signed with ASP.NET Core's data protection keys. On a host with an ephemeral disk the keys must be persisted, or
  every restart signs everyone out.
