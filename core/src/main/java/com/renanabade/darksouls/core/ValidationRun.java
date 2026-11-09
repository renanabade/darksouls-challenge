package com.renanabade.darksouls.core;

import com.renanabade.darksouls.core.orders.OrderArgs;
import com.renanabade.darksouls.core.orders.OrderInstance;
import com.renanabade.darksouls.core.orders.RestrictionEffect;
import com.renanabade.darksouls.core.orders.Restrictions;
import com.renanabade.darksouls.core.orders.Validation;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.Supplier;

/**
 * One validation of one set of orders. Reading an order registers its checks and constraints; the checks run once every order
 * is read, because each one must see what all the others forbid.
 */
final class ValidationRun {
    /** Where the first phase of a phase swap starts: after the first boss, fought with the class's kit. */
    private static final String PHASE_SWAP_START = "boss-asylum-demon";

    /** Location categories of things bought from a merchant. */
    private static final Set<String> SHOP = Set.of("SHOP_ITEM", "SHOP_EXTENDED_ITEM", "MISSABLE_SHOP_ITEM");

    /** A restriction and an order that cannot both hold: wearing what you find vs wearing no armor. */
    private static final String[][] CONFLICTS = {{"no-armor", "wear-what-you-find"}};

    private static final Set<String> ERRAND_TEMPLATES = Set.of("lizard-hunt", "every-chest", "errand");

    private static final class Constraints {
        final Set<String> regions;
        final Set<Location> locations;

        Constraints(Set<String> regions, Set<Location> locations) {
            this.regions = regions;
            this.locations = locations;
        }

        Constraints() {
            this(new HashSet<>(), new HashSet<>());
        }

        /** The same forbidden regions, with no forbidden location. */
        Constraints regionsOnly() {
            return new Constraints(regions, new HashSet<>());
        }
    }

    private static final class ResultBuilder {
        final String id;
        Support support = Support.GRAPH;
        final List<String> exceptions = new ArrayList<>();

        ResultBuilder(String id) {
            this.id = id;
        }
    }

    /** An order that chooses your weapon: when it starts and ends, and every weapon it may hand you. */
    private record WeaponPhase(String id, Predicate<Reach> starts, Milestone until, Function<Constraints, List<Weapon>> weapons) {}

    private record ElementFight(String id, Boss boss, Element element) {}

    private record ExceptionOrder(ResultBuilder result, Supplier<List<Location>> candidates) {}

    private record ChapterException(ResultBuilder result, Milestone from, Milestone until) {}

    private record Stretch(Milestone from, Milestone until) {}

    private record Build(Stats stats, int points) {}

    private final World world;
    private final Setup setup;
    private final List<? extends OrderInstance> orders;
    private final List<String> startItems;
    private final List<String> kit;
    private final Constraints constraints = new Constraints();
    private final List<Function<Constraints, String>> checks = new ArrayList<>();
    private final Map<String, List<Boss>> requiredBosses = new HashMap<>();

    // Build effects of restrictions and orders, read by the weapon checks (which run after every order is read).
    private final Set<String> activeRestrictions = new HashSet<>();
    private final List<String> schoolStyles = new ArrayList<>();
    private boolean noLevelUps;
    private boolean twoHanding = true;

    private final List<ElementFight> elementFights = new ArrayList<>();
    private final List<ResultBuilder> results = new ArrayList<>();

    // Orders that forbid locations but except what the game requires. Candidates are listed once every order is read,
    // because a shared shop closes only when all its merchants are closed.
    private final List<ExceptionOrder> exceptionOrders = new ArrayList<>();
    private final Set<String> closedMerchants = new HashSet<>();
    private final List<WeaponPhase> weaponPhases = new ArrayList<>();

    // A chapter's restriction on items lasts until the chapter's goal: its exceptions are only what the chapter needs, and
    // can be obtained by the time it ends.
    private final List<ChapterException> chapterExceptions = new ArrayList<>();

    ValidationRun(World world, Setup setup, List<? extends OrderInstance> orders) {
        this.world = world;
        this.setup = setup;
        this.orders = orders;
        startItems = Validator.startingItems(world, setup);
        var startingClass = setup.startingClass() == null ? null : world.classes().get(setup.startingClass());
        kit = startingClass == null ? List.of() : startingClass.kit();
        checks.add(c -> run(c).items().contains(world.goal()) ? null : "the goal \"" + world.goal() + "\" cannot be reached");
    }

    ValidationResult execute() {
        for (var index = 0; index < orders.size(); index++) readOrder(index, orders.get(index));

        addContradictions();
        addPlacesStayReachable();
        computeExceptions();

        var problems = failures(constraints);
        return new ValidationResult(
                problems.isEmpty() ? Verdict.COMFORTABLE : Verdict.IMPOSSIBLE,
                problems,
                results.stream().map(r -> new OrderResult(r.id, r.support, r.exceptions)).toList(),
                results.stream().allMatch(r -> r.support != Support.PENDING));
    }

    private List<String> failures(Constraints c) {
        List<String> failures = new ArrayList<>();
        for (var check : checks) {
            var problem = check.apply(c);
            if (problem != null) failures.add(problem);
        }

        return failures;
    }

    private Reach run(Constraints c, Set<String> forbiddenItems) {
        return Reachability.walk(world, new ReachOptions(startItems, forbiddenItems, c.regions, c.locations));
    }

    private Reach run(Constraints c) {
        return run(c, null);
    }

    private static Set<String> setOf(Collection<String> items) {
        return new HashSet<>(items);
    }

    /**
     * Bosses without whom a requirement cannot be met. Computed on the forbidden areas only: forbidden pickups would only make
     * the goal check fail first. Memoized, since checks run many times.
     */
    private List<Boss> bossesRequiredFor(Constraints c, String key, Requirement requirement) {
        var known = requiredBosses.get(key);
        if (known != null) return known;
        var regionsOnly = c.regionsOnly();
        List<Boss> bosses = new ArrayList<>();
        for (var boss : world.bosses().values()) {
            if (!run(regionsOnly, setOf(List.of(boss.defeatedItem()))).satisfies(requirement)) bosses.add(boss);
        }

        requiredBosses.put(key, bosses);
        return bosses;
    }

    private Build build(String label) {
        var startingClass = setup.startingClass() == null ? null : world.classes().get(setup.startingClass());
        if (startingClass == null || setup.levelCap() == null) {
            throw new InvalidOrderException(label + ": weapon orders need a starting class and a level cap");
        }

        var points = setup.levelCap() - startingClass.level();
        if (points < 0) throw new InvalidOrderException(label + ": level cap below the " + startingClass.name() + "'s level");
        return new Build(startingClass.stats(), noLevelUps ? 0 : points);
    }

    /** Why the weapons fail, or null: wieldable together within the points, hurting every boss. */
    private String weaponProblem(List<Weapon> weapons, String label, List<Boss> bosses) {
        var build = build(label);
        var needed = Combat.pointsToWield(weapons, build.stats(), twoHanding);
        if (needed > build.points()) {
            var names = String.join(" and ", weapons.stream().map(Weapon::name).toList());
            return names + " need" + (weapons.size() == 1 ? "s" : "") + " " + needed + " attribute points; the build leaves " + build.points();
        }

        for (var weapon : weapons) {
            for (var boss : bosses) {
                if (!Combat.damages(weapon, boss)) return weapon.name() + " cannot damage " + boss.name();
            }
        }

        return null;
    }

    /**
     * What the player can hold in a reach: pickups and purchases there, and the class's kit, which is picked up in the Asylum
     * before any boss.
     */
    private Set<String> held(Constraints c, Reach r) {
        Set<String> items = new LinkedHashSet<>(kit);
        for (var location : world.locations()) {
            if (!c.locations.contains(location) && r.regions().contains(location.region())) items.add(location.item());
        }

        return items;
    }

    /** Things to fight with among the items: melee weapons, and each catalyst held with each spell held. */
    private List<Weapon> armory(Set<String> items, boolean spells) {
        List<Weapon> weapons = new ArrayList<>();
        for (var item : items) {
            var weapon = world.weapons().get(item);
            if (weapon != null) weapons.add(weapon);
        }

        List<Spell> known = new ArrayList<>();
        if (spells) {
            for (var spell : world.spells().values()) {
                if (items.contains(spell.item()) || items.contains(spell.name())) known.add(spell);
            }
        }

        List<Weapon> armory = new ArrayList<>();
        for (var weapon : weapons) {
            if (Combat.isMeleeWeapon(weapon)) armory.add(weapon);
        }

        for (var catalyst : weapons) {
            for (var spell : known) {
                var kit = Combat.spellKit(spell, catalyst);
                if (kit != null) armory.add(kit);
            }
        }

        return armory;
    }

    private void restrict(String id, ResultBuilder result, String label, Stretch chapter) {
        activeRestrictions.add(id);
        var restriction = Restrictions.find(id);
        if (restriction == null) throw new InvalidOrderException(label + ": unknown restriction \"" + id + "\"");
        if (restriction.effect() == RestrictionEffect.ONE_HANDED) twoHanding = false;
        if (restriction.effect() == RestrictionEffect.NO_LEVEL_UPS) noLevelUps = true;
        if (restriction.effect() != RestrictionEffect.NO_RINGS) return;
        if (chapter != null) {
            chapterExceptions.add(new ChapterException(result, chapter.from(), chapter.until()));
        } else {
            exceptionOrders.add(new ExceptionOrder(result, this::ringLocations));
        }
    }

    private List<Location> ringLocations() {
        return world.locations().stream().filter(l -> "ring".equals(l.kind())).toList();
    }

    private void readOrder(int index, OrderInstance order) {
        var template = order.template();
        var args = order.args();
        var label = "order " + index + " (" + template.id() + ")";
        var validation = template.validationIn(setup.mode());
        if (validation == null) {
            throw new InvalidOrderException(label + " does not exist in " + setup.mode().name().toLowerCase(Locale.ROOT) + " mode");
        }

        var result = new ResultBuilder(template.id());
        results.add(result);

        switch (template.id()) {
            case "forbidden-area" -> constraints.regions.addAll(areaRegions(stringArg(args, "area", label), label));
            case "boss-before-bell" -> readBossBeforeBell(args, label);
            case "lord-order" -> readLordOrder(args, label);
            case "nothing-from-the-ground" -> readNothingFromTheGround(args, label, result);
            case "closed-merchant" -> readClosedMerchant(args, label, result);
            case "first-weapon-of-area" -> readFirstWeaponOfArea(template.id(), args, label);
            case "assigned-weapon" -> readAssignedWeapon(template.id(), args, label);

            // Worst case: the player chooses the boss order, so every restriction on the list may apply from the start.
            // Checking them all at once never accepts an impossible list (it may refuse a possible one).
            case "accumulated-curse" -> {
                for (var id : listArg(args, "restrictions", label)) restrict(id, result, label, null);
            }
            case "chapter-restriction" -> restrict(
                    stringArg(args, "restriction", label),
                    result,
                    label,
                    new Stretch(milestoneArg(args, "from", label), milestoneArg(args, "until", label)));

            // Worst case: the player may never earn a point.
            case "earned-levels" -> noLevelUps = true;
            case "phase-swap" -> readPhaseSwap(template.id(), args, label);
            case "exploit-weakness", "against-the-grain" -> readElementFight(template.id(), args, label);
            case "lizard-hunt", "every-chest" -> readEveryPlace(template.id(), args, label);
            case "errand" -> readErrand(args, label);
            case "one-bonfire" -> readOneBonfire(args, label, result, validation);
            case "the-other-way" -> readTheOtherWay(args, label);
            default -> result.support = validation == Validation.WEIGHT_ONLY ? Support.WEIGHT_ONLY : Support.PENDING;
        }
    }

    private void readBossBeforeBell(OrderArgs args, String label) {
        var boss = bossArg(args, label);
        var bells = setOf(Validator.BELLS);
        checks.add(c -> run(c, bells).items().contains(boss.defeatedItem()) ? null : boss.name() + " cannot be defeated before a bell");
    }

    private void readLordOrder(OrderArgs args, String label) {
        var order = lordSoulOrder(args, label);
        checks.add(c -> {
            for (var k = 0; k < order.size(); k++) {
                var later = order.subList(k + 1, order.size());
                if (!run(c, setOf(later)).items().contains(order.get(k))) {
                    return order.get(k) + " cannot be obtained before " + String.join(", ", later);
                }
            }

            return null;
        });
    }

    private void readNothingFromTheGround(OrderArgs args, String label, ResultBuilder result) {
        var regions = areaRegions(stringArg(args, "area", label), label);

        // Without the found flag, a required pickup could be missed and an impossible order pass.
        if (world.locations().stream().allMatch(l -> l.found() != null)) {
            exceptionOrders.add(new ExceptionOrder(result, () -> world.locations().stream()
                    .filter(l -> l.isFound() && regions.contains(l.region()))
                    .toList()));
        } else {
            result.support = Support.PENDING;
        }
    }

    private void readClosedMerchant(OrderArgs args, String label, ResultBuilder result) {
        var merchant = world.merchants().get(stringArg(args, "merchant", label));
        if (merchant == null) throw new InvalidOrderException(label + ": unknown merchant");
        closedMerchants.add(merchant.id());

        // A shop region is closed when every merchant selling there is closed.
        Predicate<String> isClosed = region -> world.merchants().values().stream()
                .allMatch(m -> !m.regions().contains(region) || closedMerchants.contains(m.id()));

        exceptionOrders.add(new ExceptionOrder(result, () -> world.locations().stream()
                .filter(l -> SHOP.contains(l.category()) && merchant.regions().contains(l.region()) && isClosed.test(l.region()))
                .toList()));
    }

    /** Worst case: whichever weapon the player picks up first in the area must do for the stretch. */
    private void readFirstWeaponOfArea(String id, OrderArgs args, String label) {
        var area = stringArg(args, "area", label);
        var regions = areaRegions(area, label);
        var until = milestoneArg(args, "until", label);
        build(label);
        Function<Constraints, List<Weapon>> areaWeapons = c -> {
            List<Weapon> weapons = new ArrayList<>();
            for (var location : world.locations()) {
                if (!location.isFound() || !regions.contains(location.region()) || c.locations.contains(location)) continue;
                var weapon = world.weapons().get(location.item());
                if (weapon != null && Combat.isMeleeWeapon(weapon)) weapons.add(weapon);
            }

            return weapons;
        };

        weaponPhases.add(new WeaponPhase(id, r -> regions.stream().anyMatch(r.regions()::contains), until, areaWeapons));
        checks.add(c -> {
            var before = run(c, setOf(until.requires().items()));
            if (regions.stream().noneMatch(before.regions()::contains)) return area + " cannot be entered before " + until.name();
            var weapons = areaWeapons.apply(c);
            if (weapons.isEmpty()) return "there is no weapon to find in " + area;
            List<Requirement> anyRegion = new ArrayList<>();
            for (var region : regions) anyRegion.add(new Requirement.Region(region));
            var beforeArea = new HashSet<>(bossesRequiredFor(c, "area:" + area, new Requirement.Any(anyRegion)));
            var stretch = without(bossesRequiredFor(c, "milestone:" + until.id(), until.requires()), beforeArea);
            for (var weapon : weapons) {
                var problem = weaponProblem(List.of(weapon), label, stretch);
                if (problem != null) return problem + " (found in " + area + ", used until " + until.name() + ")";
            }

            return null;
        });
    }

    private static List<Boss> without(List<Boss> bosses, Set<Boss> excluded) {
        return bosses.stream().filter(b -> !excluded.contains(b)).toList();
    }

    /** Existence: the named weapon can be taken before the stretch ends and does for it. */
    private void readAssignedWeapon(String id, OrderArgs args, String label) {
        var from = milestoneArg(args, "from", label);
        var until = milestoneArg(args, "until", label);
        var name = stringArg(args, "location", label);
        var location = world.locations().stream().filter(l -> l.name().equals(name)).findFirst()
                .orElseThrow(() -> new InvalidOrderException(label + ": unknown location \"" + name + "\""));
        var weapon = world.weapons().get(location.item());
        if (weapon == null || !Combat.isMeleeWeapon(weapon)) {
            throw new InvalidOrderException(label + ": \"" + name + "\" does not hold a melee weapon");
        }

        build(label);
        weaponPhases.add(new WeaponPhase(id, r -> r.satisfies(from.requires()), until, c -> List.of(weapon)));
        checks.add(c -> {
            var done = new HashSet<>(bossesRequiredFor(c, "milestone:" + from.id(), from.requires()));
            var stretch = without(bossesRequiredFor(c, "milestone:" + until.id(), until.requires()), done);

            // Taken without defeating any boss of the stretch: it is the weapon for all of them.
            var forbidden = setOf(until.requires().items());
            forbidden.addAll(defeats(stretch));
            var before = run(c, forbidden);
            if (c.locations.contains(location) || !before.regions().contains(location.region())) {
                return weapon.name() + " at \"" + name + "\" cannot be taken before the bosses until " + until.name();
            }

            var problem = weaponProblem(List.of(weapon), label, stretch);
            return problem == null ? null : problem + " (from " + from.name() + " until " + until.name() + ")";
        });
    }

    /**
     * Existence: some weapon of each style, taken in time, does for its phase, and one build fits both. A style is a family of
     * melee weapons or a school of magic (a catalyst and a spell of the school).
     */
    private void readPhaseSwap(String id, OrderArgs args, String label) {
        var milestone = milestoneArg(args, "milestone", label);
        var before = stringArg(args, "before", label);
        var after = stringArg(args, "after", label);
        for (var style : List.of(before, after)) {
            if (isSchool(style)) {
                schoolStyles.add(style);
                if (world.spells().values().stream().noneMatch(s -> s.school().id().equals(style))) {
                    throw new InvalidOrderException(label + ": no spells of the school \"" + style + "\"");
                }
            } else if (world.weapons().values().stream().noneMatch(w -> Combat.isMeleeWeapon(w) && w.category().equals(style))) {
                throw new InvalidOrderException(label + ": no melee weapons of category \"" + style + "\"");
            }
        }

        build(label);

        // Its two styles rule your weapon for the whole run; its own check fits them in one build.
        weaponPhases.add(new WeaponPhase(id, r -> true, null, c -> List.of()));
        checks.add(c -> {
            // The first phase starts after the first boss, fought with the class's kit.
            var start = world.milestones().get(PHASE_SWAP_START);
            Set<Boss> done = start == null ? new HashSet<>() : new HashSet<>(bossesRequiredFor(c, "milestone:" + start.id(), start.requires()));
            var first = without(bossesRequiredFor(c, "milestone:" + milestone.id(), milestone.requires()), done);
            Set<Boss> firstSet = new HashSet<>(first);
            var second = without(without(bossesRequiredFor(c, "goal", new Requirement.Has(world.goal())), firstSet), done);

            // Each style is taken without defeating any boss of its phase: it is the weapon for all of them.
            var forBefore = setOf(milestone.requires().items());
            forBefore.addAll(defeats(first));
            var a = fitFor(available(c, run(c, forBefore), before), first);
            var forAfter = setOf(defeats(second));
            forAfter.add(world.goal());
            var b = fitFor(available(c, run(c, forAfter), after), second);
            if (a.isEmpty()) return "no " + before + " can be taken before " + milestone.name();
            if (b.isEmpty()) return "no " + after + " can be taken for after " + milestone.name();
            for (var x : a) {
                for (var y : b) {
                    if (weaponProblem(List.of(x, y), label, List.of()) == null) return null;
                }
            }

            return "no " + before + " and " + after + " fit one build";
        });
    }

    /** What the player can hold by then, of the style. */
    private List<Weapon> available(Constraints c, Reach r, String style) {
        return armory(held(c, r), isSchool(style)).stream().filter(w -> w.category().equals(style)).toList();
    }

    private static List<Weapon> fitFor(List<Weapon> weapons, List<Boss> bosses) {
        return weapons.stream().filter(w -> bosses.stream().allMatch(b -> Combat.damages(w, b))).toList();
    }

    /**
     * Existence: something that deals the element (a melee weapon, or a spell with its catalyst) can be taken before the boss
     * falls and fits the build. Thrown items also count for the player, but are left out here: that can only refuse a possible
     * fight, never accept an impossible one.
     */
    private void readElementFight(String id, OrderArgs args, String label) {
        var boss = bossArg(args, label);
        var elementId = stringArg(args, "element", label);
        var element = Combat.ELEMENTAL.stream().filter(e -> e.id().equals(elementId)).findFirst()
                .orElseThrow(() -> new InvalidOrderException(label + ": unknown element \"" + elementId + "\""));
        build(label);
        elementFights.add(new ElementFight(id, boss, element));
        checks.add(c -> {
            if (boss.parts().stream().anyMatch(p -> p.noDamage().contains(element))) return boss.name() + " takes no " + elementId + " damage";
            var items = held(c, run(c, setOf(List.of(boss.defeatedItem()))));
            var sources = armory(items, !activeRestrictions.contains("no-magic")).stream().filter(w -> w.damage().of(element) > 0).toList();
            if (sources.isEmpty()) return "nothing that deals " + elementId + " can be taken before " + boss.name();
            return sources.stream().anyMatch(w -> weaponProblem(List.of(w), label, List.of()) == null)
                    ? null
                    : "nothing that deals " + elementId + " against " + boss.name() + " fits the build";
        });
    }

    /** Existence: every crystal lizard, or every chest, of the area can be reached before the milestone. */
    private void readEveryPlace(String id, OrderArgs args, String label) {
        var area = stringArg(args, "area", label);
        var regions = areaRegions(area, label);
        var until = milestoneArg(args, "until", label);
        var lizards = id.equals("lizard-hunt");
        List<String> places = lizards
                ? world.locations().stream()
                        .filter(l -> l.category().equals(Validator.CRYSTAL_LIZARD) && regions.contains(l.region()))
                        .map(Location::region)
                        .toList()
                : world.chests().stream().map(Chest::region).filter(regions::contains).toList();
        if (places.isEmpty()) throw new InvalidOrderException(label + ": no " + (lizards ? "crystal lizards" : "chests") + " in " + area);
        if (!lizards && !Objects.equals(args.number("chests"), places.size())) {
            throw new InvalidOrderException(label + ": " + area + " holds " + places.size() + " chests");
        }

        checks.add(c -> {
            var before = run(c, setOf(until.requires().items()));
            return places.stream().allMatch(before.regions()::contains)
                    ? null
                    : "not every " + (lizards ? "crystal lizard" : "chest") + " of " + area + " can be reached before " + until.name();
        });
    }

    /**
     * Existence: the pickup can be reached before the milestone. Only forbidden areas count: the orders that forbid pickups
     * forbid using them, never taking them.
     */
    private void readErrand(OrderArgs args, String label) {
        var name = stringArg(args, "location", label);
        var location = world.locations().stream().filter(l -> l.name().equals(name) && l.isFound()).findFirst()
                .orElseThrow(() -> new InvalidOrderException(label + ": \"" + name + "\" is not a corpse or chest pickup"));
        var until = milestoneArg(args, "until", label);
        checks.add(c -> run(new Constraints(c.regions, new HashSet<>()), setOf(until.requires().items())).regions().contains(location.region())
                ? null
                : location.item() + " cannot be taken before " + until.name());
    }

    /** Weight only, except a bonfire that is out or missing for part of the run. */
    private void readOneBonfire(OrderArgs args, String label, ResultBuilder result, Validation validation) {
        var bonfire = stringArg(args, "bonfire", label);
        result.support = validation == Validation.WEIGHT_ONLY ? Support.WEIGHT_ONLY : Support.PENDING;
        var location = world.locationNamed(bonfire);
        if (location != null && !location.alwaysLit()) {
            for (var window : location.unavailable()) {
                checks.add(c -> bonfire + " cannot be the one bonfire: " + window.why());
            }
        }
    }

    /** Existence: the milestone can still be reached without the area. */
    private void readTheOtherWay(OrderArgs args, String label) {
        var area = stringArg(args, "area", label);
        var regions = areaRegions(area, label);
        var until = milestoneArg(args, "until", label);
        checks.add(c -> {
            Set<String> closed = new HashSet<>(c.regions);
            closed.addAll(regions);
            return run(new Constraints(closed, c.locations)).satisfies(until.requires())
                    ? null
                    : until.name() + " cannot be reached without entering " + area;
        });
    }

    private boolean endsBefore(Constraints c, WeaponPhase a, WeaponPhase b) {
        return a.until() != null && !b.starts().test(run(c, setOf(a.until().requires().items())));
    }

    private String placeOf(OrderInstance order) {
        var area = order.args().text("area");
        if (area != null) return area;
        var name = order.args().text("location");
        for (var location : world.locations()) {
            if (location.name().equals(name)) {
                var region = world.regions().get(location.region());
                return region == null ? null : region.area();
            }
        }

        return null;
    }

    private List<String> areasOf(String id) {
        return orders.stream()
                .filter(o -> o.template().id().equals(id))
                .map(o -> o.args().text("area"))
                .filter(Objects::nonNull)
                .toList();
    }

    /** Orders that contradict each other whatever the world allows. */
    private void addContradictions() {
        Set<String> ids = new HashSet<>();
        for (var order : orders) ids.add(order.template().id());

        // Two orders may choose your weapon only one after the other: one ends before the other can start.
        for (var i = 0; i < weaponPhases.size(); i++) {
            var a = weaponPhases.get(i);
            for (var b : weaponPhases.subList(i + 1, weaponPhases.size())) {
                checks.add(c -> endsBefore(c, a, b) || endsBefore(c, b, a)
                        ? null
                        : a.id() + " and " + b.id() + " would choose your weapon at the same time");
            }
        }

        // Attributes only grow, so one build must wield every weapon the orders may hand you, at any time.
        if (weaponPhases.size() > 1) {
            checks.add(c -> {
                List<Weapon> all = new ArrayList<>();
                for (var phase : weaponPhases) all.addAll(phase.weapons().apply(c));
                var problem = weaponProblem(all, "weapon orders", List.of());
                return problem == null ? null : problem + " (every weapon the orders may hand you)";
            });
        }

        // One element per fight. And while an order chooses your weapon, it would also have to deal the element: until the
        // validator knows which fights a weapon order covers, the two do not go together.
        for (var i = 0; i < elementFights.size(); i++) {
            var a = elementFights.get(i);
            for (var b : elementFights.subList(i + 1, elementFights.size())) {
                if (b.boss() == a.boss() && b.element() != a.element()) {
                    checks.add(c -> a.boss().name() + " cannot be fought only with " + a.element().id() + " and only with " + b.element().id());
                    break;
                }
            }
        }

        if (!weaponPhases.isEmpty() && !elementFights.isEmpty()) {
            var chooser = weaponPhases.get(0);
            var fight = elementFights.get(0);
            checks.add(c -> chooser.id() + " chooses your weapon, and " + fight.id() + " the element of a fight");
        }

        // Something to do in an area before a milestone, and the same area closed until that milestone.
        for (var closed : orders) {
            if (!closed.template().id().equals("the-other-way")) continue;
            var closedArea = closed.args().text("area");
            for (var errand : orders) {
                if (ERRAND_TEMPLATES.contains(errand.template().id())
                        && Objects.equals(placeOf(errand), closedArea)
                        && Objects.equals(errand.args().text("until"), closed.args().text("until"))) {
                    checks.add(c -> errand.template().id() + " sends you into " + closedArea + ", which the-other-way closes");
                    break;
                }
            }
        }

        // Armor picked up must be worn, and nothing picked up may be worn: not both in one area.
        var groundAreas = areasOf("nothing-from-the-ground");
        for (var wearArea : areasOf("wear-what-you-find")) {
            if (groundAreas.contains(wearArea)) {
                checks.add(c -> "\"wear-what-you-find\" and \"nothing-from-the-ground\" contradict each other in " + wearArea);
                break;
            }
        }

        for (var conflict : CONFLICTS) {
            if (activeRestrictions.contains(conflict[0]) && ids.contains(conflict[1])) {
                checks.add(c -> "the restriction \"" + conflict[0] + "\" contradicts the order \"" + conflict[1] + "\"");
            }
        }

        if (activeRestrictions.contains("no-magic") && !schoolStyles.isEmpty()) {
            var schools = String.join(", ", schoolStyles);
            checks.add(c -> "the restriction \"no-magic\" contradicts fighting with " + schools);
        }
    }

    /**
     * Every order is about a place the player can still reach once the forbidden areas are closed. The forbidden area itself is
     * checked against the other forbiddances only: closing it is the order. One reach per distinct forbidden set, shared with the
     * generator.
     */
    private void addPlacesStayReachable() {
        if (orders.stream().noneMatch(o -> o.template().id().equals("forbidden-area"))) return;
        for (var order : orders) {
            var template = order.template();
            var args = order.args();
            if (template.id().equals("forbidden-area")) {
                var area = args.text("area");
                if (area == null) continue;
                var own = setOf(world.regionsInArea(area));
                checks.add(c -> {
                    var others = c.regions.stream().filter(id -> !own.contains(id)).toList();
                    if (others.isEmpty()) return null;
                    var place = Validator.unreachableTarget(world, args, Reachability.withoutRegions(world, others, startItems).regions());
                    return place == null ? null : template.id() + ": " + place + " cannot be reached";
                });
                continue;
            }

            checks.add(c -> {
                if (c.regions.isEmpty()) return null;
                var place = Validator.unreachableTarget(world, args, Reachability.withoutRegions(world, c.regions, startItems).regions());
                return place == null ? null : template.id() + ": " + place + " cannot be reached";
            });
        }
    }

    /**
     * Automatic exceptions, once every other constraint is known. Each candidate location is forbidden in turn; one that breaks a
     * check stays allowed and goes on the list. Checks only get harder as more is forbidden, so every item on the list is needed
     * by the final set: the list cannot be shortened. A location two orders cover (a shop shared by two closed merchants) is
     * decided by the first one.
     */
    private void computeExceptions() {
        if (!failures(constraints).isEmpty()) return;

        Set<Location> decided = new HashSet<>();
        for (var order : exceptionOrders) {
            var pickups = order.candidates().get().stream().filter(l -> !decided.contains(l)).toList();
            decided.addAll(pickups);
            constraints.locations.addAll(pickups);
            if (failures(constraints).isEmpty()) continue;
            constraints.locations.removeAll(pickups);
            for (var location : pickups) {
                constraints.locations.add(location);
                if (!failures(constraints).isEmpty()) {
                    constraints.locations.remove(location);
                    if (!order.result().exceptions.contains(location.item())) order.result().exceptions.add(location.item());
                }
            }
        }

        // The same, for a chapter, from where the chapter starts: the player already holds what can be taken before the
        // chapter's goal, except the rings themselves. Each ring is then forbidden in turn; one without which the goal cannot
        // be reached is an exception. So the list holds only what the chapter itself needs: the Kiln's chapter needs no ring,
        // though the run as a whole needs two.
        for (var chapter : chapterExceptions) {
            var from = chapter.from();
            var until = chapter.until();
            var pickups = ringLocations().stream().filter(l -> !constraints.locations.contains(l)).toList();
            Set<String> rings = new HashSet<>();
            for (var pickup : pickups) rings.add(pickup.item());
            var behind = milestonesBehind(from);

            Set<Boss> done = new HashSet<>();
            Set<String> behindItems = new HashSet<>();
            for (var milestone : behind) {
                done.addAll(bossesRequiredFor(constraints, "milestone:" + milestone.id(), milestone.requires()));
                behindItems.addAll(milestone.requires().items());
            }

            var bossesAhead = without(bossesRequiredFor(constraints, "milestone:" + until.id(), until.requires()), done);
            Set<String> stillAhead = setOf(until.requires().items());
            stillAhead.removeAll(behindItems);
            stillAhead.addAll(defeats(bossesAhead));
            List<String> atChapterStart = new ArrayList<>();
            for (var item : run(constraints, stillAhead).items()) {
                if (!rings.contains(item)) atChapterStart.add(item);
            }

            Set<Location> forbidden = new HashSet<>(constraints.locations);
            forbidden.addAll(pickups);
            Supplier<Boolean> reachesGoal = () -> Reachability
                    .walk(world, new ReachOptions(atChapterStart, null, constraints.regions, forbidden))
                    .satisfies(until.requires());

            if (reachesGoal.get()) continue;
            forbidden.removeAll(pickups);
            for (var location : pickups) {
                forbidden.add(location);
                if (!reachesGoal.get()) {
                    forbidden.remove(location);
                    if (!chapter.result().exceptions.contains(location.item())) chapter.result().exceptions.add(location.item());
                }
            }
        }
    }

    /**
     * The milestones a chapter starting at this one has behind it. Each Lord Soul's milestone holds only its own soul, so the
     * souls placed before it come from the journey's order of the Lords.
     */
    private List<Milestone> milestonesBehind(Milestone from) {
        List<String> order = null;
        for (var candidate : orders) {
            if (candidate.template().id().equals("lord-order")) {
                order = candidate.args().list("order");
                break;
            }
        }

        if (!from.kind().equals("lord-souls") || order == null) return List.of(from);
        Set<String> placed = new HashSet<>();
        var fromItems = from.requires().items();
        for (var soul : order) {
            if (fromItems.contains(soul)) break;
            placed.add(soul);
        }

        return world.milestones().values().stream()
                .filter(m -> m.equals(from) || (m.kind().equals("lord-souls") && m.requires().items().stream().anyMatch(placed::contains)))
                .toList();
    }

    private static List<String> defeats(Collection<Boss> bosses) {
        return bosses.stream().map(Boss::defeatedItem).toList();
    }

    private static boolean isSchool(String style) {
        return Combat.SCHOOLS.stream().anyMatch(s -> s.id().equals(style));
    }

    private static String stringArg(OrderArgs args, String name, String label) {
        var value = args.text(name);
        if (value == null) throw new InvalidOrderException(label + ": \"" + name + "\" must be an id");
        return value;
    }

    private static List<String> listArg(OrderArgs args, String name, String label) {
        var list = args.list(name);
        if (list == null || list.isEmpty()) throw new InvalidOrderException(label + ": \"" + name + "\" must be a non-empty list");
        return list;
    }

    private Boss bossArg(OrderArgs args, String label) {
        var boss = world.bosses().get(stringArg(args, "boss", label));
        if (boss == null) throw new InvalidOrderException(label + ": unknown boss");
        return boss;
    }

    private Milestone milestoneArg(OrderArgs args, String name, String label) {
        var id = stringArg(args, name, label);
        var milestone = world.milestones().get(id);
        if (milestone == null) throw new InvalidOrderException(label + ": unknown milestone \"" + id + "\"");
        return milestone;
    }

    private Set<String> areaRegions(String area, String label) {
        Set<String> ids = new HashSet<>();
        for (var region : world.regions().values()) {
            if (area.equals(region.area())) ids.add(region.id());
        }

        if (ids.isEmpty()) throw new InvalidOrderException(label + ": unknown area \"" + area + "\"");
        return ids;
    }

    /** The order argument must name every Lord Soul of the graph exactly once. */
    private List<String> lordSoulOrder(OrderArgs args, String label) {
        Set<String> souls = new LinkedHashSet<>();
        for (var location : world.locations()) {
            if (location.category().equals("LORD_SOUL")) souls.add(location.item());
        }

        var value = args.list("order");
        if (value == null || value.size() != souls.size() || new HashSet<>(value).size() != value.size() || !souls.containsAll(value)) {
            throw new InvalidOrderException(label + ": \"order\" must list each Lord Soul once: " + String.join(", ", souls));
        }

        return value;
    }
}
