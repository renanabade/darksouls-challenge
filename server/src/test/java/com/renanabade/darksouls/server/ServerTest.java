package com.renanabade.darksouls.server;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.renanabade.darksouls.server.generation.GenerationWorker;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** The whole server over HTTP, on a real PostgreSQL. The tests run the worker's steps themselves, so nothing races them. */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "generation.background=false",
            "rate-limits.auth-per-minute=100000",
            "rate-limits.generation-per-minute=100000",
            "rate-limits.preview-per-minute=100000",
            "app.jwt.secret=a-secret-for-the-tests-and-nothing-else"
        })
abstract class ServerTest {
    protected static final JsonMapper JSON = JsonMapper.builder().build();

    private final HttpClient http = HttpClient.newHttpClient();

    @LocalServerPort
    private int port;

    @Autowired
    protected GenerationWorker worker;

    @Autowired
    protected JdbcTemplate jdbc;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", TestDatabase::url);
        registry.add("spring.datasource.username", TestDatabase::user);
        registry.add("spring.datasource.password", TestDatabase::password);
    }

    @BeforeEach
    void clearTables() {
        jdbc.update("DELETE FROM runs");
        jdbc.update("DELETE FROM generation_jobs");
        jdbc.update("DELETE FROM challenges");
    }

    /** What the server answered. */
    protected record Answer(int status, String body) {
        JsonNode json() {
            return JSON.readTree(body);
        }
    }

    /** A client of the API, with a bearer token when signed in. */
    protected final class Client {
        String token;

        Answer send(String method, String path, Object body) {
            var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
            if (token != null) builder.header("Authorization", "Bearer " + token);
            if (body == null) {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                var text = body instanceof String raw ? raw : JSON.writeValueAsString(body);
                builder.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(text));
            }

            try {
                var response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
                return new Answer(response.statusCode(), response.body());
            } catch (IOException error) {
                throw new java.io.UncheckedIOException(error);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(error);
            }
        }

        Answer get(String path) {
            return send("GET", path, null);
        }

        Answer post(String path, Object body) {
            return send("POST", path, body);
        }

        Answer put(String path, Object body) {
            return send("PUT", path, body);
        }

        Answer delete(String path) {
            return send("DELETE", path, null);
        }
    }

    protected Client client() {
        return new Client();
    }

    /** The job of a request, once the worker has run it. */
    protected JsonNode readyJob(Object body) {
        var client = client();
        var response = client.post("/api/challenges", body);
        assertEquals(202, response.status(), response.body());
        var id = response.json().get("id").stringValue();
        worker.runNextJob();
        return client.get("/api/jobs/" + id).json();
    }

    protected static String unique(String prefix) {
        return (prefix + " " + UUID.randomUUID().toString().replace("-", "")).substring(0, 20);
    }
}
