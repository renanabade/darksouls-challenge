package com.renanabade.darksouls.core.orders;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

public enum Mode {
    STATIC,
    LIVE;

    @JsonValue
    public String label() {
        return name().toLowerCase(Locale.ROOT);
    }
}
