# 15. Accounts with signed tokens, and a self-declared ranking

- Status: accepted. Both are first choices, easy to change while there are few players.

## Context

The project needs login and a ranking. The game is never modified, so the server cannot see a run. A mod could report one, but that breaks
the rule that the game stays untouched, and it brings the game's terms of use into question.

## Decision

**Accounts:** email and password, stored in PostgreSQL with BCrypt, under Spring Security as an OAuth2 resource server. Tokens are signed
with HS256: an access token for an hour, and a refresh token for 14 days that only gets a new pair. A claim tells them apart, so neither
can do the other's job. A public display name, chosen separately, is what the ranking shows; the email is never shown.

**Ranking:** a run is the player's own word, as the site says. The server checks that the challenge exists, and takes the score from what
it generated, never from the client. A player has one run per challenge, and can correct or remove it. An optional https link can point at
proof, for other players to judge. Players are ranked by the sum of their scores, ties going to whoever got there first.

**Score:** the sum of the difficulty weights of the challenge's rules, times 10, times a factor per difficulty (1, 1.5, 2, 3). A first
estimate, in the core, to tune by playing.

## Consequences

- Anyone can claim anything. That is acceptable for a community ranking of a fan project, and the proof link makes claims checkable by
  people. If it gets abused, moderation or the mod question can be reopened.
- No email is sent yet, so there is no email confirmation and no password reset.
- The signing key comes from `JWT_SECRET`, and the server refuses to start without it. A restart signs nobody out.
- A refresh token cannot be revoked before it expires. Nothing needs that yet; a password reset will, and it should bring refresh tokens
  stored in the database.
