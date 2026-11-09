package com.renanabade.darksouls.server;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.IOException;
import java.io.UncheckedIOException;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * A real PostgreSQL for the tests: the job queue depends on its row locks, so a fake would not test it. With Docker, as in CI, it is the
 * version the project runs on, from Testcontainers. Without Docker, a real server starts from binaries in the test dependencies, so the tests
 * need nothing installed.
 */
final class TestDatabase {
    private record Connection(String url, String user, String password) {}

    private static final Connection CONNECTION = start();

    private TestDatabase() {}

    static String url() {
        return CONNECTION.url();
    }

    static String user() {
        return CONNECTION.user();
    }

    static String password() {
        return CONNECTION.password();
    }

    private static Connection start() {
        if (DockerClientFactory.instance().isDockerAvailable()) {
            // Testcontainers' own reaper removes it when the tests end.
            var container = new PostgreSQLContainer("postgres:17");
            container.start();
            return new Connection(container.getJdbcUrl(), container.getUsername(), container.getPassword());
        }

        try {
            return new Connection(EmbeddedPostgres.start().getJdbcUrl("postgres", "postgres"), "postgres", "");
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }
}
