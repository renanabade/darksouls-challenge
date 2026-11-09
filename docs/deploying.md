# Deploying

How the public site is put on the air, and how to change it later. Why it is hosted this way is in [ADR 0018](adr/0018-hosting.md).

## The pieces

| Piece                   | Where                                                          | What it does                                             |
| ----------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| The image               | `Dockerfile`                                                   | The site and the server in one container                 |
| The Worker              | `deploy/`                                                      | Receives the requests and starts the container on demand |
| The `Deploy` workflow   | `.github/workflows/deploy.yml`                                 | Builds the image, publishes both, hands over the secrets |
| The database            | [Neon](https://neon.com), project `darksouls`                  | PostgreSQL; Flyway creates the tables on the first start |
| The Cloudflare account  | [dash.cloudflare.com](https://dash.cloudflare.com), `renanabade` | Runs the Worker and the container                        |

Containers need the Workers Paid plan (5 USD a month). The container sleeps after 15 minutes without requests, so the first request after
that waits for it to start.

## The secrets

All six are repository secrets (Settings → Secrets and variables → Actions). GitHub never shows a value again once it is saved: to change
one, save it again.

| Secret                  | Where it comes from                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | `npx wrangler whoami` in `deploy/`, or the right column of the Cloudflare dashboard's home page          |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare → My Profile → API Tokens → Create Token: template *Edit Cloudflare Workers*, plus *Account → Containers → Edit*, limited to the account |
| `JWT_SECRET`            | Random, made once: `openssl rand -base64 48 \| tr -d '\n'`                                                |
| `DATABASE_URL`          | From Neon's *Connect*: `jdbc:postgresql://` followed by what comes after the `@`, for example `jdbc:postgresql://ep-xxx.aws.neon.tech/neondb?sslmode=require` |
| `DATABASE_USERNAME`     | From Neon's *Connect*: what comes before the `:`, for example `neondb_owner`                               |
| `DATABASE_PASSWORD`     | From Neon's *Connect*: what comes between the `:` and the `@`                                              |

Neon shows the connection as `postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require`. Java needs it split: the URL starts with `jdbc:` and
carries neither the user nor the password.

Save each one from your own terminal, so the value is never pasted anywhere else. From any folder:

```sh
gh secret set NAME -R renanabade/darksouls-challenge
```

It asks for the value without showing it. To check which ones exist (names only):

```sh
gh secret list -R renanabade/darksouls-challenge
```

## Deploying

Actions → **Deploy** → **Run workflow**, on `main`. Or from a terminal:

```sh
gh workflow run deploy.yml -R renanabade/darksouls-challenge
gh run watch -R renanabade/darksouls-challenge
```

The workflow publishes the Worker and the image, then copies `JWT_SECRET` and the three database secrets into the Worker, which passes them
to the container. The address appears at the end of the *Deploy the Worker and the container* step.

Run it again whenever `main` has changes the site should get, or after changing a secret.

## Checking it

- The site answers at the Worker's address, and `/api/health` answers `UP`.
- The first request after a sleep can take several seconds: that is the container starting.
- Logs: Cloudflare → Workers & Pages → `darksouls-challenge` → Logs, or `npx wrangler tail` in `deploy/`.

## When it fails

| Symptom                                       | Likely cause                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `Authentication error` in the deploy step     | `CLOUDFLARE_API_TOKEN` missing, expired, or without the Containers permission |
| An error about the plan or containers        | The account is not on Workers Paid                                           |
| The site answers 5xx and the logs show JDBC   | A database secret is wrong, or the container cannot reach Neon's port 5432 (ADR 0018 has the way out) |
| The logs say `JWT_SECRET` is missing          | The secrets step did not run: run the workflow again                         |
| The first request times out, the next one works | The start took longer than the Worker waits for the port                   |

## Changing the password of the database

Reset it in Neon, save `DATABASE_PASSWORD` again, and run the workflow. Changing `JWT_SECRET` signs every player out.
