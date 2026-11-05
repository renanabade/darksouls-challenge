using System.Text.Json;
using DarkSoulsChallenge.Core;
using DarkSoulsChallenge.Core.Generation;
using DarkSoulsChallenge.Server.Data;
using Microsoft.EntityFrameworkCore;

namespace DarkSoulsChallenge.Server.Generation;

/// <summary>Wakes the worker when a job is queued, so it does not wait for its next look at the table.</summary>
public sealed class GenerationSignal : IDisposable
{
    private readonly SemaphoreSlim _pending = new(0);

    public void Notify() => _pending.Release();

    public Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken) =>
        _pending.WaitAsync(timeout, cancellationToken);

    public void Dispose() => _pending.Dispose();
}

/// <summary>
/// Generates queued challenges. A job is taken with FOR UPDATE SKIP LOCKED inside a transaction that lasts as long as the
/// work: if the process dies, the lock goes with it and the job is queued again. No broker to run, and no state a crash can
/// leave behind (ADR 0014).
/// </summary>
public sealed partial class GenerationWorker(
    IServiceScopeFactory scopes,
    World world,
    GenerationSignal signal,
    ILogger<GenerationWorker> logger) : BackgroundService
{
    /// <summary>How often the table is checked without a signal: for jobs left by a process that died.</summary>
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                while (await RunNextJobAsync(stoppingToken))
                {
                }

                await signal.WaitAsync(PollInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception error) when (error is DbUpdateException or Npgsql.NpgsqlException or InvalidOperationException)
            {
                // The database is away, or a job could not be saved: its lock is gone, so it will be taken again.
                LogLoopFailed(logger, error);
                await Task.Delay(PollInterval, stoppingToken);
            }
        }
    }

    /// <summary>Runs one queued job, if there is any. Returns whether there was one.</summary>
    public async Task<bool> RunNextJobAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var queued = nameof(JobStatus.Queued);
        var taken = await db.Jobs
            .FromSql($"""SELECT * FROM generation_jobs WHERE "Status" = {queued} ORDER BY "CreatedAt" LIMIT 1 FOR UPDATE SKIP LOCKED""")
            .ToListAsync(cancellationToken);
        if (taken.Count == 0) return false;
        var job = taken[0];

        try
        {
            var existing = await db.Challenges.Where(c => c.Code == job.Code).Select(c => (Guid?)c.Id).FirstOrDefaultAsync(cancellationToken);
            job.ChallengeId = existing ?? Generate(db, job.Code);
            job.Status = JobStatus.Done;
        }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException)
        {
            job.Status = JobStatus.Failed;
            job.Error = error.Message;
            LogJobFailed(logger, job.Code, error);
        }

        job.FinishedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    private Guid Generate(AppDbContext db, string code)
    {
        if (!ChallengeCode.TryDecode(world, code, out var decoded, out var problem)) throw new ArgumentException(problem);
        var challenge = Generator.Generate(world, decoded!.Config);
        var record = new ChallengeRecord
        {
            Id = Guid.CreateVersion7(),
            Code = code,
            DataVersion = challenge.DataVersion,
            GeneratorVersion = Generator.Version,
            Score = ChallengeScore.Of(challenge),
            Document = JsonSerializer.Serialize(ChallengeDocument.From(world, challenge), CoreJsonContext.Default.ChallengeDocument),
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.Challenges.Add(record);
        return record.Id;
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "The generation loop failed")]
    private static partial void LogLoopFailed(ILogger logger, Exception error);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not generate {Code}")]
    private static partial void LogJobFailed(ILogger logger, string code, Exception error);
}
