using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using DarkSoulsChallenge.Core;
using DarkSoulsChallenge.Core.Generation;
using DarkSoulsChallenge.Core.Orders;
using DarkSoulsChallenge.Server.Data;
using DarkSoulsChallenge.Server.Generation;
using DarkSoulsChallenge.Server.Ranking;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.AddJsonConsole();

var dataDirectory = builder.Configuration["DataSet:Directory"] ?? Path.Combine(AppContext.BaseDirectory, "data", "ds1");
builder.Services.AddSingleton(WorldParser.Parse(RawDataSet.FromDirectory(dataDirectory)));

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    options.SerializerOptions.Converters.Add(new OrderArgsConverter());
    options.SerializerOptions.Converters.Add(new LowerCaseEnumConverter<Difficulty>());
    options.SerializerOptions.Converters.Add(new LowerCaseEnumConverter<Length>());
    options.SerializerOptions.Converters.Add(new LowerCaseEnumConverter<Curve>());
});

builder.Services.AddIdentityApiEndpoints<AppUser>(options => options.User.RequireUniqueEmail = true)
    .AddEntityFrameworkStores<AppDbContext>();
builder.Services.AddAuthorization();

builder.Services.AddProblemDetails();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(AuthRateLimitPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Configuration.GetValue("RateLimits:AuthPerMinute", 20),
            Window = TimeSpan.FromMinutes(1),
        }));
    options.AddPolicy(ChallengeEndpoints.RateLimitPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Configuration.GetValue("RateLimits:GenerationPerMinute", 30),
            Window = TimeSpan.FromMinutes(1),
        }));
});

builder.Services.AddSingleton<GenerationSignal>();
builder.Services.AddSingleton<GenerationWorker>();
if (builder.Configuration.GetValue("Generation:Background", true))
{
    builder.Services.AddHostedService(services => services.GetRequiredService<GenerationWorker>());
}

var app = builder.Build();

app.UseExceptionHandler();
app.UseBlazorFrameworkFiles();
app.UseStaticFiles();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

if (app.Configuration.GetValue("Database:MigrateOnStart", true))
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
}

app.MapGet("/api/health", async (AppDbContext db, CancellationToken cancellationToken) =>
    await db.Database.CanConnectAsync(cancellationToken)
        ? Results.Ok(new { status = "ok" })
        : Results.Problem("the database is unreachable", statusCode: StatusCodes.Status503ServiceUnavailable));
app.MapChallengeEndpoints();
app.MapRankingEndpoints();
app.MapGroup("/api/auth").RequireRateLimiting(AuthRateLimitPolicy).MapIdentityApi<AppUser>();
app.MapFallback("/api/{*rest}", () => Results.NotFound());
app.MapFallbackToFile("index.html");

await app.RunAsync();

/// <summary>The entry point, visible to the integration tests.</summary>
public partial class Program
{
    private const string AuthRateLimitPolicy = "auth";
}
