package com.renanabade.darksouls.core.generation;

import static com.renanabade.darksouls.core.Fixtures.DS1;
import static com.renanabade.darksouls.core.Fixtures.args;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.renanabade.darksouls.core.orders.Difficulty;
import com.renanabade.darksouls.core.orders.OrderArgs;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class DocumentTest {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    @Test
    void writes_a_challenge_as_plain_json_with_its_manual() {
        var document = new GenerationRequest(null, "doc", List.of(Difficulty.HARD), Length.SHORT, null, null, null, null).run(DS1).get(0);
        var root = MAPPER.readTree(CoreJson.write(document));
        assertEquals("doc", root.get("config").get("seed").stringValue());
        assertEquals("hard", root.get("config").get("difficulty").stringValue());
        assertEquals("short", root.get("config").get("length").stringValue());
        assertEquals(document.manual(), root.get("manual").stringValue());
        JsonNode lord = null;
        for (var order : root.get("orders")) {
            if (order.get("id").stringValue().equals("lord-order")) lord = order;
        }

        assertEquals(4, lord.get("args").get("order").size());
        assertNull(lord.get("chapter"));
    }

    @Test
    void reads_back_the_arguments_it_writes() {
        var original = args("area", "depths", "chests", 3, "order", List.of("a", "b"));
        var back = MAPPER.readValue(CoreJson.write(original), OrderArgs.class);
        assertEquals("depths", back.text("area"));
        assertEquals(3, back.number("chests"));
        assertEquals(List.of("a", "b"), back.list("order"));
    }

    @Test
    void gives_one_document_per_player_in_their_order() {
        var documents = new GenerationRequest(null, "doc", List.of(Difficulty.EASY, Difficulty.HARD), Length.SHORT, null, null, null, null).run(DS1);
        assertEquals(List.of(Difficulty.EASY, Difficulty.HARD), documents.stream().map(d -> d.config().difficulty()).toList());
    }

    @Test
    void draws_a_seed_when_none_is_given() {
        assertFalse(new GenerationRequest(null, null, null, Length.SHORT, null, null, null, null).run(DS1).get(0).config().seed().isEmpty());
    }

    @Test
    void reports_what_is_wrong_with_a_request() {
        assertEquals(List.of(), new GenerationRequest(null, null, null, null, null, null, null, null).problems());
        assertEquals(
                List.of(
                        "the seed must have 1 to 64 characters",
                        "a challenge has 1 to 8 players",
                        "the class must have 1 to 32 characters",
                        "the gift row cannot be negative",
                        "the level cap must be positive"),
                new GenerationRequest(null, " ", List.of(), null, null, "", -1, 0).problems());
    }
}
