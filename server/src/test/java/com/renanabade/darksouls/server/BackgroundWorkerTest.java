package com.renanabade.darksouls.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.fail;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/** The one place the worker runs by itself. */
@TestPropertySource(properties = "generation.background=true")
class BackgroundWorkerTest extends ServerTest {
    @Test
    void the_background_worker_picks_up_what_is_queued() throws InterruptedException {
        var client = client();
        var id = client.post("/api/challenges", Map.of("seed", "in-the-background", "length", "short")).json().get("id").stringValue();
        for (var i = 0; i < 300; i++) {
            var status = client.get("/api/jobs/" + id).json().get("status").stringValue();
            if (!status.equals("queued")) {
                assertEquals("done", status);
                return;
            }

            Thread.sleep(100);
        }

        fail("the job never finished");
    }
}
