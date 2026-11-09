package com.renanabade.darksouls.core;

import java.util.ArrayList;
import java.util.List;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;

/**
 * Reads untrusted JSON field by field. Collects every problem instead of stopping at the first, so one pipeline run can fix
 * them all; each reader returns a harmless default after a failure. A null node means the field is absent, which is not the
 * same as a JSON null.
 */
final class Checker {
    static final JsonNode NO_FIELDS = JsonNodeFactory.instance.objectNode();

    final List<String> problems = new ArrayList<>();

    void fail(String path, String message) {
        problems.add(message + " at " + path);
    }

    static JsonNode get(JsonNode fields, String key) {
        return fields != null && fields.isObject() ? fields.get(key) : null;
    }

    /** The field, unless it is absent or a JSON null. */
    static JsonNode present(JsonNode value) {
        return value == null || value.isNull() ? null : value;
    }

    List<JsonNode> array(JsonNode value, String path) {
        if (value != null && value.isArray()) return new ArrayList<>(value.values());
        fail(path, "expected an array");
        return List.of();
    }

    /** An array, or nothing when the field is absent or a JSON null. */
    List<JsonNode> optionalArray(JsonNode value, String path) {
        return present(value) == null ? List.of() : array(value, path);
    }

    JsonNode object(JsonNode value, String path) {
        if (value != null && value.isObject()) return value;
        fail(path, "expected an object");
        return null;
    }

    JsonNode objectOrNone(JsonNode value, String path) {
        var object = object(value, path);
        return object == null ? NO_FIELDS : object;
    }

    String string(JsonNode fields, String key, String path) {
        var value = get(fields, key);
        if (value != null && value.isString() && !value.stringValue().isEmpty()) return value.stringValue();
        fail(path + "." + key, "expected a non-empty string");
        return "";
    }

    String nullableString(JsonNode fields, String key, String path) {
        var value = get(fields, key);
        return value != null && value.isNull() ? null : string(fields, key, path);
    }

    boolean bool(JsonNode fields, String key, String path, Boolean fallback) {
        var value = get(fields, key);
        if (value != null && value.isBoolean()) return value.booleanValue();
        if (value == null && fallback != null) return fallback;
        fail(path + "." + key, "expected a boolean");
        return false;
    }

    boolean bool(JsonNode fields, String key, String path) {
        return bool(fields, key, path, null);
    }

    int integer(JsonNode fields, String key, String path) {
        var value = get(fields, key);
        if (value != null && value.isNumber()) {
            var number = value.doubleValue();
            if (Math.floor(number) == number && Math.abs(number) <= Integer.MAX_VALUE) return (int) number;
        }

        fail(path + "." + key, "expected an integer");
        return 0;
    }

    double number(JsonNode fields, String key, String path) {
        var value = get(fields, key);
        if (value != null && value.isNumber() && Double.isFinite(value.doubleValue())) return value.doubleValue();
        fail(path + "." + key, "expected a number");
        return 0;
    }

    /** An array of non-empty strings. */
    List<String> strings(Iterable<JsonNode> values, String path) {
        List<String> strings = new ArrayList<>();
        var i = 0;
        for (var item : values) {
            if (item.isString() && !item.stringValue().isEmpty()) strings.add(item.stringValue());
            else fail(path + "[" + i + "]", "expected a non-empty string");
            i++;
        }

        return strings;
    }

    Requirement requirement(JsonNode value, String path) {
        if (value == null) {
            fail(path, "expected a boolean or an object");
            return new Requirement.Constant(false);
        }

        try {
            return Requirement.parse(value, path);
        } catch (RequirementParseException error) {
            problems.add(error.getMessage());
            return new Requirement.Constant(false);
        }
    }
}
