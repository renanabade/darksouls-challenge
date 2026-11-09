-- A player's account. The email signs in and stays private; the display name is what the ranking shows.
CREATE TABLE users (
    id               uuid PRIMARY KEY,
    email            varchar(256) NOT NULL,
    normalized_email varchar(256) NOT NULL UNIQUE,
    password_hash    varchar(100) NOT NULL,
    display_name     varchar(32) UNIQUE,
    created_at       timestamptz NOT NULL
);

-- A generated challenge, stored once per code. The document is what clients read; it is never queried inside.
CREATE TABLE challenges (
    id                uuid PRIMARY KEY,
    code              varchar(64) NOT NULL UNIQUE,
    data_version      varchar(32) NOT NULL,
    generator_version varchar(32) NOT NULL,
    score             integer NOT NULL,
    document          jsonb NOT NULL,
    created_at        timestamptz NOT NULL
);

-- A challenge to generate. Workers take jobs with FOR UPDATE SKIP LOCKED.
CREATE TABLE generation_jobs (
    id           uuid PRIMARY KEY,
    code         varchar(64) NOT NULL,
    status       varchar(16) NOT NULL,
    challenge_id uuid,
    error        text,
    created_at   timestamptz NOT NULL,
    finished_at  timestamptz
);

CREATE INDEX generation_jobs_status_created_at ON generation_jobs (status, created_at);
CREATE INDEX generation_jobs_code ON generation_jobs (code);

-- A player's word that they finished a challenge. One per player and challenge.
CREATE TABLE runs (
    id           uuid PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    challenge_id uuid NOT NULL REFERENCES challenges (id) ON DELETE CASCADE,
    deaths       integer NOT NULL,
    proof_url    varchar(300),
    finished_at  timestamptz NOT NULL,
    UNIQUE (user_id, challenge_id)
);

CREATE INDEX runs_challenge_id ON runs (challenge_id);
