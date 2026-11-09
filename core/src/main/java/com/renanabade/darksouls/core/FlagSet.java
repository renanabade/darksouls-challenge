package com.renanabade.darksouls.core;

import java.util.AbstractSet;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** A set of names read from the flags of a walk, without copying them into a hash set. */
final class FlagSet extends AbstractSet<String> {
    private final boolean[] flags;
    private final List<String> names;
    private final Map<String, Integer> ids;
    private final Set<String> extras;
    private int size = -1;

    FlagSet(boolean[] flags, List<String> names, Map<String, Integer> ids, Set<String> extras) {
        this.flags = flags;
        this.names = names;
        this.ids = ids;
        this.extras = extras;
    }

    @Override
    public boolean contains(Object item) {
        var id = ids.get(item);
        if (id != null) return flags[id];
        return extras != null && extras.contains(item);
    }

    @Override
    public int size() {
        if (size < 0) {
            var count = extras == null ? 0 : extras.size();
            for (var flag : flags) {
                if (flag) count++;
            }
            size = count;
        }

        return size;
    }

    @Override
    public Iterator<String> iterator() {
        List<String> all = new ArrayList<>(size());
        for (var i = 0; i < flags.length; i++) {
            if (flags[i]) all.add(names.get(i));
        }

        if (extras != null) all.addAll(extras);
        return all.iterator();
    }
}
