using DarkSoulsChallenge.Core.Generation;
using DarkSoulsChallenge.Core.Orders;

namespace DarkSoulsChallenge.Core.Api;

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

public sealed record ProfileResponse(string Email, string? DisplayName);

public sealed record UpdateProfileRequest(string DisplayName);

/// <summary>A player's word that they finished a challenge.</summary>
public sealed record SubmitRunRequest(Guid ChallengeId, int Deaths, string? ProofUrl = null);

public sealed record RunResponse(Guid ChallengeId, string Code, string DisplayName, int Score, int Deaths, string? ProofUrl, DateTimeOffset FinishedAt);

public sealed record RankingEntry(int Rank, string DisplayName, int Score, int Runs);

public sealed record RankingPage(IReadOnlyList<RankingEntry> Entries, int Offset, int Total);
