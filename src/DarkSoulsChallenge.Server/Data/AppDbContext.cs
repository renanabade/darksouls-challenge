using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace DarkSoulsChallenge.Server.Data;

/// <summary>A player's account. The email signs in and stays private; the display name is what the ranking shows.</summary>
public sealed class AppUser : IdentityUser
{
    public const int MaxDisplayNameLength = 32;

    public string? DisplayName { get; set; }
}

/// <summary>A generated challenge, stored once per code. The document is what clients read; it is never queried inside.</summary>
public sealed class ChallengeRecord
{
    public const int MaxCodeLength = 64;

    public Guid Id { get; set; }

    public required string Code { get; set; }

    public required string DataVersion { get; set; }

    public required string GeneratorVersion { get; set; }

    /// <summary>What finishing it is worth on the ranking.</summary>
    public int Score { get; set; }

    public required string Document { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

public enum JobStatus
{
    Queued,
    Done,
    Failed,
}

/// <summary>A challenge to generate. Workers take jobs with FOR UPDATE SKIP LOCKED (ADR 0014).</summary>
public sealed class GenerationJob
{
    public Guid Id { get; set; }

    public required string Code { get; set; }

    public JobStatus Status { get; set; }

    public Guid? ChallengeId { get; set; }

    public string? Error { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? FinishedAt { get; set; }
}

/// <summary>A player's word that they finished a challenge. One per player and challenge.</summary>
public sealed class RunRecord
{
    public const int MaxProofUrlLength = 300;

    public Guid Id { get; set; }

    public required string UserId { get; set; }

    public AppUser? User { get; set; }

    public Guid ChallengeId { get; set; }

    public ChallengeRecord? Challenge { get; set; }

    public int Deaths { get; set; }

    public string? ProofUrl { get; set; }

    public DateTimeOffset FinishedAt { get; set; }
}

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<AppUser, IdentityRole, string>(options)
{
    public DbSet<ChallengeRecord> Challenges => Set<ChallengeRecord>();

    public DbSet<GenerationJob> Jobs => Set<GenerationJob>();

    public DbSet<RunRecord> Runs => Set<RunRecord>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<AppUser>(user =>
        {
            user.Property(u => u.DisplayName).HasMaxLength(AppUser.MaxDisplayNameLength);
            user.HasIndex(u => u.DisplayName).IsUnique();
        });

        builder.Entity<ChallengeRecord>(challenge =>
        {
            challenge.ToTable("challenges");
            challenge.Property(c => c.Code).HasMaxLength(ChallengeRecord.MaxCodeLength);
            challenge.HasIndex(c => c.Code).IsUnique();
            challenge.Property(c => c.Document).HasColumnType("jsonb");
        });

        builder.Entity<GenerationJob>(job =>
        {
            job.ToTable("generation_jobs");
            job.Property(j => j.Code).HasMaxLength(ChallengeRecord.MaxCodeLength);
            job.Property(j => j.Status).HasConversion<string>().HasMaxLength(16);
            job.HasIndex(j => new { j.Status, j.CreatedAt });
        });

        builder.Entity<RunRecord>(run =>
        {
            run.ToTable("runs");
            run.Property(r => r.ProofUrl).HasMaxLength(RunRecord.MaxProofUrlLength);
            run.HasIndex(r => new { r.UserId, r.ChallengeId }).IsUnique();
            run.HasIndex(r => r.ChallengeId);
        });
    }
}
