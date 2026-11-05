using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DarkSoulsChallenge.Core;
using DarkSoulsChallenge.Core.Generation;
using DarkSoulsChallenge.Core.Orders;
using DarkSoulsChallenge.Server.Data;
using DarkSoulsChallenge.Server.Generation;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace DarkSoulsChallenge.Server.Tests;

public sealed class ChallengeApiTests(ServerFixture server) : IAsyncLifetime
{
    private readonly HttpClient _client = server.CreateClient();

    public async ValueTask InitializeAsync() => await server.ClearJobsAsync();

    public ValueTask DisposeAsync()
    {
        _client.Dispose();
        return ValueTask.CompletedTask;
    }

    private async Task<JsonElement> ReadyJobAsync(object body)
    {
        var response = await _client.PostAsJsonAsync("/api/challenges", body, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var job = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        return await WaitForAsync(job.GetProperty("id").GetGuid());
    }

    private async Task<JsonElement> WaitForAsync(Guid id)
    {
        await server.Services.GetRequiredService<GenerationWorker>().RunNextJobAsync(TestContext.Current.CancellationToken);
        return await _client.GetFromJsonAsync<JsonElement>($"/api/jobs/{id}", TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task Reports_its_health()
    {
        var health = await _client.GetFromJsonAsync<JsonElement>("/api/health", TestContext.Current.CancellationToken);
        Assert.Equal("ok", health.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Hosts_the_site_and_answers_not_found_for_unknown_api_routes()
    {
        var page = await _client.GetAsync("/?c=ds1.8.07-0000000000", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        Assert.Contains("blazor.webassembly.js", await page.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync("/api/nothing", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task Offers_what_a_client_may_fix()
    {
        var options = await _client.GetFromJsonAsync<JsonElement>("/api/options", TestContext.Current.CancellationToken);
        Assert.Equal(10, options.GetProperty("classes").GetArrayLength());
        Assert.Equal("Bandit", options.GetProperty("classes")[0].GetProperty("name").GetString());
        Assert.Equal("easy", options.GetProperty("difficulties")[0].GetString());
        Assert.Equal("short", options.GetProperty("lengths")[0].GetString());
        Assert.Contains(options.GetProperty("gifts").EnumerateArray(), g => g.GetProperty("label").GetString() == "None");
    }

    [Fact]
    public async Task Generates_a_requested_challenge_in_the_background()
    {
        var job = await ReadyJobAsync(new { seed = "ashen-one", difficulty = "hard", length = "short", startingClass = "Thief" });
        Assert.Equal("done", job.GetProperty("status").GetString());
        var id = job.GetProperty("challengeId").GetGuid();
        var challenge = await _client.GetFromJsonAsync<JsonElement>($"/api/challenges/{id}", TestContext.Current.CancellationToken);
        Assert.Equal(job.GetProperty("code").GetString(), challenge.GetProperty("code").GetString());
        Assert.Equal("Thief", challenge.GetProperty("setup").GetProperty("startingClass").GetString());
        Assert.Contains(challenge.GetProperty("code").GetString()!, challenge.GetProperty("manual").GetString()!, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_code_reproduces_what_the_generator_draws()
    {
        var world = server.Services.GetRequiredService<World>();
        var config = new GeneratorConfig("777", Difficulty.Medium, Length.Short);
        var expected = Generator.Generate(world, config);
        var job = await ReadyJobAsync(new { code = expected.Code });
        var challenge = await _client.GetFromJsonAsync<JsonElement>($"/api/challenges/{job.GetProperty("challengeId").GetGuid()}", TestContext.Current.CancellationToken);
        Assert.Equal(Manual.Render(world, expected), challenge.GetProperty("manual").GetString());
        var byCode = await _client.GetFromJsonAsync<JsonElement>($"/api/challenges/by-code/{expected.Code.ToLowerInvariant()}", TestContext.Current.CancellationToken);
        Assert.Equal(expected.Code, byCode.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Stores_each_code_once_however_many_ask_for_it()
    {
        var first = await ReadyJobAsync(new { seed = "same", length = "short" });
        var second = await ReadyJobAsync(new { code = first.GetProperty("code").GetString()! });
        Assert.Equal(first.GetProperty("challengeId").GetGuid(), second.GetProperty("challengeId").GetGuid());
        Assert.Equal(first.GetProperty("id").GetGuid(), second.GetProperty("id").GetGuid());
        await server.WithDbAsync(async db => Assert.Equal(1, await db.Challenges.CountAsync(TestContext.Current.CancellationToken)));
    }

    [Theory]
    [InlineData("""{ "code": "not a code" }""", "this is not a challenge code")]
    [InlineData("""{ "code": "ds3.8.07-K3F9QX2M7T" }""", "another game")]
    [InlineData("""{ "code": "ds1.7.07-0000000000" }""", "generator 7")]
    [InlineData("""{ "startingClass": "Clown" }""", "unknown class")]
    [InlineData("""{ "giftRow": 1 }""", "unknown gift row")]
    [InlineData("""{ "levelCap": 800 }""", "at most 713")]
    public async Task Refuses_what_cannot_be_generated(string body, string problem)
    {
        using var content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
        var response = await _client.PostAsync("/api/challenges", content, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(problem, await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Answers_not_found_for_what_does_not_exist()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/jobs/{Guid.NewGuid()}", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync($"/api/challenges/{Guid.NewGuid()}", TestContext.Current.CancellationToken)).StatusCode);
    }

    // Two workers never take one job: the second skips the row the first has locked.
    [Fact]
    public async Task A_job_locked_by_one_worker_is_skipped_by_another()
    {
        var cancellation = TestContext.Current.CancellationToken;
        var job = new GenerationJob { Id = Guid.CreateVersion7(), Code = "ds1.8.07-0000000000", CreatedAt = DateTimeOffset.UtcNow, Status = JobStatus.Queued };
        await server.WithDbAsync(async db =>
        {
            db.Jobs.Add(job);
            await db.SaveChangesAsync(cancellation);
        });
        var worker = server.Services.GetRequiredService<GenerationWorker>();

        await using var scope = server.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await using (var holding = await db.Database.BeginTransactionAsync(cancellation))
        {
            await db.Jobs.FromSql($"""SELECT * FROM generation_jobs WHERE "Id" = {job.Id} FOR UPDATE""").AsNoTracking().ToListAsync(cancellation);
            Assert.False(await worker.RunNextJobAsync(cancellation));
            await holding.RollbackAsync(cancellation);
        }

        // A worker that dies gives its lock back, and the job is taken again.
        Assert.True(await worker.RunNextJobAsync(cancellation));
    }

    [Fact]
    public async Task The_background_worker_picks_up_what_is_queued()
    {
        var cancellation = TestContext.Current.CancellationToken;
        await using var running = server.WithWebHostBuilder(builder => builder.UseSetting("Generation:Background", "true"));
        using var client = running.CreateClient();
        var response = await client.PostAsJsonAsync("/api/challenges", new { seed = "in-the-background", length = "short" }, cancellation);
        var id = (await response.Content.ReadFromJsonAsync<JsonElement>(cancellation)).GetProperty("id").GetGuid();
        for (var i = 0; i < 300; i++)
        {
            var job = await client.GetFromJsonAsync<JsonElement>($"/api/jobs/{id}", cancellation);
            if (job.GetProperty("status").GetString() != "queued")
            {
                Assert.Equal("done", job.GetProperty("status").GetString());
                return;
            }

            await Task.Delay(100, cancellation);
        }

        Assert.Fail("the job never finished");
    }

    [Fact]
    public async Task A_job_that_cannot_generate_is_marked_failed()
    {
        var cancellation = TestContext.Current.CancellationToken;
        await server.WithDbAsync(async db =>
        {
            db.Jobs.Add(new GenerationJob { Id = Guid.CreateVersion7(), Code = "bad code", CreatedAt = DateTimeOffset.UtcNow, Status = JobStatus.Queued });
            await db.SaveChangesAsync(cancellation);
        });
        var worker = server.Services.GetRequiredService<GenerationWorker>();
        await worker.RunNextJobAsync(cancellation);
        await server.WithDbAsync(async db =>
        {
            var job = await db.Jobs.FirstAsync(j => j.Code == "bad code", cancellation);
            Assert.Equal(JobStatus.Failed, job.Status);
            Assert.Equal("this is not a challenge code", job.Error);
        });
    }
}
