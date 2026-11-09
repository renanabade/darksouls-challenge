package com.renanabade.darksouls.core;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Function;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The parsed JSON of each data set file, still untrusted. A null file means it is absent: small test worlds need no
 * milestones, weapons or area names.
 */
public record RawDataSet(
        JsonNode meta,
        JsonNode regions,
        JsonNode entrances,
        JsonNode locations,
        JsonNode classes,
        JsonNode bosses,
        JsonNode merchants,
        JsonNode milestones,
        JsonNode weapons,
        JsonNode spells,
        JsonNode areas,
        JsonNode treasures,
        JsonNode warnings) {
    /** The files of a data set, without their .json extension. */
    public static final List<String> FILES = List.of(
            "meta", "regions", "entrances", "locations", "classes", "bosses", "merchants",
            "milestones", "weapons", "spells", "areas", "treasures", "warnings");

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    /** Builds the data set from the text of each file, given by name (see {@link #FILES}). */
    public static RawDataSet fromText(Function<String, String> read) {
        Function<String, JsonNode> parse = file -> MAPPER.readTree(read.apply(file));
        return new RawDataSet(
                parse.apply("meta"),
                parse.apply("regions"),
                parse.apply("entrances"),
                parse.apply("locations"),
                parse.apply("classes"),
                parse.apply("bosses"),
                parse.apply("merchants"),
                parse.apply("milestones"),
                parse.apply("weapons"),
                parse.apply("spells"),
                parse.apply("areas"),
                parse.apply("treasures"),
                parse.apply("warnings"));
    }

    /** Builds the data set from a directory holding its files. */
    public static RawDataSet fromDirectory(Path directory) {
        return fromText(file -> {
            try {
                return Files.readString(directory.resolve(file + ".json"), StandardCharsets.UTF_8);
            } catch (IOException error) {
                throw new UncheckedIOException(error);
            }
        });
    }

    /** The data set that travels in the core's jar. */
    public static RawDataSet embedded() {
        return fromText(file -> {
            try (var stream = RawDataSet.class.getResourceAsStream("/data/ds1/" + file + ".json")) {
                if (stream == null) throw new IllegalStateException("the data file \"" + file + "\" is not embedded");
                return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            } catch (IOException error) {
                throw new UncheckedIOException(error);
            }
        });
    }
}
