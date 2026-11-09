package com.renanabade.darksouls.server;

import java.security.SecureRandom;
import java.util.UUID;

/** UUID version 7: random, but ordered by time, so new rows land together in the primary key's index. */
public final class Ids {
    private static final SecureRandom RANDOM = new SecureRandom();

    private Ids() {}

    public static UUID next() {
        var high = (System.currentTimeMillis() << 16) | 0x7000L | (RANDOM.nextInt() & 0x0FFFL);
        var low = (RANDOM.nextLong() & 0x3FFFFFFFFFFFFFFFL) | 0x8000000000000000L;
        return new UUID(high, low);
    }
}
