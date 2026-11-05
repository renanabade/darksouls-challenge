using System.Security.Claims;
using DarkSoulsChallenge.Core.Api;
using DarkSoulsChallenge.Server.Data;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace DarkSoulsChallenge.Server.Ranking;

/// <summary>
/// Profiles, runs and the ranking. A run is the player's own word (ADR 0015): the server checks only that the challenge is
/// real, and takes its score from what it generated, never from the client.
/// </summary>
public static class RankingEndpoints
{
    private const int MaxDeaths = 100_000;
    private const int MaxPageSize = 100;

    public static void MapRankingEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api");
        api.MapGet("/ranking", GetRankingAsync);
        api.MapGet("/challenges/{id:guid}/runs", GetChallengeRunsAsync);

        var me = api.MapGroup("/me").RequireAuthorization();
        me.MapGet("/", GetProfileAsync);
        me.MapPut("/", UpdateProfileAsync);
        me.MapGet("/runs", GetMyRunsAsync);

        var runs = api.MapGroup("/runs").RequireAuthorization();
        runs.MapPut("/", SubmitRunAsync);
        runs.MapDelete("/{challengeId:guid}", DeleteRunAsync);
    }

    private static string UserIdOf(ClaimsPrincipal user) =>
        user.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new InvalidOperationException("an authorized request has no user id");

    private static ValidationProblem Problem(string key, string message) =>
        TypedResults.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });

    private static async Task<Results<Ok<ProfileResponse>, UnauthorizedHttpResult>> GetProfileAsync(
        ClaimsPrincipal principal,
        UserManager<AppUser> users)
    {
        var user = await users.GetUserAsync(principal);
        return user is null ? TypedResults.Unauthorized() : TypedResults.Ok(new ProfileResponse(user.Email ?? "", user.DisplayName));
    }

    private static async Task<Results<Ok<ProfileResponse>, ValidationProblem, Conflict<string>, UnauthorizedHttpResult>> UpdateProfileAsync(
        UpdateProfileRequest request,
        ClaimsPrincipal principal,
        UserManager<AppUser> users,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var name = request.DisplayName?.Trim() ?? "";
        if (name.Length is < 3 or > AppUser.MaxDisplayNameLength
            || !name.All(c => char.IsAsciiLetterOrDigit(c) || c is ' ' or '-' or '_'))
        {
            return Problem("displayName", $"a name has 3 to {AppUser.MaxDisplayNameLength} letters, digits, spaces, hyphens or underscores");
        }

        var user = await users.GetUserAsync(principal);
        if (user is null) return TypedResults.Unauthorized();
        var taken = await db.Users.AnyAsync(u => u.DisplayName == name && u.Id != user.Id, cancellationToken);
        if (taken) return TypedResults.Conflict("that name is taken");
        user.DisplayName = name;
        var result = await users.UpdateAsync(user);

        // Two players asking for one name at once: the unique index decides.
        return result.Succeeded
            ? TypedResults.Ok(new ProfileResponse(user.Email ?? "", user.DisplayName))
            : TypedResults.Conflict("that name is taken");
    }

    /// <summary>Records a finished challenge, or corrects the player's own earlier record of it.</summary>
    private static async Task<Results<Ok<RunResponse>, ValidationProblem, NotFound<string>>> SubmitRunAsync(
        SubmitRunRequest request,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        if (request.Deaths is < 0 or > MaxDeaths) return Problem("deaths", $"deaths must be from 0 to {MaxDeaths}");
        var proof = string.IsNullOrWhiteSpace(request.ProofUrl) ? null : request.ProofUrl.Trim();
        if (proof is not null
            && (proof.Length > RunRecord.MaxProofUrlLength
                || !Uri.TryCreate(proof, UriKind.Absolute, out var uri)
                || uri.Scheme != Uri.UriSchemeHttps))
        {
            return Problem("proofUrl", "the proof must be an https link");
        }

        var userId = UserIdOf(principal);
        var name = await db.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstOrDefaultAsync(cancellationToken);
        if (name is null) return Problem("displayName", "choose a display name before recording a run");
        var challenge = await db.Challenges
            .Where(c => c.Id == request.ChallengeId)
            .Select(c => new { c.Code, c.Score })
            .FirstOrDefaultAsync(cancellationToken);
        if (challenge is null) return TypedResults.NotFound("that challenge does not exist");

        var run = await db.Runs.FirstOrDefaultAsync(r => r.UserId == userId && r.ChallengeId == request.ChallengeId, cancellationToken);
        if (run is null)
        {
            run = new RunRecord { Id = Guid.CreateVersion7(), UserId = userId, ChallengeId = request.ChallengeId, FinishedAt = DateTimeOffset.UtcNow };
            db.Runs.Add(run);
        }

        run.Deaths = request.Deaths;
        run.ProofUrl = proof;
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(new RunResponse(request.ChallengeId, challenge.Code, name, challenge.Score, run.Deaths, run.ProofUrl, run.FinishedAt));
    }

    private static async Task<Results<NoContent, NotFound>> DeleteRunAsync(
        Guid challengeId,
        ClaimsPrincipal principal,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var userId = UserIdOf(principal);
        var deleted = await db.Runs.Where(r => r.UserId == userId && r.ChallengeId == challengeId).ExecuteDeleteAsync(cancellationToken);
        return deleted > 0 ? TypedResults.NoContent() : TypedResults.NotFound();
    }

    private static async Task<List<RunResponse>> GetMyRunsAsync(ClaimsPrincipal principal, AppDbContext db, CancellationToken cancellationToken)
    {
        var userId = UserIdOf(principal);
        return await RunsOf(db.Runs.Where(r => r.UserId == userId), cancellationToken);
    }

    private static async Task<List<RunResponse>> GetChallengeRunsAsync(Guid id, AppDbContext db, CancellationToken cancellationToken) =>
        await RunsOf(db.Runs.Where(r => r.ChallengeId == id), cancellationToken);

    private static Task<List<RunResponse>> RunsOf(IQueryable<RunRecord> runs, CancellationToken cancellationToken) => runs
        .OrderByDescending(r => r.FinishedAt)
        .Take(MaxPageSize)
        .Select(r => new RunResponse(r.ChallengeId, r.Challenge!.Code, r.User!.DisplayName ?? "", r.Challenge.Score, r.Deaths, r.ProofUrl, r.FinishedAt))
        .ToListAsync(cancellationToken);

    /// <summary>Players by the score of everything they finished. Ties go to whoever got there first.</summary>
    private static async Task<RankingPage> GetRankingAsync(AppDbContext db, int? offset, int? limit, CancellationToken cancellationToken)
    {
        var skip = Math.Max(0, offset ?? 0);
        var take = Math.Clamp(limit ?? 50, 1, MaxPageSize);
        var totals = db.Runs.GroupBy(r => r.UserId).Select(g => new
        {
            UserId = g.Key,
            Score = g.Sum(r => r.Challenge!.Score),
            Runs = g.Count(),
            Last = g.Max(r => r.FinishedAt),
        });
        var total = await totals.CountAsync(cancellationToken);
        var rows = await totals
            .OrderByDescending(t => t.Score)
            .ThenBy(t => t.Last)
            .ThenBy(t => t.UserId)
            .Skip(skip)
            .Take(take)
            .Join(db.Users, t => t.UserId, u => u.Id, (t, u) => new { u.DisplayName, t.Score, t.Runs })
            .ToListAsync(cancellationToken);
        var entries = rows.Select((row, i) => new RankingEntry(skip + i + 1, row.DisplayName ?? "", row.Score, row.Runs)).ToList();
        return new RankingPage(entries, skip, total);
    }
}
