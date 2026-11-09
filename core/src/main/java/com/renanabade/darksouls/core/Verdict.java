package com.renanabade.darksouls.core;

/**
 * Impossible: some order cannot be followed. Unexpected: possible only with a jump, a farm or a long detour. Comfortable:
 * possible as intended. The graph does not mark unexpected paths yet, so the validator only answers impossible or
 * comfortable.
 */
public enum Verdict {
    IMPOSSIBLE,
    UNEXPECTED,
    COMFORTABLE
}
