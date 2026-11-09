package com.renanabade.darksouls.server.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Fixed windows of one minute per address, in memory: enough for one process. More instances would each have their own limits,
 * which is acceptable until there are more instances. Behind a trusted proxy, the address comes from the header it is told to read.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RateLimitFilter extends OncePerRequestFilter {
    private static final long WINDOW_MILLIS = 60_000;

    private record Window(long start, int count) {}

    private final ConcurrentMap<String, Window> windows = new ConcurrentHashMap<>();
    private final int authPerMinute;
    private final int generationPerMinute;
    private final int previewPerMinute;
    private final String clientHeader;

    public RateLimitFilter(
            @Value("${rate-limits.auth-per-minute}") int authPerMinute,
            @Value("${rate-limits.generation-per-minute}") int generationPerMinute,
            @Value("${rate-limits.preview-per-minute}") int previewPerMinute,
            @Value("${rate-limits.client-header:}") String clientHeader) {
        this.authPerMinute = authPerMinute;
        this.generationPerMinute = generationPerMinute;
        this.previewPerMinute = previewPerMinute;
        this.clientHeader = clientHeader;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var path = request.getRequestURI();
        if (path.startsWith("/api/auth/") && !allowed("auth|", request, authPerMinute)
                || path.equals("/api/challenges") && request.getMethod().equals("POST") && !allowed("generation|", request, generationPerMinute)
                || path.equals("/api/previews") && !allowed("preview|", request, previewPerMinute)) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            return;
        }

        chain.doFilter(request, response);
    }

    private String addressOf(HttpServletRequest request) {
        var forwarded = clientHeader.isEmpty() ? null : request.getHeader(clientHeader);
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.strip();
    }

    private boolean allowed(String policy, HttpServletRequest request, int limit) {
        var now = System.currentTimeMillis();
        var window = windows.compute(policy + addressOf(request), (key, current) ->
                current == null || now - current.start() >= WINDOW_MILLIS
                        ? new Window(now, 1)
                        : new Window(current.start(), current.count() + 1));

        // Windows of addresses that went away would pile up otherwise.
        if (windows.size() > 10_000) windows.values().removeIf(w -> now - w.start() >= WINDOW_MILLIS);
        return window.count() <= limit;
    }
}
