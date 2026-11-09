package com.renanabade.darksouls.server;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;

/**
 * A real PostgreSQL for the tests: the job queue depends on its row locks, so a fake would not test it. CI gives one as a service, in
 * TEST_POSTGRES (a JDBC URL to a server where a database can be created). Without it, a real server starts from binaries in the test
 * dependencies, so the tests need nothing installed.
 */
final class TestDatabase {
    private static final String USER = "postgres";
    private static final String PASSWORD = "postgres";
    private static final String URL = create();

    private TestDatabase() {}

    static String url() {
        return URL;
    }

    static String user() {
        return USER;
    }

    static String password() {
        return System.getenv("TEST_POSTGRES") != null ? PASSWORD : "";
    }

    private static String create() {
        var admin = System.getenv("TEST_POSTGRES");
        if (admin == null) {
            try {
                return EmbeddedPostgres.start().getJdbcUrl(USER, "postgres");
            } catch (IOException error) {
                throw new UncheckedIOException(error);
            }
        }

        var name = "darksouls_test_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = DriverManager.getConnection(admin, USER, PASSWORD);
                var statement = connection.createStatement()) {
            statement.execute("CREATE DATABASE " + name);
        } catch (SQLException error) {
            throw new IllegalStateException(error);
        }

        return admin.substring(0, admin.lastIndexOf('/') + 1) + name;
    }
}
