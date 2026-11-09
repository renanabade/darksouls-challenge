package com.renanabade.darksouls.server.config;

import com.renanabade.darksouls.core.RawDataSet;
import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.WorldParser;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** The world is parsed once at startup: it is static and small, so it lives in memory. A bad data set stops the server. */
@Configuration
public class WorldConfig {
    @Bean
    World world(@Value("${data-set.directory:}") String directory) {
        return WorldParser.parse(directory.isEmpty() ? RawDataSet.embedded() : RawDataSet.fromDirectory(Path.of(directory)));
    }
}
