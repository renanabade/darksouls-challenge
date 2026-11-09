package com.renanabade.darksouls.core.orders;

import static com.renanabade.darksouls.core.orders.CommandKind.ASSIGN;
import static com.renanabade.darksouls.core.orders.CommandKind.LIMIT;
import static com.renanabade.darksouls.core.orders.CommandKind.OFFER_CHOICE;
import static com.renanabade.darksouls.core.orders.CommandKind.PROHIBIT;
import static com.renanabade.darksouls.core.orders.CommandKind.REQUIRE;
import static com.renanabade.darksouls.core.orders.CommandKind.SWAP;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The orders of the catalog, as data. Texts are the manual's wording. */
public final class Catalog {
    private static final MilestoneRef FROM_PARAM = new MilestoneRef.Param("from");
    private static final MilestoneRef UNTIL_PARAM = new MilestoneRef.Param("until");
    private static final String ELEMENT_ADVICE = "Weapons, spells and thrown items all count, as long as they deal it.";

    public static final List<OrderTemplate> ALL = List.of(
            order("first-weapon-of-area", 1, 2, 1, "First weapon of the area",
                    "On entering {area}: the first weapon you pick up here is your only weapon until {until}.")
                    .params(param("area", ParamKind.AREA), param("until", ParamKind.MILESTONE))
                    .trigger(new Trigger.EnterArea("area"))
                    .scope(new Scope.Phase(null, UNTIL_PARAM))
                    .command(Command.of(ASSIGN, "firstPickedUp"))
                    .validation(Validation.WORST_CASE, Validation.ACTUAL_CASE)
                    .build(),
            order("assigned-weapon", 2, 2, 2, "Assigned weapon", "From the moment {from} until {until}: your weapon is {location}.")
                    .params(param("from", ParamKind.MILESTONE), param("until", ParamKind.MILESTONE), param("location", ParamKind.WEAPON_LOCATION))
                    .trigger(new Trigger.MilestoneReached(FROM_PARAM))
                    .scope(new Scope.Phase(FROM_PARAM, UNTIL_PARAM))
                    .command(Command.of(ASSIGN, "atLocation", ref("location", ParamKind.WEAPON_LOCATION)))
                    .validation(Validation.EXISTENCE, Validation.EXISTENCE)
                    .build(),
            order("wear-what-you-find", 3, 1, 0, "Wear what you find",
                    "In {area}: every armor piece you pick up must be put on at once, and stays on until you leave.")
                    .params(param("area", ParamKind.AREA))
                    .trigger(new Trigger.PickUp())
                    .scope(new Scope.InArea("area"))
                    .command(Command.of(REQUIRE, "wearArmorPickedUp"))
                    .validation(Validation.WEIGHT_ONLY, Validation.WEIGHT_ONLY)
                    .build(),
            order("boss-inheritance", 4, 2, 1, "Boss inheritance", "You defeated {boss}. The weapon you used, {weapon}, is forbidden until the end.")
                    .params(param("boss", ParamKind.BOSS), param("weapon", ParamKind.WEAPON))
                    .trigger(new Trigger.DefeatBoss("boss"))
                    .scope(new Scope.Run())
                    .command(Command.of(PROHIBIT, "useWeapon", ref("weapon", ParamKind.WEAPON)))
                    .validation(null, Validation.ACTUAL_CASE)
                    .asks(Question.WEAPON_USED)
                    .build(),
            order("nothing-from-the-ground", 5, 1, 1, "Nothing from the ground",
                    "In {area}: nothing you pick up from a corpse or chest may be used or equipped. Except: {exceptions}.")
                    .params(param("area", ParamKind.AREA))
                    .trigger(new Trigger.EnterArea("area"))
                    .scope(new Scope.InArea("area"))
                    .command(Command.of(PROHIBIT, "useItemsPickedUp"))
                    .validation(Validation.AUTO_EXCEPTION, Validation.AUTO_EXCEPTION)
                    .exceptions(new OrderExceptions("exceptions", ExceptionRule.REQUIRED_ITEMS_IN_AREA))
                    .advice("Drop anything that is not allowed as soon as you pick it up, so you do not mix it up later.")
                    .build(),
            order("no-bonfire", 6, 2, 1, "No bonfire", "Do not rest at any bonfire in {area}.")
                    .params(param("area", ParamKind.AREA))
                    .trigger(new Trigger.EnterArea("area"))
                    .scope(new Scope.InArea("area"))
                    .command(Command.of(PROHIBIT, "restAtBonfire"))
                    .validation(Validation.WEIGHT_ONLY, Validation.WEIGHT_ONLY)
                    .build(),
            order("dry-fight", 7, 2, 0, "Dry fight", "Against {boss}: do not use Estus.")
                    .params(param("boss", ParamKind.BOSS))
                    .trigger(new Trigger.EnterArena("boss"))
                    .scope(new Scope.Fight("boss"))
                    .command(Command.of(PROHIBIT, "useEstus"))
                    .validation(Validation.WEIGHT_ONLY, Validation.WEIGHT_ONLY)
                    .build(),
            order("closed-merchant", 8, 1, 1, "Closed merchant", "Do not buy anything from {merchant}. Except: {exceptions}.")
                    .params(param("merchant", ParamKind.MERCHANT))
                    .trigger(new Trigger.RunStart())
                    .scope(new Scope.Run())
                    .command(Command.of(PROHIBIT, "buyFrom", ref("merchant", ParamKind.MERCHANT)))
                    .validation(Validation.AUTO_EXCEPTION, Validation.AUTO_EXCEPTION)
                    .exceptions(new OrderExceptions("exceptions", ExceptionRule.REQUIRED_ITEMS_SOLD_ONLY_BY))
                    .build(),
            order("counted-attempts", 9, 2, 0, "Counted attempts", "You have {attempts} attempts against {boss}.")
                    .params(
                            Map.entry("attempts", new ParamSpec(ParamKind.COUNT, ranges(10, 12, 6, 8, 3, 5, 1, 2))),
                            param("boss", ParamKind.BOSS))
                    .trigger(new Trigger.Death())
                    .scope(new Scope.Fight("boss"))
                    .command(Command.of(LIMIT, "attempts", ref("attempts", ParamKind.COUNT)))
                    .validation(Validation.WEIGHT_ONLY, Validation.WEIGHT_ONLY)
                    .build(),
            order("run-lives", 10, 3, 0, "Lives for the run",
                    "You have {deaths} deaths for the whole run. Scripted deaths you cannot avoid do not count.")
                    .textIfZero(new TextIfZero("deaths", "Do not die for the whole run. Scripted deaths you cannot avoid do not count."))

                    // By profile: a casual player dies far more than a veteran; 0 is deathless.
                    .params(Map.entry("deaths", new ParamSpec(ParamKind.COUNT, ranges(60, 90, 20, 35, 6, 12, 0, 2))))
                    .trigger(new Trigger.Death())
                    .scope(new Scope.Run())
                    .command(Command.of(LIMIT, "deaths", ref("deaths", ParamKind.COUNT)))
                    .validation(Validation.WEIGHT_ONLY, Validation.WEIGHT_ONLY)
                    .build(),
            order("accumulated-curse", 11, 3, 0, "Accumulated curse", "Each boss you defeat adds a new restriction, in this order: {restrictions}.")
                    .params(param("restrictions", ParamKind.RESTRICTION_LIST))
                    .trigger(new Trigger.DefeatBoss(null))
                    .scope(new Scope.Run())
                    .command(Command.of(PROHIBIT, "restrictions", ref("restrictions", ParamKind.RESTRICTION_LIST)))
                    .validation(Validation.WORST_CASE, Validation.ACTUAL_CASE)
                    .build(),
            order("wager", 12, 2, 0, "Wager",
                    "Before {boss}: accept {restriction} for this fight only. If you win, choose one of your current restrictions to drop.")
                    .params(param("boss", ParamKind.BOSS), param("restriction", ParamKind.RESTRICTION))
                    .trigger(new Trigger.EnterArena("boss"))
                    .scope(new Scope.Fight("boss"))
                    .command(Command.of(OFFER_CHOICE, "restriction", ref("restriction", ParamKind.RESTRICTION)))
                    .validation(null, Validation.ACTUAL_CASE)
                    .asks(Question.ACCEPT_WAGER)
                    .build(),
            order("phase-swap", 13, 2, 1, "Phase swap", "After the Asylum Demon and until {milestone}: {before}. From then on, use {after}.")
                    .params(param("milestone", ParamKind.MILESTONE), param("before", ParamKind.EQUIPMENT_SET), param("after", ParamKind.EQUIPMENT_SET))
                    .trigger(new Trigger.MilestoneReached(new MilestoneRef.Param("milestone")))
                    .scope(new Scope.Phase(new MilestoneRef.Param("milestone"), null))
                    .command(Command.of(SWAP, "swap", ref("before", ParamKind.EQUIPMENT_SET), ref("after", ParamKind.EQUIPMENT_SET)))
                    .validation(Validation.EXISTENCE, Validation.EXISTENCE)
                    .build(),
            order("lord-order", 14, 1, 1, "Order of the Lords", "Collect the four Lord Souls in this order: {order}.")
                    .params(param("order", ParamKind.LORD_SOUL_ORDER))
                    .trigger(new Trigger.MilestoneReached(new MilestoneRef.Fixed("lordvessel-obtained")))
                    .scope(new Scope.Phase(new MilestoneRef.Fixed("lordvessel-obtained"), null))
                    .command(Command.of(REQUIRE, "lordSoulsInOrder", ref("order", ParamKind.LORD_SOUL_ORDER)))
                    .validation(Validation.EXISTENCE, Validation.EXISTENCE)
                    .build(),
            order("boss-before-bell", 15, 2, 1, "Boss before the bell", "Before you ring the first bell, defeat {boss}.")
                    .params(param("boss", ParamKind.BOSS))
                    .trigger(new Trigger.RunStart())
                    .scope(new Scope.Phase(null, new MilestoneRef.FirstOf(List.of("bell-undead-parish", "bell-quelaags-domain"))))
                    .command(Command.of(REQUIRE, "defeatBoss", ref("boss", ParamKind.BOSS)))
                    .validation(Validation.EXISTENCE, Validation.EXISTENCE)
                    .build(),
            order("forbidden-area", 16, 1, 1, "Forbidden area", "Do not enter {area}.")
                    .params(param("area", ParamKind.AREA))
                    .trigger(new Trigger.RunStart())
                    .scope(new Scope.Run())
                    .command(Command.of(PROHIBIT, "enterArea", ref("area", ParamKind.AREA)))
                    .validation(Validation.EXISTENCE, Validation.EXISTENCE)
                    .build(),
            order("earned-levels", 17, 2, 0, "Earned levels",
                    "You may only level up with points. Each boss you defeat {condition} is worth {points} points; one point, one level.")
                    .params(
                            param("condition", ParamKind.CONDITION),
                            Map.entry("points", new ParamSpec(ParamKind.COUNT, ranges(3, 4, 2, 3, 1, 2, 1, 1))))
                    .trigger(new Trigger.DefeatBoss(null))
                    .scope(new Scope.Run())
                    .command(Command.of(LIMIT, "levelUps", ref("points", ParamKind.COUNT)))
                    .validation(Validation.WORST_CASE, Validation.WORST_CASE)
                    .condition(new OrderCondition.Drawn("condition"))
                    .build(),
            order("earned-upgrades", 18, 1, 0, "Earned upgrades", "Your weapon may gain only one upgrade level per boss you defeat.")
                    .trigger(new Trigger.DefeatBoss(null))
                    .scope(new Scope.Run())
                    .command(Command.of(LIMIT, "weaponUpgrades"))
                    .validation(Validation.WEIGHT_ONLY, Validation.WEIGHT_ONLY)
                    .build(),
            order("adaptive-squeeze", 19, 2, 0, "Adaptive squeeze",
                    "You defeated {boss} in {attempts} attempts or fewer, so a new restriction applies: {restriction}.")
                    .params(param("boss", ParamKind.BOSS), param("attempts", ParamKind.COUNT), param("restriction", ParamKind.RESTRICTION))
                    .trigger(new Trigger.DefeatBoss("boss"))
                    .scope(new Scope.UntilNextMilestone())
                    .command(Command.of(PROHIBIT, "restriction", ref("restriction", ParamKind.RESTRICTION)))
                    .validation(null, Validation.ACTUAL_CASE)
                    .condition(new OrderCondition.AttemptsAtMost("attempts"))
                    .optIn()
                    .build(),
            order("build-question", 20, 2, 1, "Build question",
                    "From the moment {from} until {until}: your weapon is {weapon}, chosen from those that fit your Strength and Dexterity.")
                    .params(param("from", ParamKind.MILESTONE), param("until", ParamKind.MILESTONE), param("weapon", ParamKind.WEAPON))
                    .trigger(new Trigger.MilestoneReached(FROM_PARAM))
                    .scope(new Scope.Phase(FROM_PARAM, UNTIL_PARAM))
                    .command(Command.of(ASSIGN, "fitsStats", ref("weapon", ParamKind.WEAPON)))
                    .validation(null, Validation.ACTUAL_CASE)
                    .asks(Question.STRENGTH_AND_DEXTERITY)
                    .build(),

            // A restriction of the vocabulary for one chapter of the journey.
            order("chapter-restriction", 21, 2, 0, "Chapter restriction", "From the moment {from} until {until}: {restriction}")
                    .params(param("from", ParamKind.MILESTONE), param("until", ParamKind.MILESTONE), param("restriction", ParamKind.RESTRICTION))
                    .trigger(new Trigger.MilestoneReached(FROM_PARAM))
                    .scope(new Scope.Phase(FROM_PARAM, UNTIL_PARAM))
                    .command(Command.of(PROHIBIT, "restriction", ref("restriction", ParamKind.RESTRICTION)))
                    .validation(Validation.WORST_CASE, Validation.WORST_CASE)
                    .build(),

            // The bosses' defenses per element. The element is drawn from the boss: the one it defends worst, or the one it
            // resists most without being immune.
            order("exploit-weakness", 22, 1, 1, "Exploit the weakness",
                    "Against {boss}: fight only with {element}, what it defends worst. Every attack that hits it must deal {element} damage.")
                    .params(param("boss", ParamKind.BOSS), param("element", ParamKind.ELEMENT))
                    .trigger(new Trigger.EnterArena("boss"))
                    .scope(new Scope.Fight("boss"))
                    .command(Command.of(REQUIRE, "dealElement", ref("element", ParamKind.ELEMENT)))
                    .validation(Validation.EXISTENCE, Validation.EXISTENCE)
                    .advice(ELEMENT_ADVICE)
                    .build(),
            order("against-the-grain", 23, 3, 1, "Against the grain",
                    "Against {boss}: fight only with {element}, what it resists most. Every attack that hits it must deal {element} damage.")
                    .params(param("boss", ParamKind.BOSS), param("element", ParamKind.ELEMENT))
                    .trigger(new Trigger.EnterArena("boss"))
                    .scope(new Scope.Fight("boss"))
                    .command(Command.of(REQUIRE, "dealElement", ref("element", ParamKind.ELEMENT)))
                    .validation(Validation.EXISTENCE, Validation.EXISTENCE)
                    .advice(ELEMENT_ADVICE)
                    .build(),

            // Rules about what an area holds: its crystal lizards, its chests, its bonfires.
            order("lizard-hunt", 24, 1, 2, "Lizard hunt", "In {area}: kill every crystal lizard before {until}.")
                    .params(param("area", ParamKind.AREA), param("until", ParamKind.MILESTONE))
                    .trigger(new Trigger.EnterArea("area"))
                    .scope(new Scope.Phase(null, UNTIL_PARAM))
                    .command(Command.of(REQUIRE, "killCrystalLizards", ref("area", ParamKind.AREA)))
                    .validation(Validation.EXISTENCE, Validation.EXISTENCE)
                    .build(),
            order("every-chest", 25, 1, 2, "Every chest", "In {area}: open all {chests} chests before {until}.")
                    .params(param("area", ParamKind.AREA), param("chests", ParamKind.TALLY), param("until", ParamKind.MILESTONE))
                    .trigger(new Trigger.EnterArea("area"))
                    .scope(new Scope.Phase(null, UNTIL_PARAM))
                    .command(Command.of(REQUIRE, "openChests", ref("area", ParamKind.AREA), ref("chests", ParamKind.TALLY)))
                    .validation(Validation.EXISTENCE, Validation.EXISTENCE)
                    .build(),
            order("one-bonfire", 26, 1, 1, "One bonfire", "In {area}: rest only at the {bonfire}.")
                    .params(param("area", ParamKind.AREA), param("bonfire", ParamKind.BONFIRE))
                    .trigger(new Trigger.EnterArea("area"))
                    .scope(new Scope.InArea("area"))
                    .command(Command.of(PROHIBIT, "restAtBonfireBut", ref("bonfire", ParamKind.BONFIRE)))
                    .validation(Validation.WEIGHT_ONLY, Validation.WEIGHT_ONLY)
                    .build(),

            // Errands and routes, both checked on the graph.
            order("errand", 27, 1, 1, "Errand", "Before {until}: take {location}.")
                    .params(param("location", ParamKind.LOCATION), param("until", ParamKind.MILESTONE))
                    .trigger(new Trigger.RunStart())
                    .scope(new Scope.Phase(null, UNTIL_PARAM))
                    .command(Command.of(REQUIRE, "takeItem", ref("location", ParamKind.LOCATION)))
                    .validation(Validation.EXISTENCE, Validation.EXISTENCE)
                    .build(),
            order("the-other-way", 28, 2, 2, "The other way", "Until {until}: do not enter {area}.")
                    .params(param("area", ParamKind.AREA), param("until", ParamKind.MILESTONE))
                    .trigger(new Trigger.RunStart())
                    .scope(new Scope.Phase(null, UNTIL_PARAM))
                    .command(Command.of(PROHIBIT, "enterArea", ref("area", ParamKind.AREA)))
                    .validation(Validation.EXISTENCE, Validation.EXISTENCE)
                    .build());

    private Catalog() {}

    /** The template of an id, or an error: asking for one that does not exist is a programming error. */
    public static OrderTemplate get(String id) {
        for (var template : ALL) {
            if (template.id().equals(id)) return template;
        }

        throw new IllegalStateException("no order \"" + id + "\" in the catalog");
    }

    private static Map.Entry<String, ParamSpec> param(String name, ParamKind kind) {
        return Map.entry(name, new ParamSpec(kind));
    }

    private static ParamRef ref(String name, ParamKind kind) {
        return new ParamRef(name, kind);
    }

    private static DifficultyRanges ranges(int easyMin, int easyMax, int mediumMin, int mediumMax, int hardMin, int hardMax, int extremeMin, int extremeMax) {
        return new DifficultyRanges(
                new IntRange(easyMin, easyMax),
                new IntRange(mediumMin, mediumMax),
                new IntRange(hardMin, hardMax),
                new IntRange(extremeMin, extremeMax));
    }

    private static Builder order(String id, int number, int difficulty, int friction, String title, String text) {
        return new Builder(id, number, new Weight(difficulty, friction), title, text);
    }

    private static final class Builder {
        private final String id;
        private final int number;
        private final Weight weight;
        private final String title;
        private final String text;
        private TextIfZero textIfZero;
        private final Map<String, ParamSpec> params = new LinkedHashMap<>();
        private Trigger trigger;
        private Scope scope;
        private Command command;
        private Validation staticValidation;
        private Validation liveValidation;
        private OrderCondition condition;
        private OrderExceptions exceptions;
        private Question asks;
        private String advice;
        private boolean optIn;

        Builder(String id, int number, Weight weight, String title, String text) {
            this.id = id;
            this.number = number;
            this.weight = weight;
            this.title = title;
            this.text = text;
        }

        @SafeVarargs
        final Builder params(Map.Entry<String, ParamSpec>... entries) {
            for (var entry : entries) params.put(entry.getKey(), entry.getValue());
            return this;
        }

        Builder textIfZero(TextIfZero value) {
            textIfZero = value;
            return this;
        }

        Builder trigger(Trigger value) {
            trigger = value;
            return this;
        }

        Builder scope(Scope value) {
            scope = value;
            return this;
        }

        Builder command(Command value) {
            command = value;
            return this;
        }

        Builder validation(Validation inStatic, Validation inLive) {
            staticValidation = inStatic;
            liveValidation = inLive;
            return this;
        }

        Builder condition(OrderCondition value) {
            condition = value;
            return this;
        }

        Builder exceptions(OrderExceptions value) {
            exceptions = value;
            return this;
        }

        Builder asks(Question value) {
            asks = value;
            return this;
        }

        Builder advice(String value) {
            advice = value;
            return this;
        }

        Builder optIn() {
            optIn = true;
            return this;
        }

        OrderTemplate build() {
            return new OrderTemplate(
                    id, number, title, text, textIfZero, params, weight, trigger, scope, command,
                    staticValidation, liveValidation, condition, exceptions, asks, advice, optIn);
        }
    }
}
