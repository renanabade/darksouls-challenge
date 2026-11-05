using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using DarkSoulsChallenge.Core.Api;
using Microsoft.JSInterop;

namespace DarkSoulsChallenge.Web.Services;

/// <summary>The API's JSON, generated at compile time, so it works trimmed in the browser.</summary>
[JsonSourceGenerationOptions(JsonSerializerDefaults.Web, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull, UseStringEnumConverter = true)]
[JsonSerializable(typeof(CreateChallengeRequest))]
[JsonSerializable(typeof(JobResponse))]
[JsonSerializable(typeof(ProfileResponse))]
[JsonSerializable(typeof(UpdateProfileRequest))]
[JsonSerializable(typeof(SubmitRunRequest))]
[JsonSerializable(typeof(RunResponse))]
[JsonSerializable(typeof(List<RunResponse>))]
[JsonSerializable(typeof(RankingPage))]
[JsonSerializable(typeof(Credentials))]
[JsonSerializable(typeof(RefreshRequest))]
[JsonSerializable(typeof(Tokens))]
internal sealed partial class ApiJsonContext : JsonSerializerContext;

internal sealed record Credentials(string Email, string Password);

internal sealed record RefreshRequest(string RefreshToken);

internal sealed record Tokens(string AccessToken, string RefreshToken);

/// <summary>What the server said was wrong, in words to show the player.</summary>
public sealed class ApiException(string message) : Exception(message);

/// <summary>
/// The server, for the parts that need one: accounts and the ranking. Generating never comes through here. The tokens stay in
/// the browser's localStorage, so a player stays signed in between visits.
/// </summary>
public sealed class ApiClient(HttpClient http, IJSRuntime js)
{
    private const string TokensKey = "tokens";
    private static readonly TimeSpan JobPollInterval = TimeSpan.FromMilliseconds(500);
    private const int JobPolls = 60;

    private Tokens? _tokens;
    private bool _restored;

    /// <summary>Fires when the player signs in or out, so the page can show it.</summary>
    public event Action? SignedInChanged;

    public async Task<bool> IsSignedInAsync()
    {
        await RestoreAsync();
        return _tokens is not null;
    }

    public async Task SignInAsync(string email, string password)
    {
        var response = await http.PostAsJsonAsync("api/auth/login", new Credentials(email, password), ApiJsonContext.Default.Credentials);
        if (response.StatusCode == HttpStatusCode.Unauthorized) throw new ApiException("That email and password do not match.");
        await EnsureAsync(response);
        await KeepAsync(await response.Content.ReadFromJsonAsync(ApiJsonContext.Default.Tokens));
    }

    public async Task RegisterAsync(string email, string password)
    {
        var response = await http.PostAsJsonAsync("api/auth/register", new Credentials(email, password), ApiJsonContext.Default.Credentials);
        await EnsureAsync(response);
        await SignInAsync(email, password);
    }

    public async Task SignOutAsync() => await KeepAsync(null);

    public Task<ProfileResponse?> GetProfileAsync() =>
        ReadAsync(() => new HttpRequestMessage(HttpMethod.Get, "api/me"), ApiJsonContext.Default.ProfileResponse);

    public Task<ProfileResponse?> SetDisplayNameAsync(string displayName) => ReadAsync(
        () => new HttpRequestMessage(HttpMethod.Put, "api/me") { Content = JsonContent.Create(new UpdateProfileRequest(displayName), ApiJsonContext.Default.UpdateProfileRequest) },
        ApiJsonContext.Default.ProfileResponse);

    public async Task<IReadOnlyList<RunResponse>> GetMyRunsAsync() =>
        await ReadAsync(() => new HttpRequestMessage(HttpMethod.Get, "api/me/runs"), ApiJsonContext.Default.ListRunResponse) ?? [];

    public async Task DeleteRunAsync(Guid challengeId)
    {
        using var response = await SendAsync(() => new HttpRequestMessage(HttpMethod.Delete, $"api/runs/{challengeId}"));
        await EnsureAsync(response);
    }

    public async Task<RankingPage> GetRankingAsync(int offset, int limit)
    {
        var page = await http.GetFromJsonAsync($"api/ranking?offset={offset}&limit={limit}", ApiJsonContext.Default.RankingPage);
        return page ?? new RankingPage([], offset, 0);
    }

    /// <summary>Records a finished challenge: the server first generates its own copy of it, then takes the player's word.</summary>
    public async Task<RunResponse?> SubmitRunAsync(string code, int deaths, string? proofUrl)
    {
        var challengeId = await StoreChallengeAsync(code);
        return await ReadAsync(
            () => new HttpRequestMessage(HttpMethod.Put, "api/runs") { Content = JsonContent.Create(new SubmitRunRequest(challengeId, deaths, proofUrl), ApiJsonContext.Default.SubmitRunRequest) },
            ApiJsonContext.Default.RunResponse);
    }

    private async Task<Guid> StoreChallengeAsync(string code)
    {
        var response = await http.PostAsJsonAsync("api/challenges", new CreateChallengeRequest(code), ApiJsonContext.Default.CreateChallengeRequest);
        await EnsureAsync(response);
        var job = await response.Content.ReadFromJsonAsync(ApiJsonContext.Default.JobResponse);
        for (var poll = 0; poll < JobPolls && job?.Status == "queued"; poll++)
        {
            await Task.Delay(JobPollInterval);
            job = await http.GetFromJsonAsync($"api/jobs/{job.Id}", ApiJsonContext.Default.JobResponse);
        }

        return job?.ChallengeId ?? throw new ApiException(job?.Error ?? "The server took too long with this challenge. Try again.");
    }

    private async Task<T?> ReadAsync<T>(Func<HttpRequestMessage> request, System.Text.Json.Serialization.Metadata.JsonTypeInfo<T> type)
    {
        using var response = await SendAsync(request);
        await EnsureAsync(response);
        return await response.Content.ReadFromJsonAsync(type);
    }

    /// <summary>Sends with the access token, and once more with a fresh one if it has expired.</summary>
    private async Task<HttpResponseMessage> SendAsync(Func<HttpRequestMessage> request)
    {
        await RestoreAsync();
        var response = await SendWithTokenAsync(request);
        if (response.StatusCode != HttpStatusCode.Unauthorized || _tokens is null) return response;

        response.Dispose();
        var refreshed = await http.PostAsJsonAsync("api/auth/refresh", new RefreshRequest(_tokens.RefreshToken), ApiJsonContext.Default.RefreshRequest);
        if (!refreshed.IsSuccessStatusCode)
        {
            await KeepAsync(null);
            throw new ApiException("You have been signed out. Sign in again.");
        }

        await KeepAsync(await refreshed.Content.ReadFromJsonAsync(ApiJsonContext.Default.Tokens));
        return await SendWithTokenAsync(request);
    }

    private async Task<HttpResponseMessage> SendWithTokenAsync(Func<HttpRequestMessage> request)
    {
        using var message = request();
        if (_tokens is not null) message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _tokens.AccessToken);
        return await http.SendAsync(message);
    }

    private async Task RestoreAsync()
    {
        if (_restored) return;
        _restored = true;
        var stored = await js.InvokeAsync<string?>("localStorage.getItem", TokensKey);
        if (stored is null) return;
        try
        {
            _tokens = JsonSerializer.Deserialize(stored, ApiJsonContext.Default.Tokens);
        }
        catch (JsonException)
        {
            await js.InvokeVoidAsync("localStorage.removeItem", TokensKey);
        }
    }

    private async Task KeepAsync(Tokens? tokens)
    {
        _restored = true;
        _tokens = tokens;
        if (tokens is null) await js.InvokeVoidAsync("localStorage.removeItem", TokensKey);
        else await js.InvokeVoidAsync("localStorage.setItem", TokensKey, JsonSerializer.Serialize(tokens, ApiJsonContext.Default.Tokens));
        SignedInChanged?.Invoke();
    }

    private static async Task EnsureAsync(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode) return;
        var body = await response.Content.ReadAsStringAsync();
        throw new ApiException(MessageOf(response.StatusCode, body));
    }

    private static string MessageOf(HttpStatusCode status, string body)
    {
        if (status == HttpStatusCode.TooManyRequests) return "Too many requests. Wait a minute and try again.";
        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            if (root.ValueKind == JsonValueKind.String) return root.GetString() ?? "";
            if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("errors", out var errors))
            {
                var messages = errors.EnumerateObject().SelectMany(e => e.Value.EnumerateArray()).Select(m => m.GetString());
                return string.Join(" ", messages);
            }
        }
        catch (JsonException)
        {
            // Not JSON: not something to show.
        }

        return status == HttpStatusCode.NotFound
            ? "The server could not find that."
            : "The server is not answering as it should. Try again later.";
    }
}
