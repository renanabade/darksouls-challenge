package com.renanabade.darksouls.core.generation;

import com.fasterxml.jackson.annotation.JsonInclude;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** The JSON shape of what leaves the core: camel case, no nulls, fields in the order they are declared. */
public final class CoreJson {
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .disable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY)
            .enable(SerializationFeature.INDENT_OUTPUT)
            .changeDefaultPropertyInclusion(inclusion -> inclusion.withValueInclusion(JsonInclude.Include.NON_NULL))
            .build();

    private CoreJson() {}

    public static String write(Object value) {
        return MAPPER.writeValueAsString(value);
    }
}
