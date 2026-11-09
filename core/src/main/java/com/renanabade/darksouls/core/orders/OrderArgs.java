package com.renanabade.darksouls.core.orders;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** The parameters of an order, in the order they were drawn. In JSON: plain values, an id, a number or a list of ids. */
public final class OrderArgs {
    private final Map<String, ArgValue> values = new LinkedHashMap<>();

    public ArgValue get(String name) {
        return values.get(name);
    }

    /** The id a parameter holds, or null when it holds none. */
    public String text(String name) {
        return values.get(name) instanceof ArgValue.Text text ? text.value() : null;
    }

    /** The number a parameter holds, or null when it holds none. */
    public Integer number(String name) {
        return values.get(name) instanceof ArgValue.Number number ? number.value() : null;
    }

    /** The list a parameter holds, or null when it holds none. */
    public List<String> list(String name) {
        return values.get(name) instanceof ArgValue.TextList list ? list.values() : null;
    }

    public OrderArgs put(String name, String value) {
        values.put(name, new ArgValue.Text(value));
        return this;
    }

    public OrderArgs put(String name, int value) {
        values.put(name, new ArgValue.Number(value));
        return this;
    }

    public OrderArgs put(String name, List<String> value) {
        values.put(name, new ArgValue.TextList(value));
        return this;
    }

    public OrderArgs put(String name, ArgValue value) {
        values.put(name, value);
        return this;
    }

    /** A copy with one parameter set. */
    public OrderArgs with(String name, ArgValue value) {
        var copy = new OrderArgs();
        copy.values.putAll(values);
        copy.values.put(name, value);
        return copy;
    }

    public Map<String, ArgValue> entries() {
        return values;
    }

    @JsonValue
    public Map<String, Object> toJson() {
        Map<String, Object> plain = new LinkedHashMap<>();
        values.forEach((name, value) -> plain.put(name, switch (value) {
            case ArgValue.Text text -> text.value();
            case ArgValue.Number number -> number.value();
            case ArgValue.TextList list -> list.values();
        }));
        return plain;
    }

    @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
    public static OrderArgs fromJson(Map<String, Object> plain) {
        var args = new OrderArgs();
        plain.forEach((name, value) -> {
            switch (value) {
                case String text -> args.put(name, text);
                case Number number -> args.put(name, number.intValue());
                case List<?> list -> {
                    List<String> texts = new ArrayList<>();
                    list.forEach(item -> texts.add(String.valueOf(item)));
                    args.put(name, texts);
                }
                default -> throw new IllegalArgumentException("unexpected argument \"" + name + "\"");
            }
        });
        return args;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof OrderArgs args && values.equals(args.values);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(values);
    }

    @Override
    public String toString() {
        return values.toString();
    }
}
