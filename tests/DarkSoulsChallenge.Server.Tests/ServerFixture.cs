using DarkSoulsChallenge.Server.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

[assembly: AssemblyFixture(typeof(DarkSoulsChallenge.Server.Tests.ServerFixture))]

namespace DarkSoulsChallenge.Server.Tests;

/// <summary>
/// The whole server on a real PostgreSQL: the job queue depends on its row locks, so a fake would not test it. The server
/// comes from TEST_POSTGRES, a connection string to a server where a database can be created (CI runs one as a service).
/// </summary>
public sealed class ServerFixture : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly string _admin = Environment.GetEnvironmentVariable("TEST_POSTGRES")
        ?? "Host=127.0.0.1;Port=5432;Username=postgres;Password=postgres";

    private readonly string _database = $"darksouls_test_{Guid.NewGuid():N}";

    public string ConnectionString => new NpgsqlConnectionStringBuilder(_admin) { Database = _database }.ConnectionString;

    public async ValueTask InitializeAsync()
    {
        await using var connection = new NpgsqlConnection(_admin);
        await connection.OpenAsync();
        await using var create = new NpgsqlCommand($"""CREATE DATABASE "{_database}" """, connection);
        await create.ExecuteNonQueryAsync();
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        NpgsqlConnection.ClearAllPools();
        await using var connection = new NpgsqlConnection(_admin);
        await connection.OpenAsync();
        await using var drop = new NpgsqlCommand($"""DROP DATABASE IF EXISTS "{_database}" WITH (FORCE)""", connection);
        await drop.ExecuteNonQueryAsync();
        GC.SuppressFinalize(this);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default", ConnectionString);
        builder.UseSetting("RateLimits:GenerationPerMinute", "100000");

        // The tests run the worker's steps themselves, so nothing races them. One test turns it back on.
        builder.UseSetting("Generation:Background", "false");
    }

    public async Task WithDbAsync(Func<AppDbContext, Task> action)
    {
        await using var scope = Services.CreateAsyncScope();
        await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public Task ClearJobsAsync() => WithDbAsync(async db =>
    {
        await db.Runs.ExecuteDeleteAsync();
        await db.Jobs.ExecuteDeleteAsync();
        await db.Challenges.ExecuteDeleteAsync();
    });
}
