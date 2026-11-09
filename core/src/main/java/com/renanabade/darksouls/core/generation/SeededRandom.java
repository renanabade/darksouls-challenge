package com.renanabade.darksouls.core.generation;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.function.ToDoubleFunction;

/**
 * A seeded pseudo-random generator, so that the same seed always gives the same challenge on every machine and runtime
 * (java.util.Random is tied to its own algorithm, and could not reproduce the draws players already share). sfc32 (Chris
 * Doty-Humphrey's Small Fast Counter), seeded by four salted FNV-1a hashes of the seed text. Java has no unsigned int: the
 * arithmetic wraps the same, and the shifts must be logical.
 */
public final class SeededRandom {
    private int a;
    private int b;
    private int c;
    private int d;

    public SeededRandom(String seed) {
        a = fnv1a("1:" + seed);
        b = fnv1a("2:" + seed);
        c = fnv1a("3:" + seed);
        d = fnv1a("4:" + seed);
        for (var i = 0; i < 15; i++) next(); // mix the state before use
    }

    /** A float in [0, 1). */
    public double next() {
        var t = a + b + d;
        d += 1;
        a = b ^ (b >>> 9);
        b = c + (c << 3);
        c = (c << 21) | (c >>> 11);
        c += t;
        return (t & 0xFFFFFFFFL) / 4294967296.0;
    }

    /** An integer in [min, max]. */
    public int nextInt(int min, int max) {
        return min + (int) Math.floor(next() * (max - min + 1));
    }

    public <T> T pick(List<T> list) {
        var index = (int) Math.floor(next() * list.size());
        if (index >= list.size()) throw new IllegalArgumentException("pick from an empty list");
        return list.get(index);
    }

    /** A shuffled copy (Fisher-Yates). Sort the input first: its order is part of the result. */
    public <T> List<T> shuffle(Iterable<T> list) {
        List<T> shuffled = new ArrayList<>();
        list.forEach(shuffled::add);
        for (var i = shuffled.size() - 1; i > 0; i--) {
            var j = (int) Math.floor(next() * (i + 1));
            Collections.swap(shuffled, i, j);
        }

        return shuffled;
    }

    private record Keyed<T>(T item, double key) {}

    /**
     * A shuffled copy where items of larger weight tend to come first (Efraimidis-Spirakis: each item gets the key u^(1/weight)
     * and the list is sorted by key, descending, keeping ties in order). Weights must be positive.
     */
    public <T> List<T> weightedShuffle(Iterable<T> list, ToDoubleFunction<T> weight) {
        List<Keyed<T>> keyed = new ArrayList<>();
        for (var item : list) {
            // StrictMath: Math.pow may answer differently once the JIT replaces it.
            var u = next();
            keyed.add(new Keyed<>(item, StrictMath.pow(u, 1 / weight.applyAsDouble(item))));
        }

        keyed.sort(Comparator.comparingDouble((Keyed<T> k) -> k.key()).reversed());
        List<T> items = new ArrayList<>();
        for (var entry : keyed) items.add(entry.item());
        return items;
    }

    static int fnv1a(String text) {
        var hash = 0x811c9dc5;
        for (var i = 0; i < text.length(); i++) {
            hash ^= text.charAt(i);
            hash *= 0x01000193;
        }

        return hash;
    }
}
