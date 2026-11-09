package com.renanabade.darksouls.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.micrometer.core.instrument.MeterRegistry;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.test.context.TestPropertySource;

/** What only the people running the server see, and what stops one player from taking the server for themselves. */
@TestPropertySource(properties = {
    "management.server.port=0",
    "management.prometheus.metrics.export.enabled=true",
    "rate-limits.preview-per-minute=2",
    "rate-limits.client-header=CF-Connecting-IP"
})
class OperationsTest extends ServerTest {
    @Autowired
    private MeterRegistry meters;

    @Value("${local.management.port}")
    private int managementPort;

    @Value("${local.server.port}")
    private int serverPort;

    private static HttpResponse<String> get(int port, String path, String... headers) throws IOException, InterruptedException {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (headers.length > 0) request.headers(headers);
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void keeps_the_operations_endpoints_off_the_public_port() throws Exception {
        assertTrue(get(managementPort, "/actuator/health").body().contains("\"status\""));
        assertFalse(get(serverPort, "/actuator/health").body().contains("\"status\":"));
    }

    @Test
    void counts_the_jobs_and_exports_them_for_prometheus() throws Exception {
        readyJob(Map.of("seed", "measured", "length", "short"));
        assertTrue(meters.get("generation.jobs").tag("outcome", "done").counter().count() >= 1);
        assertTrue(meters.get("generation.duration").timer().count() >= 1);
        assertTrue(get(managementPort, "/actuator/prometheus").body().contains("generation_jobs"));
    }

    @Test
    void limits_each_player_by_the_address_the_proxy_gives_not_by_the_proxys_own() throws Exception {
        var a = new String[] {"CF-Connecting-IP", "203.0.113.1"};
        var b = new String[] {"CF-Connecting-IP", "203.0.113.2"};
        assertEquals(200, get(serverPort, "/api/previews", a).statusCode());
        assertEquals(200, get(serverPort, "/api/previews", a).statusCode());
        assertEquals(429, get(serverPort, "/api/previews", a).statusCode());
        assertEquals(200, get(serverPort, "/api/previews", b).statusCode());
    }
}
