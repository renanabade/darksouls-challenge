package com.renanabade.darksouls.server.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

/** A player's account. The email signs in and stays private; the display name is what the ranking shows. */
@Entity
@Table(name = "users")
public class AppUser {
    public static final int MAX_DISPLAY_NAME_LENGTH = 32;

    @Id
    private UUID id;

    private String email;

    @Column(name = "normalized_email")
    private String normalizedEmail;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "display_name")
    private String displayName;

    @Column(name = "created_at")
    private Instant createdAt;

    protected AppUser() {}

    public AppUser(UUID id, String email, String passwordHash, Instant createdAt) {
        this.id = id;
        this.email = email;
        this.normalizedEmail = normalize(email);
        this.passwordHash = passwordHash;
        this.createdAt = createdAt;
    }

    public static String normalize(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }

    public UUID id() {
        return id;
    }

    public String email() {
        return email;
    }

    public String passwordHash() {
        return passwordHash;
    }

    public String displayName() {
        return displayName;
    }

    public void setDisplayName(String name) {
        displayName = name;
    }
}
