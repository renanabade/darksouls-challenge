package com.renanabade.darksouls.core;

import java.util.List;

public final class WorldParseException extends RuntimeException {
    private final List<String> problems;

    public WorldParseException(List<String> problems) {
        super("invalid data set (" + problems.size() + " problems):\n" + String.join("\n", problems));
        this.problems = List.copyOf(problems);
    }

    public List<String> problems() {
        return problems;
    }
}
