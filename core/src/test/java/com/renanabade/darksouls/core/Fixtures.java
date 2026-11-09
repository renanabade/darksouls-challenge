package com.renanabade.darksouls.core;

import com.renanabade.darksouls.core.orders.Catalog;
import com.renanabade.darksouls.core.orders.OrderArgs;
import com.renanabade.darksouls.core.orders.OrderInstance;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** What the tests share: the DS1 world, parsed once since it is immutable, and short ways to write small test worlds and orders. */
public final class Fixtures {
    public static final Path ROOT = findRoot();
    public static final Path DATA = ROOT.resolve("data").resolve("ds1");
    public static final World DS1 = WorldParser.parse(RawDataSet.fromDirectory(DATA));

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private Fixtures() {}

    public static StartingGift noGift() {
        return DS1.gifts().stream().filter(g -> g.items().isEmpty()).findFirst().orElseThrow();
    }

    public static StartingGift masterKeyGift() {
        return DS1.gifts().stream().filter(g -> g.items().stream().anyMatch(i -> i.item().equals("Master Key"))).findFirst().orElseThrow();
    }

    /** Plain JSON, as the data set files would hold it. */
    public static JsonNode json(String text) {
        return MAPPER.readTree(text);
    }

    public static JsonNode readFile(String file) {
        try {
            return MAPPER.readTree(Files.readString(DATA.resolve(file + ".json")));
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    public static List<String> strings(JsonNode array) {
        List<String> strings = new ArrayList<>();
        for (var item : array) strings.add(item.stringValue());
        return strings;
    }

    public static Set<String> set(String... items) {
        return new HashSet<>(Arrays.asList(items));
    }

    public static List<String> sorted(Collection<String> items) {
        return new ArrayList<>(new TreeSet<>(items));
    }

    /** Sorted, keeping repeated items. */
    public static List<String> sortedAll(Collection<String> items) {
        return items.stream().sorted().toList();
    }

    /** The arguments of an order, as name and value pairs. A value is a text, a number or a list of texts. */
    @SuppressWarnings("unchecked")
    public static OrderArgs args(Object... pairs) {
        var args = new OrderArgs();
        for (var i = 0; i < pairs.length; i += 2) {
            var name = (String) pairs[i];
            switch (pairs[i + 1]) {
                case String text -> args.put(name, text);
                case Integer number -> args.put(name, number.intValue());
                case List<?> list -> args.put(name, (List<String>) list);
                default -> throw new IllegalArgumentException(name);
            }
        }

        return args;
    }

    public static OrderInstance order(String id, OrderArgs args, Integer chapter) {
        return new OrderInstance(Catalog.get(id), args, chapter);
    }

    public static OrderInstance order(String id, OrderArgs args) {
        return order(id, args, null);
    }

    /** A small data set to build a test world from. A file left out is absent. */
    public static final class Data {
        JsonNode meta;
        JsonNode regions;
        JsonNode entrances;
        JsonNode locations;
        JsonNode classes;
        JsonNode bosses;
        JsonNode merchants;
        JsonNode milestones;
        JsonNode weapons;

        public Data meta(String text) {
            meta = json(text);
            return this;
        }

        public Data regions(String text) {
            regions = json(text);
            return this;
        }

        public Data entrances(String text) {
            entrances = json(text);
            return this;
        }

        public Data locations(String text) {
            locations = json(text);
            return this;
        }

        public Data classes(String text) {
            classes = json(text);
            return this;
        }

        public Data bosses(String text) {
            bosses = json(text);
            return this;
        }

        public Data merchants(String text) {
            merchants = json(text);
            return this;
        }

        public Data milestones(String text) {
            milestones = json(text);
            return this;
        }

        public Data weapons(String text) {
            weapons = json(text);
            return this;
        }

        public RawDataSet raw() {
            return new RawDataSet(meta, regions, entrances, locations, classes, bosses, merchants, milestones, weapons, null, null, null, null);
        }

        public World world() {
            return WorldParser.parse(raw());
        }
    }

    private static Path findRoot() {
        for (var dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            if (Files.exists(dir.resolve("data").resolve("ds1").resolve("meta.json"))) return dir;
        }

        throw new IllegalStateException("repository root not found");
    }
}
