package com.renanabade.darksouls.core.orders;

import java.util.List;

/**
 * What the master commands, in a form the validator can act on: its kind, what it acts on, and the parameters it reads, with
 * the kind each of them must have.
 */
public record Command(CommandKind kind, String action, List<ParamRef> params) {
    public static Command of(CommandKind kind, String action, ParamRef... params) {
        return new Command(kind, action, List.of(params));
    }
}
