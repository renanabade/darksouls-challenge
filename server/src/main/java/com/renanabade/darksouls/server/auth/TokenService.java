package com.renanabade.darksouls.server.auth;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

/**
 * Signs and reads the tokens: short-lived access tokens, and refresh tokens that get a new pair. The two are told apart by a claim,
 * so a refresh token never opens the API, and an access token never renews itself. The key comes from the environment, so a restart
 * signs nobody out.
 */
@Configuration
public class TokenService {
    public static final Duration ACCESS_LIFETIME = Duration.ofHours(1);
    public static final Duration REFRESH_LIFETIME = Duration.ofDays(14);

    private static final String USE = "use";
    private static final String ACCESS = "access";
    private static final String REFRESH = "refresh";
    private static final int MIN_SECRET_BYTES = 32;

    private final SecretKey key;

    public TokenService(@Value("${app.jwt.secret}") String secret) {
        var bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("app.jwt.secret (JWT_SECRET) must have at least " + MIN_SECRET_BYTES + " bytes");
        }

        key = new SecretKeySpec(bytes, "HmacSHA256");
    }

    /** What the login endpoint answers. */
    public record Tokens(String tokenType, String accessToken, long expiresIn, String refreshToken) {}

    @Bean
    JwtEncoder jwtEncoder() {
        return new NimbusJwtEncoder(new ImmutableSecret<>(key));
    }

    /** The decoder that guards the API: it takes access tokens only. */
    @Bean
    JwtDecoder jwtDecoder() {
        return decoder(ACCESS);
    }

    private NimbusJwtDecoder decoder(String use) {
        var decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        OAuth2TokenValidator<Jwt> ofThisUse = jwt -> use.equals(jwt.getClaimAsString(USE))
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "this token is not for this", null));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), ofThisUse));
        return decoder;
    }

    public Tokens issue(UUID userId) {
        var encoder = jwtEncoder();
        return new Tokens(
                "Bearer",
                sign(encoder, userId, ACCESS, ACCESS_LIFETIME),
                ACCESS_LIFETIME.toSeconds(),
                sign(encoder, userId, REFRESH, REFRESH_LIFETIME));
    }

    /** The user a refresh token belongs to, or null when it is not a valid refresh token. */
    public UUID userOfRefreshToken(String token) {
        try {
            return UUID.fromString(decoder(REFRESH).decode(token).getSubject());
        } catch (JwtException | IllegalArgumentException invalid) {
            return null;
        }
    }

    private static String sign(JwtEncoder encoder, UUID userId, String use, Duration lifetime) {
        var now = Instant.now();
        var claims = JwtClaimsSet.builder()
                .subject(userId.toString())
                .issuedAt(now)
                .expiresAt(now.plus(lifetime))
                .claim(USE, use)
                .build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
}
