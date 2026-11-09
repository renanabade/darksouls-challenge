package com.renanabade.darksouls.core.orders;

import java.util.List;

/** A parameter value drawn by the generator: an id, a number, or a list of ids. */
public sealed interface ArgValue {
    record Text(String value) implements ArgValue {}

    record Number(int value) implements ArgValue {}

    record TextList(List<String> values) implements ArgValue {}
}
