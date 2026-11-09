package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.Boss;
import com.renanabade.darksouls.core.GiftItem;
import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.orders.ArgValue;
import com.renanabade.darksouls.core.orders.OrderInstance;
import com.renanabade.darksouls.core.orders.ParamKind;
import com.renanabade.darksouls.core.orders.Restrictions;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class Manual {
    private static final Pattern IN_PARENTHESES = Pattern.compile("\\(([^)]+)\\)");
    private static final Pattern LANDMARK = Pattern.compile("^[^:]+:\\s*[^-]+-\\s*(.+)$", Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern AREA_CODE = Pattern.compile("^[^:]+:\\s*", Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern ONE_PLURAL = Pattern.compile("\\b1 (points|deaths|attempts)\\b", Pattern.UNICODE_CHARACTER_CLASS);

    private record Word(String term, String text, Predicate<OrderInstance> applies) {}

    /** Words whose meaning decides whether an order was broken, defined once so that players comparing runs read them the same way. */
    private static final List<Word> DEFINITIONS = List.of(
            new Word(
                    "Death",
                    "every time you die. The only one that does not count is your first death against Seath the Scaleless in The Duke's Archives, which the story requires.",
                    o -> o.template().id().equals("run-lives")),
            new Word(
                    "Attempt",
                    "each fight against a boss that you start, whether you win, die or leave.",
                    o -> o.template().id().equals("counted-attempts") || "on your first attempt".equals(o.args().text("condition"))),
            new Word(
                    "Pick up",
                    "take an item from a corpse or a chest in the world. What enemies drop, what you buy and what characters give you are not picked up.",
                    o -> Set.of("first-weapon-of-area", "wear-what-you-find", "nothing-from-the-ground").contains(o.template().id())),
            new Word(
                    "Use",
                    "equip, wear, wield, cast or consume.",
                    o -> o.template().id().equals("nothing-from-the-ground") || cursed(o, "no-consumables") || cursed(o, "no-rings")),
            new Word(
                    "Chest",
                    "a treasure chest placed in the world. A mimic is not one, even though it looks like one.",
                    o -> o.template().id().equals("every-chest")),
            new Word(
                    "Consumable",
                    "an item that is spent when you use it. The Estus Flask is not one.",
                    o -> cursed(o, "no-consumables")));

    private Manual() {}

    /** Milestones as what the player does, so texts read "until you defeat Taurus Demon". */
    private static String milestonePhrase(World world, String id) {
        var milestone = world.milestones().get(id);
        if (milestone == null) return id;
        switch (id) {
            case "bell-undead-parish":
                return "you ring the bell of the Undead Parish";
            case "bell-quelaags-domain":
                return "you ring the bell of Quelaag's Domain";
            case "both-bells":
                return "you have rung both bells";
            case "lordvessel-obtained":
                return "you obtain the Lordvessel";
            case "lordvessel-placed":
                return "you place the Lordvessel";
            case "kiln-open":
                return "the Kiln of the First Flame opens";
            default:
                break;
        }

        // Each lord-souls milestone is one soul placed in the Lordvessel, not the n-th soul placed.
        if (milestone.kind().equals("lord-souls")) return "you place the " + lordSoulOf(world, id);
        if (milestone.kind().equals("boss")) {
            for (var boss : world.bosses().values()) {
                if (("boss-" + boss.id()).equals(id)) return "you defeat " + bossName(boss);
            }

            return "you defeat " + milestone.name();
        }

        return milestone.name();
    }

    /** Boss names as the manual says them. */
    private static String bossName(Boss boss) {
        return boss.id().equals("knight-artorias") ? "Artorias" : boss.name();
    }

    /** The Lord Soul a lord-souls milestone places, e.g. "Lord Soul (Nito)". */
    private static String lordSoulOf(World world, String id) {
        var milestone = world.milestones().get(id);
        if (milestone == null) return id;
        Set<String> souls = new HashSet<>();
        for (var location : world.locations()) {
            if (location.category().equals("LORD_SOUL")) souls.add(location.item());
        }

        for (var item : milestone.requires().items()) {
            if (souls.contains(item)) return item;
        }

        return id;
    }

    /**
     * A chapter's name, from the milestones it covers: "The first bell", "Lord Soul: Nito". An act of a short journey takes its last
     * milestone's name, and the act of the four Lord Souls is "The Lord Souls".
     */
    public static String chapterTitle(World world, List<String> goals) {
        var goal = goals.isEmpty() ? "" : goals.get(goals.size() - 1);
        if (goals.size() > 1 && goals.stream().allMatch(g -> {
            var known = world.milestones().get(g);
            return known != null && known.kind().equals("lord-souls");
        })) {
            return "The Lord Souls";
        }

        switch (goal) {
            case "boss-asylum-demon":
                return "The Asylum";
            case "bell-undead-parish":
                return "The first bell";
            case "both-bells":
                return "The second bell";
            case "lordvessel-placed":
                return "The Lordvessel";
            default:
                break;
        }

        var milestone = world.milestones().get(goal);
        if (milestone != null && milestone.kind().equals("lord-souls")) {
            var soul = lordSoulOf(world, goal);
            var match = IN_PARENTHESES.matcher(soul);
            return "Lord Soul: " + (match.find() ? match.group(1) : soul);
        }

        if (milestone != null && milestone.requires().items().contains(world.goal())) return "The First Flame";
        return milestone != null ? milestone.name() : goal;
    }

    private static String plural(String category) {
        if (category.equals("fist")) return "fist weapons";
        return category.endsWith("s") ? category : category + "s";
    }

    private static String trimEndDots(String text) {
        var end = text.length();
        while (end > 0 && text.charAt(end - 1) == '.') end--;
        return text.substring(0, end);
    }

    private static String value(World world, ParamKind kind, ArgValue arg) {
        return switch (arg) {
            case ArgValue.Number number -> Integer.toString(number.value());
            case ArgValue.TextList list -> {
                // "(1) Do not roll; (2) ...": the template's own period closes the list.
                if (kind == ParamKind.RESTRICTION_LIST) {
                    List<String> parts = new ArrayList<>();
                    for (var i = 0; i < list.values().size(); i++) {
                        var id = list.values().get(i);
                        var restriction = Restrictions.find(id);
                        parts.add("(" + (i + 1) + ") " + trimEndDots(restriction != null ? restriction.text() : id));
                    }

                    yield String.join("; ", parts);
                }

                yield String.join(kind == ParamKind.LORD_SOUL_ORDER ? ", then " : ", ", list.values());
            }
            case ArgValue.Text text -> textValue(world, kind, text.value());
        };
    }

    private static String textValue(World world, ParamKind kind, String text) {
        switch (kind) {
            case AREA: {
                var area = world.areas().get(text);
                return area != null ? area.name() : text;
            }
            case BOSS: {
                var boss = world.bosses().get(text);
                return boss != null ? bossName(boss) : text;
            }
            case MILESTONE:
                return milestonePhrase(world, text);
            case MERCHANT: {
                var merchant = world.merchants().get(text);
                return merchant != null ? merchant.name() : text;
            }
            case LOCATION, WEAPON_LOCATION: {
                // "the Halberd found in Undead Parish", plus DSAP's landmark when its name has one ("UP: Halberd - On the bridge").
                var location = world.locationNamed(text);
                if (location == null) return text;
                var landmark = LANDMARK.matcher(location.name());
                var region = world.regions().get(location.region());
                var regionArea = region == null || region.area() == null ? "" : region.area();
                var area = world.areas().get(regionArea);
                List<String> parts = new ArrayList<>();
                parts.add("the " + location.item());
                if (area != null) parts.add("found in " + area.name());
                if (landmark.find()) parts.add("(" + landmark.group(1) + ")");
                return String.join(" ", parts);
            }
            case EQUIPMENT_SET:
                return switch (text) {
                    // A school of magic as a fighting style: your attacks are its spells, cast with a catalyst of the school.
                    case "sorcery" -> "only sorceries for your attacks, cast with a catalyst";
                    case "miracle" -> "only miracles for your attacks, cast with a talisman";
                    case "pyromancy" -> "only pyromancies for your attacks, cast with a pyromancy flame";
                    default -> "only " + plural(text);
                };
            case ELEMENT:
                return text.equals("thunder") ? "lightning" : text;
            case BONFIRE:
                // "AL: Darkmoon Tomb Bonfire" gives "Darkmoon Tomb Bonfire".
                return AREA_CODE.matcher(text).replaceFirst("");
            case RESTRICTION: {
                // "...: do not roll."
                var restriction = Restrictions.find(text);
                var said = restriction != null ? restriction.text() : text;
                return Character.toLowerCase(said.charAt(0)) + said.substring(1);
            }
            default:
                return text;
        }
    }

    public static String orderText(World world, GeneratedOrder order) {
        var template = order.template();
        var zero = template.textIfZero();
        var text = zero != null && Objects.equals(order.args().number(zero.param()), 0) ? zero.text() : template.text();
        var exceptions = template.exceptions();
        if (exceptions != null) {
            var placeholder = "{" + exceptions.placeholder() + "}";
            text = !order.exceptions().isEmpty()
                    ? text.replace(placeholder, String.join(", ", order.exceptions()))
                    : text.replace(" Except: " + placeholder + ".", "");
        }

        for (var entry : template.params().entrySet()) {
            var arg = order.args().get(entry.getKey());
            if (arg != null) text = text.replace("{" + entry.getKey() + "}", value(world, entry.getValue().kind(), arg));
        }

        // Exceptions an order's restrictions add (e.g. the rings the run needs under "no rings").
        if (exceptions == null && !order.exceptions().isEmpty()) {
            var needs = order.chapter() == null ? "the run needs" : "this stretch needs";
            text += " Allowed, because " + needs + " them: " + String.join(", ", order.exceptions()) + ".";
        }

        return ONE_PLURAL.matcher(text).replaceAll(match -> {
            var word = match.group(1);
            return Matcher.quoteReplacement("1 " + word.substring(0, word.length() - 1));
        });
    }

    private static boolean cursed(OrderInstance order, String restriction) {
        var list = order.args().list("restrictions");
        return list != null && list.contains(restriction);
    }

    public static ChallengeView describe(World world, Challenge challenge) {
        var config = challenge.config();
        var setup = challenge.setup();
        var number = new int[] {0};

        List<RuleView> journey = new ArrayList<>();
        for (var order : challenge.orders()) {
            if (order.chapter() == null) journey.add(rule(world, order, number));
        }

        var part = challenge.chapters().stream().anyMatch(c -> c.goals().size() > 1) ? "Act" : "Chapter";
        List<ChapterView> chapters = new ArrayList<>();
        for (var k = 0; k < challenge.chapters().size(); k++) {
            var chapter = challenge.chapters().get(k);
            Integer index = k;
            var orders = challenge.orders().stream().filter(o -> index.equals(o.chapter())).toList();
            if (orders.isEmpty()) continue;
            List<RuleView> rules = new ArrayList<>();
            for (var order : orders) rules.add(rule(world, order, number));
            chapters.add(new ChapterView(
                    part + " " + (k + 1) + ": " + chapterTitle(world, chapter.goals()),
                    milestonePhrase(world, chapter.goal()),
                    chapter.areas().stream().map(id -> {
                        var area = world.areas().get(id);
                        return area != null ? area.name() : id;
                    }).toList(),
                    chapter.bosses().stream().map(id -> {
                        var boss = world.bosses().get(id);
                        return boss != null ? bossName(boss) : id;
                    }).toList(),
                    chapter.difficulty(),
                    rules));
        }

        return new ChallengeView(
                challenge.code(),
                Generator.VERSION,
                challenge.dataVersion(),
                setup.startingClass() == null ? "" : setup.startingClass(),
                setup.gift().items().stream().map(Manual::giftLabel).toList(),
                setup.levelCap() == null ? 0 : setup.levelCap(),
                config.difficulty(),
                challenge.curve(),
                config.length(),
                journey,
                chapters,
                DEFINITIONS.stream()
                        .filter(d -> challenge.orders().stream().anyMatch(d.applies()))
                        .map(d -> new Definition(d.term(), d.text()))
                        .toList(),
                world.warnings().stream().map(w -> new ChallengeWarning(w.npc(), w.text())).toList());
    }

    private static String giftLabel(GiftItem item) {
        return item.count() > 1 ? item.item() + " x" + item.count() : item.item();
    }

    private static RuleView rule(World world, GeneratedOrder order, int[] number) {
        number[0]++;
        return new RuleView(number[0], order.template().title(), orderText(world, order), order.template().advice());
    }

    private static String ruleLine(RuleView r) {
        return r.number() + ". **" + r.title() + ".** " + r.text() + (r.advice() == null ? "" : " _" + r.advice() + "_");
    }

    private static void addNotes(List<String> lines, String title, List<String[]> notes) {
        if (notes.isEmpty()) return;
        lines.add("## " + title);
        lines.add("");
        for (var note : notes) lines.add("- **" + note[0] + ":** " + note[1]);
        lines.add("");
    }

    /**
     * The manual as Markdown: the challenge's settings, the rules of the whole journey, then each chapter with its stretch, areas,
     * bosses, difficulty and rules.
     */
    public static String render(World world, Challenge challenge) {
        var view = describe(world, challenge);
        List<String> lines = new ArrayList<>(List.of(
                "# Dark Souls challenge — " + view.code(),
                "",
                "- **Class:** " + view.startingClass(),
                "- **Starting gift:** " + (view.gift().isEmpty() ? "none" : String.join(", ", view.gift())),
                "- **Soul level cap:** " + view.levelCap(),
                "- **Difficulty:** " + view.difficulty().label() + " · **Curve:** " + view.curve().label() + " · **Length:** " + view.length().label(),
                "",
                "Follow every order. Break one, and the challenge is over: there is no penalty, only the end.",
                "",
                "## Rules of the journey",
                ""));
        view.journey().forEach(r -> lines.add(ruleLine(r)));
        lines.add("");
        for (var chapter : view.chapters()) {
            List<String> about = new ArrayList<>();
            about.add("Until " + chapter.until());
            about.add("**Areas:** " + String.join(", ", chapter.areas()));
            if (!chapter.bosses().isEmpty()) about.add("**Bosses:** " + String.join(" · ", chapter.bosses()));
            about.add("**Difficulty:** " + chapter.difficulty().label());
            lines.add("## " + chapter.heading());
            lines.add("");
            lines.add(String.join(" · ", about));
            lines.add("");
            chapter.rules().forEach(r -> lines.add(ruleLine(r)));
            lines.add("");
        }

        addNotes(lines, "Definitions", view.definitions().stream().map(d -> new String[] {d.term(), d.text()}).toList());
        addNotes(lines, "Before you go", view.warnings().stream().map(w -> new String[] {w.npc(), w.text()}).toList());
        lines.add("<sub>Data " + view.dataVersion() + ". Same code, same challenge.</sub>");
        lines.add("");
        return String.join("\n", lines);
    }
}
