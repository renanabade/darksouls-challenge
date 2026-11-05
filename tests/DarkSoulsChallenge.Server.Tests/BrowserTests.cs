using DarkSoulsChallenge.Core;
using DarkSoulsChallenge.Core.Generation;
using DarkSoulsChallenge.Core.Orders;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using OpenQA.Selenium;
using OpenQA.Selenium.Chrome;
using OpenQA.Selenium.Support.UI;

namespace DarkSoulsChallenge.Server.Tests;

/// <summary>
/// The whole thing in a real browser, against a real server: the core on WebAssembly must draw what it draws natively, or
/// a shared code would mean different challenges. Runs when TEST_BROWSER is set, as in CI.
/// </summary>
public sealed class BrowserTests(ServerFixture server) : IAsyncLifetime
{
    private static readonly TimeSpan Patience = TimeSpan.FromSeconds(90);

    private readonly WebApplicationFactory<Program> _host = server.WithWebHostBuilder(builder => builder.UseSetting("Generation:Background", "true"));
    private ChromeDriver? _driver;

    private ChromeDriver Driver => _driver ?? throw new InvalidOperationException("the browser did not start");

    public ValueTask InitializeAsync()
    {
        if (Environment.GetEnvironmentVariable("TEST_BROWSER") is null) return ValueTask.CompletedTask;
        _host.UseKestrel(0);
        _host.StartServer();
        var options = new ChromeOptions();
        options.AddArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1200,1000");
        _driver = new ChromeDriver(options);
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        _driver?.Quit();
        _driver?.Dispose();
        await _host.DisposeAsync();
    }

    private string Url(string path) => new Uri(_host.ClientOptions.BaseAddress, path).ToString();

    private IWebElement Wait(By by) => new WebDriverWait(Driver, Patience).Until(d =>
    {
        var found = d.FindElements(by);
        return found.Count > 0 && found[0].Displayed ? found[0] : null;
    })!;

    private void WaitForText(By by, string text) =>
        new WebDriverWait(Driver, Patience).Until(d => d.FindElements(by).Any(e => e.Text.Contains(text, StringComparison.Ordinal)));

    private void Type(string id, string text)
    {
        var input = Wait(By.Id(id));
        input.Clear();
        input.SendKeys(text);
        input.SendKeys(Keys.Tab);
    }

    private void Click(string label) =>
        Driver.FindElements(By.TagName("button")).First(b => b.Text.Equals(label, StringComparison.OrdinalIgnoreCase)).Click();

    private static void RequireBrowser() =>
        Assert.SkipWhen(Environment.GetEnvironmentVariable("TEST_BROWSER") is null, "TEST_BROWSER is not set");

    [Theory]
    [InlineData("browser-short", Difficulty.Hard, Length.Short)]
    [InlineData("browser-full", Difficulty.Easy, Length.Full)]
    public void Draws_in_the_browser_exactly_what_it_draws_natively(string seed, Difficulty difficulty, Length length)
    {
        RequireBrowser();
        var world = server.Services.GetRequiredService<World>();
        var challenge = Generator.Generate(world, new GeneratorConfig(seed, difficulty, length));
        var view = Manual.Describe(world, challenge);
        var expected = view.Journey.Concat(view.Chapters.SelectMany(c => c.Rules)).Select(r => r.Text).ToList();

        Driver.Navigate().GoToUrl(Url(ChallengeLink.QueryOf(challenge.Code)));

        Assert.Equal(challenge.Code, Wait(By.ClassName("code")).GetAttribute("textContent"));
        var drawn = Driver.FindElements(By.ClassName("rule-text")).Select(e => e.GetAttribute("textContent")).ToList();
        Assert.Equal<string?>(expected, drawn);
    }

    [Fact]
    public void Signs_up_records_a_run_and_shows_it_on_the_ranking()
    {
        RequireBrowser();
        var name = $"Player {Guid.NewGuid():N}"[..20];
        Driver.Navigate().GoToUrl(Url("account"));
        Type("email", $"{Guid.NewGuid():N}@example.test");
        Type("password", "Praise-the-Sun-1");
        Click("Create account");
        Type("name", name);
        Click("Save name");
        WaitForText(By.ClassName("saved"), "Saved");
        Wait(By.CssSelector("a[href='ranking']")).Click();
        Wait(By.ClassName("page-title"));
        Wait(By.CssSelector("a[href='']")).Click();

        // Generate draws a new challenge, in the same tab, so the sign-in holds.
        new SelectElement(Wait(By.Id("length"))).SelectByText("Short");
        Click("Generate");
        Wait(By.ClassName("code"));
        Type("deaths", "4");
        Click("I followed every order");
        WaitForText(By.ClassName("record"), $"Recorded for {name}");

        Driver.Navigate().GoToUrl(Url("ranking"));
        WaitForText(By.ClassName("data-table"), name);
    }
}
