package com.renanabade.darksouls.server.auth;

import com.renanabade.darksouls.server.Ids;
import com.renanabade.darksouls.server.config.ApiErrors;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Accounts with an email and a password. No email is sent yet, so there is no confirmation and no password reset. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private static final int MIN_PASSWORD_LENGTH = 6;

    /** BCrypt reads no further than this. */
    private static final int MAX_PASSWORD_BYTES = 72;

    private static final int MAX_EMAIL_LENGTH = 256;

    /** A real hash to compare against when the email is unknown, so an unknown email takes as long as a wrong password. */
    private final String decoyHash;

    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final TokenService tokens;

    public record Credentials(String email, String password) {}

    public record RefreshRequest(String refreshToken) {}

    public AuthController(UserRepository users, PasswordEncoder passwords, TokenService tokens) {
        this.users = users;
        this.passwords = passwords;
        this.tokens = tokens;
        decoyHash = passwords.encode("not a password anyone has");
    }

    @PostMapping("/register")
    ResponseEntity<Object> register(@RequestBody Credentials credentials) {
        var email = credentials.email() == null ? "" : credentials.email().strip();
        var password = credentials.password() == null ? "" : credentials.password();
        Map<String, List<String>> errors = new LinkedHashMap<>();
        if (!isEmail(email)) errors.put("InvalidEmail", List.of("Email '" + email + "' is invalid."));
        addPasswordProblems(password, errors);
        if (errors.isEmpty() && users.existsByNormalizedEmail(AppUser.normalize(email))) {
            errors.put("DuplicateEmail", List.of("Email '" + email + "' is already taken."));
        }

        if (!errors.isEmpty()) return ApiErrors.validation(errors);
        try {
            users.save(new AppUser(Ids.next(), email, passwords.encode(password), Instant.now()));
        } catch (DataIntegrityViolationException sameEmailAtOnce) {
            return ApiErrors.validation("DuplicateEmail", "Email '" + email + "' is already taken.");
        }

        return ResponseEntity.ok().build();
    }

    @PostMapping("/login")
    ResponseEntity<TokenService.Tokens> login(@RequestBody Credentials credentials) {
        var email = credentials.email() == null ? "" : credentials.email();
        var password = credentials.password() == null ? "" : credentials.password();
        var user = users.findByNormalizedEmail(AppUser.normalize(email));
        var matches = passwords.matches(password, user.map(AppUser::passwordHash).orElse(decoyHash));
        return user.isPresent() && matches
                ? ResponseEntity.ok(tokens.issue(user.get().id()))
                : ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }

    @PostMapping("/refresh")
    ResponseEntity<TokenService.Tokens> refresh(@RequestBody RefreshRequest request) {
        var userId = request.refreshToken() == null ? null : tokens.userOfRefreshToken(request.refreshToken());
        return userId != null && users.existsById(userId)
                ? ResponseEntity.ok(tokens.issue(userId))
                : ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }

    private static boolean isEmail(String email) {
        var at = email.indexOf('@');
        return email.length() <= MAX_EMAIL_LENGTH && at > 0 && at == email.lastIndexOf('@') && at < email.length() - 1;
    }

    private static void addPasswordProblems(String password, Map<String, List<String>> errors) {
        if (password.length() < MIN_PASSWORD_LENGTH) {
            errors.put("PasswordTooShort", List.of("Passwords must be at least " + MIN_PASSWORD_LENGTH + " characters."));
        }

        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            errors.put("PasswordTooLong", List.of("Passwords can have at most " + MAX_PASSWORD_BYTES + " bytes."));
        }

        if (password.chars().allMatch(Character::isLetterOrDigit)) {
            errors.put("PasswordRequiresNonAlphanumeric", List.of("Passwords must have at least one non alphanumeric character."));
        }

        if (password.chars().noneMatch(c -> c >= '0' && c <= '9')) {
            errors.put("PasswordRequiresDigit", List.of("Passwords must have at least one digit ('0'-'9')."));
        }

        if (password.chars().noneMatch(c -> c >= 'a' && c <= 'z')) {
            errors.put("PasswordRequiresLower", List.of("Passwords must have at least one lowercase ('a'-'z')."));
        }

        if (password.chars().noneMatch(c -> c >= 'A' && c <= 'Z')) {
            errors.put("PasswordRequiresUpper", List.of("Passwords must have at least one uppercase ('A'-'Z')."));
        }
    }
}
