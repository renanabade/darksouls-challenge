package com.renanabade.darksouls.core;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Predicate;
import tools.jackson.databind.JsonNode;

/**
 * A condition on an edge of the world graph (data/ds1/SCHEMA.md): a constant, an item or milestone held, a region
 * already reached, or a combination of those.
 */
public sealed interface Requirement {
    Requirement TRUE = new Constant(true);

    record Constant(boolean value) implements Requirement {}

    record Has(String item) implements Requirement {}

    record Region(String id) implements Requirement {}

    record All(List<Requirement> children) implements Requirement {}

    record Any(List<Requirement> children) implements Requirement {}

    /** Evaluates the expression against what the player holds and has reached. */
    default boolean evaluate(Predicate<String> has, Predicate<String> reached) {
        return switch (this) {
            case Constant c -> c.value();
            case Has h -> has.test(h.item());
            case Region r -> reached.test(r.id());
            case All a -> {
                for (var child : a.children()) {
                    if (!child.evaluate(has, reached)) yield false;
                }
                yield true;
            }
            case Any a -> {
                for (var child : a.children()) {
                    if (child.evaluate(has, reached)) yield true;
                }
                yield false;
            }
        };
    }

    /** Every item the expression mentions, in first-seen order. */
    default List<String> items() {
        Set<String> items = new LinkedHashSet<>();
        visit(this, items::add, id -> {});
        return new ArrayList<>(items);
    }

    /** Every region the expression mentions, in first-seen order. */
    default List<String> regions() {
        Set<String> regions = new LinkedHashSet<>();
        visit(this, item -> {}, regions::add);
        return new ArrayList<>(regions);
    }

    /**
     * Reads an expression from JSON, or throws with the path of the first bad node. The data set is generated, but it
     * crosses a process boundary, so it is checked once on load.
     */
    static Requirement parse(JsonNode value, String path) {
        if (value.isBoolean()) return new Constant(value.booleanValue());
        if (!value.isObject()) throw new RequirementParseException("expected a boolean or an object", path);

        var properties = new ArrayList<>(value.properties());
        if (properties.size() != 1) {
            throw new RequirementParseException("expected exactly one key, got " + properties.size(), path);
        }

        var key = properties.get(0).getKey();
        var inner = properties.get(0).getValue();
        switch (key) {
            case "has", "region" -> {
                if (!inner.isString() || inner.stringValue().isEmpty()) {
                    throw new RequirementParseException("\"" + key + "\" must be a non-empty string", path + "." + key);
                }
                return key.equals("has") ? new Has(inner.stringValue()) : new Region(inner.stringValue());
            }
            case "all", "any" -> {
                if (!inner.isArray() || inner.isEmpty()) {
                    throw new RequirementParseException("\"" + key + "\" must be a non-empty array", path + "." + key);
                }
                List<Requirement> children = new ArrayList<>();
                var i = 0;
                for (var child : inner.values()) {
                    children.add(parse(child, path + "." + key + "[" + i + "]"));
                    i++;
                }
                return key.equals("all") ? new All(children) : new Any(children);
            }
            default -> throw new RequirementParseException("unknown key \"" + key + "\"", path);
        }
    }

    static Requirement parse(JsonNode value) {
        return parse(value, "$");
    }

    private static void visit(Requirement requirement, Consumer<String> has, Consumer<String> region) {
        switch (requirement) {
            case Has h -> has.accept(h.item());
            case Region r -> region.accept(r.id());
            case All a -> a.children().forEach(child -> visit(child, has, region));
            case Any a -> a.children().forEach(child -> visit(child, has, region));
            case Constant c -> {}
        }
    }
}
