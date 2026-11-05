using DarkSoulsChallenge.Core;
using DarkSoulsChallenge.Core.Generation;
using DarkSoulsChallenge.Core.Orders;
using DarkSoulsChallenge.Server.Data;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace DarkSoulsChallenge.Server.Generation;

/// <summary>A solo challenge to store: a code, or the settings to make one from. Settings left out are drawn by the seed.</summary>
public sealed record CreateChallengeRequest(
    string? Code = null,
    string? Seed = null,
    Difficulty Difficulty = Difficulty.Medium,
    Length Length = Length.Full,
    Curve? Curve = null,
    string? StartingClass = null,
    int? GiftRow = null,
    int? LevelCap = null);

public sealed record JobResponse(Guid Id, string Code, string Status, Guid? ChallengeId, string? Error);

public static class ChallengeEndpoints
{
    public const string RateLimitPolicy = "generation";

    public static void MapChallengeEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api");
        api.MapGet("/options", (World world) => SetupOptions.Of(world));
        api.MapPost("/challenges", CreateAsync).RequireRateLimiting(RateLimitPolicy);
        api.MapGet("/jobs/{id:guid}", GetJobAsync);
        api.MapGet("/challenges/{id:guid}", GetChallengeAsync);
        api.MapGet("/challenges/by-code/{code}", GetChallengeByCodeAsync);
    }

    /// <summary>
    /// Stores a challenge, generating it when no one asked for that code before. The answer is the job to watch; a job already
    /// done means the challenge is ready.
    /// </summary>
    private static async Task<Results<Accepted<JobResponse>, ValidationProblem>> CreateAsync(
        CreateChallengeRequest request,
        World world,
        AppDbContext db,
        GenerationSignal signal,
        CancellationToken cancellationToken)
    {
        if (CodeOf(world, request) is not { } code)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["request"] = [ProblemOf(world, request)],
            });
        }

        var existing = await db.Challenges.Where(c => c.Code == code).Select(c => (Guid?)c.Id).FirstOrDefaultAsync(cancellationToken);
        var job = await db.Jobs.FirstOrDefaultAsync(j => j.Code == code && j.Status != JobStatus.Failed, cancellationToken);
        if (job is null)
        {
            job = new GenerationJob
            {
                Id = Guid.CreateVersion7(),
                Code = code,
                Status = existing is null ? JobStatus.Queued : JobStatus.Done,
                ChallengeId = existing,
                CreatedAt = DateTimeOffset.UtcNow,
            };
            db.Jobs.Add(job);
            await db.SaveChangesAsync(cancellationToken);
            signal.Notify();
        }

        return TypedResults.Accepted($"/api/jobs/{job.Id}", ToResponse(job));
    }

    private static async Task<Results<Ok<JobResponse>, NotFound>> GetJobAsync(Guid id, AppDbContext db, CancellationToken cancellationToken) =>
        await db.Jobs.FirstOrDefaultAsync(j => j.Id == id, cancellationToken) is { } job
            ? TypedResults.Ok(ToResponse(job))
            : TypedResults.NotFound();

    private static async Task<IResult> GetChallengeAsync(Guid id, AppDbContext db, CancellationToken cancellationToken)
    {
        var document = await db.Challenges.Where(c => c.Id == id).Select(c => c.Document).FirstOrDefaultAsync(cancellationToken);
        return document is null ? Results.NotFound() : Results.Text(document, "application/json");
    }

    private static async Task<IResult> GetChallengeByCodeAsync(string code, World world, AppDbContext db, CancellationToken cancellationToken)
    {
        if (!ChallengeCode.TryDecode(world, code, out var decoded, out _)) return Results.NotFound();
        var canonical = ChallengeCode.Encode(world, decoded!.Config);
        var document = await db.Challenges.Where(c => c.Code == canonical).Select(c => c.Document).FirstOrDefaultAsync(cancellationToken);
        return document is null ? Results.NotFound() : Results.Text(document, "application/json");
    }

    private static JobResponse ToResponse(GenerationJob job) =>
        new(job.Id, job.Code, job.Status.ToString().ToLowerInvariant(), job.ChallengeId, job.Error);

    /// <summary>The canonical code a request stands for, or null when it cannot be generated here.</summary>
    private static string? CodeOf(World world, CreateChallengeRequest request) =>
        ProblemOf(world, request).Length == 0 ? ChallengeCode.Encode(world, ConfigOf(world, request)) : null;

    private static GeneratorConfig ConfigOf(World world, CreateChallengeRequest request)
    {
        if (request.Code is not null)
        {
            ChallengeCode.TryDecode(world, request.Code, out var decoded, out _);
            return decoded!.Config;
        }

        return new GeneratorConfig(request.Seed?.Trim() ?? GenerationRequest.DrawSeed(), request.Difficulty, request.Length)
        {
            Curve = request.Curve,
            StartingClass = request.StartingClass?.Trim(),
            GiftRow = request.GiftRow,
            LevelCap = request.LevelCap,
        };
    }

    private static string ProblemOf(World world, CreateChallengeRequest request)
    {
        if (request.Code is not null)
        {
            if (!ChallengeCode.TryDecode(world, request.Code, out var decoded, out var problem)) return problem ?? "";
            return decoded!.IsCurrent
                ? ""
                : $"this code was made by generator {decoded.GeneratorVersion} and data {decoded.DataVersion}, and gives another challenge now";
        }

        var problems = new GenerationRequest
        {
            Seed = request.Seed,
            StartingClass = request.StartingClass,
            GiftRow = request.GiftRow,
            LevelCap = request.LevelCap,
        }.Problems();
        if (problems.Count > 0) return string.Join("; ", problems);
        if (request.StartingClass is { } name && !world.Classes.ContainsKey(name.Trim())) return $"unknown class \"{name}\"";
        if (request.GiftRow is { } row && world.Gifts.All(g => g.Row != row)) return $"unknown gift row {row}";
        return "";
    }
}
