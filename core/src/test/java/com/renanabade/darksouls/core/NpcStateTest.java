package com.renanabade.darksouls.core;

import static com.renanabade.darksouls.core.Fixtures.DS1;
import static com.renanabade.darksouls.core.Fixtures.readFile;
import static com.renanabade.darksouls.core.Fixtures.set;
import static com.renanabade.darksouls.core.Fixtures.strings;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.renanabade.darksouls.core.orders.Mode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** NPC and shop state from the game's scripts, checked on the exported data set. */
class NpcStateTest {
    private static final Map<String, JsonNode> MERCHANTS = merchants();

    private static Map<String, JsonNode> merchants() {
        Map<String, JsonNode> merchants = new HashMap<>();
        for (var merchant : readFile("merchants")) merchants.put(merchant.get("id").stringValue(), merchant);
        return merchants;
    }

    private static List<Integer> leaveFlags(String merchant) {
        List<Integer> flags = new ArrayList<>();
        for (var leave : MERCHANTS.get(merchant).get("leaves")) flags.add(leave.get("flag").intValue());
        return flags;
    }

    private static Set<String> without(String item) {
        return Reachability.walk(DS1, ReachOptions.forbidItems(set(item))).regions();
    }

    private static Entrance entranceTo(String region) {
        return DS1.entrances().stream().filter(e -> e.to().equals(region)).findFirst().orElseThrow();
    }

    // Domhnall sells the set of whichever of Ornstein and Smough dies last, never both.
    @Test
    void gives_domhnalls_ornstein_and_smough_sets_as_exclusive_options() {
        var domhnall = MERCHANTS.get("domhnall-of-zena");
        JsonNode group = null;
        for (var candidate : domhnall.get("exclusive")) {
            if (candidate.get("id").stringValue().equals("ornstein-or-smough")) group = candidate;
        }

        var options = group.get("options");
        assertEquals(11510902, options.get(0).get("flag").intValue());
        assertEquals(11510903, options.get(1).get("flag").intValue());
        var ornstein = strings(options.get(0).get("items"));
        var smough = strings(options.get(1).get("items"));
        assertTrue(ornstein.stream().allMatch(i -> i.startsWith("Ornstein's")));
        assertTrue(smough.stream().allMatch(i -> i.startsWith("Smough's")));
        Set<String> stock = new HashSet<>();
        for (var item : domhnall.get("stock")) stock.add(item.get("name").stringValue());
        assertTrue(stock.containsAll(ornstein));
        assertTrue(stock.containsAll(smough));
    }

    // Kaathe appears after the Four Kings only while the Lordvessel is not placed, and leaves for good once refused or attacked.
    @Test
    void opens_kaathe_after_the_four_kings_before_the_lordvessel_is_placed() {
        assertEquals(List.of("the-abyss-darkstalker-kaathe"), strings(MERCHANTS.get("darkstalker-kaathe").get("regions")));
        assertEquals(List.of(1677), leaveFlags("darkstalker-kaathe"));
        assertEquals("Lordvessel Placed", entranceTo("the-abyss-darkstalker-kaathe").before());
        assertTrue(Reachability.walk(DS1).regions().contains("the-abyss-darkstalker-kaathe"));
        var placed = Reachability.walk(DS1, new ReachOptions(List.of("Lordvessel Placed"), null, null, null));
        assertFalse(placed.regions().contains("the-abyss-darkstalker-kaathe"));
        assertFalse(without("Four Kings Defeated").contains("the-abyss-darkstalker-kaathe"));
    }

    // Rhea is lost once two more main bosses die after she reaches the Parish, or once her stock is bought out; her shop, opened by the
    // rescue in the Tomb of the Giants, stays on the graph.
    @Test
    void records_the_two_ways_rhea_leaves_after_the_tomb_of_the_giants() {
        assertEquals(List.of(1177, 1181), leaveFlags("rhea-of-thorolund"));
        var shop = Reachability.walk(DS1, ReachOptions.forbidRegions(set("tomb-of-the-giants")));
        assertTrue(strings(MERCHANTS.get("rhea-of-thorolund").get("regions")).stream().noneMatch(shop.regions()::contains));
    }

    // Domhnall comes to Firelink once both bells are rung, wherever the player has been.
    @Test
    void brings_domhnall_to_firelink_after_both_bells() {
        var requires = assertInstanceOf(Requirement.All.class, entranceTo("firelink-shrine-domhnall-of-zena").requires());
        assertEquals(List.of(new Requirement.Has("Bell of Awakening #1"), new Requirement.Has("Bell of Awakening #2")), requires.children());
        assertFalse(without("Bell of Awakening #2").contains("firelink-shrine-domhnall-of-zena"));
    }

    // Logan sells at Firelink once rescued, and in the Archives before Seath dies.
    @Test
    void opens_logans_shops_at_firelink_and_in_the_archives_without_seath() {
        assertEquals(List.of("firelink-shrine-big-hat-logan", "the-dukes-archives-big-hat-logan"), DS1.merchants().get("logan").regions());
        var noSeath = without("Seath the Scaleless Defeated");
        assertTrue(noSeath.contains("the-dukes-archives-big-hat-logan"));
        assertTrue(noSeath.contains("firelink-shrine-big-hat-logan"));
        assertTrue(DS1.locations().stream().anyMatch(l -> l.region().equals("firelink-shrine-big-hat-logan") && l.item().equals("Sorcery: Soul Spear")));
        var noCage = Reachability.walk(DS1, ReachOptions.forbidRegions(set("sens-fortress-after-cage-key")));
        assertFalse(noCage.regions().contains("firelink-shrine-big-hat-logan"));
    }

    // Quelana waits for an upgraded Pyromancy Flame (Laurentius or Eingyi upgrades it), and leaves for good if the Bed of Chaos dies before
    // she is met.
    @Test
    void opens_quelana_with_a_pyromancy_flame_and_an_upgrader_before_the_bed_of_chaos_dies() {
        var quelana = "lower-blighttown-quelana-of-izalith";
        assertEquals("Bed of Chaos Defeated", entranceTo(quelana).before());
        var empty = new StartingGift(0, List.of());
        var pyromancer = Validator.startingItems(DS1, new Setup(Mode.STATIC, empty, "Pyromancer", null));
        var knight = Validator.startingItems(DS1, new Setup(Mode.STATIC, empty, "Knight", null));
        var noLaurentius = set("firelink-shrine-laurentius-of-the-great-swamp");
        assertTrue(pyromancer.contains("Pyromancy Flame"));
        assertTrue(Reachability.walk(DS1, new ReachOptions(pyromancer, null, noLaurentius, null)).regions().contains(quelana));
        assertFalse(Reachability.walk(DS1, new ReachOptions(knight, null, noLaurentius, null)).regions().contains(quelana));
        assertTrue(Reachability.walk(DS1, new ReachOptions(knight, null, null, null)).regions().contains(quelana));
        List<String> dead = new ArrayList<>(knight);
        dead.add("Bed of Chaos Defeated");
        assertFalse(Reachability.walk(DS1, new ReachOptions(dead, null, null, null)).regions().contains(quelana));
    }
}
