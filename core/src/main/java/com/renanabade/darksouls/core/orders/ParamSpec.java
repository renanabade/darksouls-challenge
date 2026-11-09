package com.renanabade.darksouls.core.orders;

public record ParamSpec(ParamKind kind, DifficultyRanges ranges) {
    public ParamSpec(ParamKind kind) {
        this(kind, null);
    }
}
