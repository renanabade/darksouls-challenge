package com.renanabade.darksouls.server.config;

import java.io.IOException;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/** Hosts the site. An address the site's router owns (/ranking, /account) gets index.html; an unknown /api one does not. */
@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final String site;

    public WebConfig(@Value("${site.location:classpath:/static/}") String site) {
        this.site = site;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations(site)
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String path, Resource location) throws IOException {
                        var found = location.createRelative(path);
                        if (found.exists() && found.isReadable() && !path.isEmpty()) return found;
                        if (path.startsWith("api/") || path.equals("api") || path.contains(".")) return null;
                        var page = location.createRelative("index.html");
                        return page.exists() ? page : null;
                    }
                });
    }
}
