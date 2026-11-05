using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using DarkSoulsChallenge.Server.Generation;
using Microsoft.Extensions.DependencyInjection;

namespace DarkSoulsChallenge.Server.Tests;

public sealed class RankingApiTests(ServerFixture server) : IAsyncLifetime
{
    private const string Password = "Praise-the-Sun-1";

    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await server.ClearJobsAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    /// <summary>A signed-in client for a new player.</summary>
    private async Task<HttpClient> PlayerAsync(string? displayName = null)
    {
        var client = server.CreateClient();
        var email = $"{Guid.NewGuid():N}@example.test";
        var registered = await client.PostAsJsonAsync("/api/auth/register", new { email, password = Password }, Cancellation);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password }, Cancellation);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var tokens = await login.Content.ReadFromJsonAsync<JsonElement>(Cancellation);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.GetProperty("accessToken").GetString());
        if (displayName is not null)
        {
            var named = await client.PutAsJsonAsync("/api/me", new { displayName }, Cancellation);
            Assert.Equal(HttpStatusCode.OK, named.StatusCode);
        }

        return client;
    }

    private async Task<Guid> ChallengeAsync(string seed)
    {
        using var client = server.CreateClient();
        var response = await client.PostAsJsonAsync("/api/challenges", new { seed, length = "short" }, Cancellation);
        var id = (await response.Content.ReadFromJsonAsync<JsonElement>(Cancellation)).GetProperty("id").GetGuid();
        await server.Services.GetRequiredService<GenerationWorker>().RunNextJobAsync(Cancellation);
        var job = await client.GetFromJsonAsync<JsonElement>($"/api/jobs/{id}", Cancellation);
        return job.GetProperty("challengeId").GetGuid();
    }

    private static Task<HttpResponseMessage> SubmitAsync(HttpClient client, Guid challengeId, int deaths = 3, string? proofUrl = null) =>
        client.PutAsJsonAsync("/api/runs", new { challengeId, deaths, proofUrl }, Cancellation);

    [Fact]
    public async Task Needs_a_login_for_what_is_personal()
    {
        using var anonymous = server.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/me", Cancellation)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await SubmitAsync(anonymous, Guid.NewGuid())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/api/ranking", Cancellation)).StatusCode);
    }

    [Fact]
    public async Task Refuses_a_wrong_password()
    {
        using var client = server.CreateClient();
        var email = $"{Guid.NewGuid():N}@example.test";
        await client.PostAsJsonAsync("/api/auth/register", new { email, password = Password }, Cancellation);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "wrong" }, Cancellation);
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
    }

    [Theory]
    [InlineData("ab")]
    [InlineData("<script>")]
    [InlineData("a name that is much too long to be shown")]
    public async Task Refuses_a_bad_display_name(string displayName)
    {
        using var player = await PlayerAsync();
        var response = await player.PutAsJsonAsync("/api/me", new { displayName }, Cancellation);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Keeps_display_names_unique()
    {
        var name = $"Solaire {Guid.NewGuid():N}"[..20];
        using var first = await PlayerAsync(name);
        using var second = await PlayerAsync();
        Assert.Equal(HttpStatusCode.Conflict, (await second.PutAsJsonAsync("/api/me", new { displayName = name }, Cancellation)).StatusCode);

        // Asking again for your own name is not a conflict.
        Assert.Equal(HttpStatusCode.OK, (await first.PutAsJsonAsync("/api/me", new { displayName = name }, Cancellation)).StatusCode);
    }

    [Fact]
    public async Task Needs_a_display_name_and_a_real_challenge_to_record_a_run()
    {
        var challenge = await ChallengeAsync("nameless");
        using var nameless = await PlayerAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await SubmitAsync(nameless, challenge)).StatusCode);
        using var named = await PlayerAsync($"Oscar {Guid.NewGuid():N}"[..20]);
        Assert.Equal(HttpStatusCode.NotFound, (await SubmitAsync(named, Guid.NewGuid())).StatusCode);
    }

    [Theory]
    [InlineData(-1, null)]
    [InlineData(0, "http://example.test/video")]
    [InlineData(0, "javascript:alert(1)")]
    [InlineData(0, "not a link")]
    public async Task Refuses_a_bad_run(int deaths, string? proofUrl)
    {
        var challenge = await ChallengeAsync("bad-run");
        using var player = await PlayerAsync($"Siegmeyer {Guid.NewGuid():N}"[..20]);
        Assert.Equal(HttpStatusCode.BadRequest, (await SubmitAsync(player, challenge, deaths, proofUrl)).StatusCode);
    }

    [Fact]
    public async Task Ranks_players_by_the_score_of_what_they_finished()
    {
        var one = await ChallengeAsync("rank-1");
        var two = await ChallengeAsync("rank-2");
        var (leaderName, otherName) = ($"Leader {Guid.NewGuid():N}"[..20], $"Other {Guid.NewGuid():N}"[..20]);
        using var leader = await PlayerAsync(leaderName);
        using var other = await PlayerAsync(otherName);
        Assert.Equal(HttpStatusCode.OK, (await SubmitAsync(leader, one)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SubmitAsync(leader, two, 0, "https://example.test/run")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SubmitAsync(other, one)).StatusCode);

        using var anonymous = server.CreateClient();
        var ranking = await anonymous.GetFromJsonAsync<JsonElement>("/api/ranking", Cancellation);
        var entries = ranking.GetProperty("entries").EnumerateArray().ToList();
        Assert.Equal(2, ranking.GetProperty("total").GetInt32());
        Assert.Equal(leaderName, entries[0].GetProperty("displayName").GetString());
        Assert.Equal(1, entries[0].GetProperty("rank").GetInt32());
        Assert.Equal(2, entries[0].GetProperty("runs").GetInt32());
        Assert.Equal(otherName, entries[1].GetProperty("displayName").GetString());
        Assert.True(entries[0].GetProperty("score").GetInt32() > entries[1].GetProperty("score").GetInt32());

        var runs = await anonymous.GetFromJsonAsync<JsonElement>($"/api/challenges/{one}/runs", Cancellation);
        Assert.Equal(2, runs.GetArrayLength());
    }

    [Fact]
    public async Task Shows_no_email_in_public()
    {
        var challenge = await ChallengeAsync("private");
        using var player = await PlayerAsync($"Laurentius {Guid.NewGuid():N}"[..20]);
        await SubmitAsync(player, challenge);
        using var anonymous = server.CreateClient();
        Assert.DoesNotContain("example.test", await anonymous.GetStringAsync("/api/ranking", Cancellation), StringComparison.Ordinal);
        Assert.DoesNotContain("@", await anonymous.GetStringAsync($"/api/challenges/{challenge}/runs", Cancellation), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Counts_a_challenge_once_and_lets_a_player_correct_or_remove_it()
    {
        var challenge = await ChallengeAsync("once");
        using var player = await PlayerAsync($"Patches {Guid.NewGuid():N}"[..20]);
        await SubmitAsync(player, challenge, 9);
        var corrected = await SubmitAsync(player, challenge, 2);
        Assert.Equal(2, (await corrected.Content.ReadFromJsonAsync<JsonElement>(Cancellation)).GetProperty("deaths").GetInt32());
        var mine = await player.GetFromJsonAsync<JsonElement>("/api/me/runs", Cancellation);
        Assert.Equal(1, mine.GetArrayLength());

        Assert.Equal(HttpStatusCode.NoContent, (await player.DeleteAsync($"/api/runs/{challenge}", Cancellation)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await player.DeleteAsync($"/api/runs/{challenge}", Cancellation)).StatusCode);
        Assert.Equal(0, (await player.GetFromJsonAsync<JsonElement>("/api/me/runs", Cancellation)).GetArrayLength());
    }

    [Fact]
    public async Task Pages_the_ranking()
    {
        var challenge = await ChallengeAsync("pages");
        for (var i = 0; i < 3; i++)
        {
            using var player = await PlayerAsync($"Page{i} {Guid.NewGuid():N}"[..20]);
            await SubmitAsync(player, challenge);
        }

        using var anonymous = server.CreateClient();
        var page = await anonymous.GetFromJsonAsync<JsonElement>("/api/ranking?offset=1&limit=1", Cancellation);
        Assert.Equal(3, page.GetProperty("total").GetInt32());
        Assert.Equal(2, page.GetProperty("entries")[0].GetProperty("rank").GetInt32());
        Assert.Equal(1, page.GetProperty("entries").GetArrayLength());
    }
}
