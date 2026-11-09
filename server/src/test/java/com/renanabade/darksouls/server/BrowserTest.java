package com.renanabade.darksouls.server;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.generation.ChallengeLink;
import com.renanabade.darksouls.core.generation.Generator;
import com.renanabade.darksouls.core.generation.GeneratorConfig;
import com.renanabade.darksouls.core.generation.Length;
import com.renanabade.darksouls.core.generation.Manual;
import com.renanabade.darksouls.core.generation.RuleView;
import com.renanabade.darksouls.core.orders.Difficulty;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.Select;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.TestPropertySource;

/**
 * The whole thing in a real browser, against a real server and the built site. Runs when TEST_BROWSER is set, as in CI; build web/ first.
 */
@EnabledIfEnvironmentVariable(named = "TEST_BROWSER", matches = ".+")
@TestPropertySource(properties = {"generation.background=true", "site.location=file:../web/dist/web/browser/"})
class BrowserTest extends ServerTest {
    private static final Duration PATIENCE = Duration.ofSeconds(90);

    @LocalServerPort
    private int port;

    @Autowired
    private World world;

    private ChromeDriver driver;

    @BeforeEach
    void openBrowser() {
        var options = new ChromeOptions();
        options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1200,1000");
        driver = new ChromeDriver(options);
    }

    @AfterEach
    void closeBrowser() {
        driver.quit();
    }

    private String url(String path) {
        return "http://localhost:" + port + "/" + path;
    }

    private WebElement waitFor(By by) {
        return new WebDriverWait(driver, PATIENCE).until(d -> {
            var found = d.findElements(by);
            return !found.isEmpty() && found.get(0).isDisplayed() ? found.get(0) : null;
        });
    }

    private void waitForText(By by, String text) {
        new WebDriverWait(driver, PATIENCE).until(d -> d.findElements(by).stream().anyMatch(e -> e.getText().contains(text)));
    }

    private void type(String id, String text) {
        var input = waitFor(By.id(id));
        input.clear();
        input.sendKeys(text);
        input.sendKeys(Keys.TAB);
    }

    private void click(String label) {
        driver.findElements(By.tagName("button")).stream()
                .filter(button -> button.getText().equalsIgnoreCase(label))
                .findFirst()
                .orElseThrow()
                .click();
    }

    @ParameterizedTest
    @CsvSource({"browser-short,HARD,SHORT", "browser-full,EASY,FULL"})
    void shows_in_the_browser_exactly_what_the_generator_draws(String seed, Difficulty difficulty, Length length) {
        var challenge = Generator.generate(world, new GeneratorConfig(seed, difficulty, length));
        var view = Manual.describe(world, challenge);
        List<String> expected = new ArrayList<>(view.journey().stream().map(RuleView::text).toList());
        view.chapters().forEach(chapter -> expected.addAll(chapter.rules().stream().map(RuleView::text).toList()));

        driver.get(url(ChallengeLink.queryOf(challenge.code())));

        assertEquals(challenge.code(), waitFor(By.className("code")).getAttribute("textContent"));
        var drawn = driver.findElements(By.className("rule-text")).stream().map(e -> e.getAttribute("textContent")).toList();
        assertEquals(expected, drawn);
    }

    private void capture(String name) throws java.io.IOException {
        driver.executeScript("document.querySelector('.sheet')?.scrollIntoView(); document.activeElement?.blur();");
        var image = driver.getScreenshotAs(org.openqa.selenium.OutputType.FILE);
        var target = java.nio.file.Path.of("../docs/screenshots", name + ".png");
        java.nio.file.Files.createDirectories(target.getParent());
        java.nio.file.Files.copy(image.toPath(), target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }

    /** Writes the README's screenshots, when TEST_SCREENSHOTS is set. */
    @Test
    @EnabledIfEnvironmentVariable(named = "TEST_SCREENSHOTS", matches = ".+")
    void takes_the_screenshots_of_the_readme() throws java.io.IOException {
        var challenge = Generator.generate(world, new GeneratorConfig("777", Difficulty.HARD, Length.FULL));
        for (var size : List.of(new int[] {1200, 1000}, new int[] {390, 844})) {
            var label = size[0] == 1200 ? "desktop" : "mobile";
            driver.manage().window().setSize(new org.openqa.selenium.Dimension(size[0], size[1]));
            driver.get(url(""));
            waitFor(By.id("class"));
            capture(label + "-empty");
            driver.get(url(ChallengeLink.queryOf(challenge.code())));
            waitFor(By.className("code"));
            capture(label + "-generated");
        }
    }

    @Test
    void a_link_in_any_other_form_becomes_the_one_link_of_its_challenge() {
        var code = Generator.generate(world, new GeneratorConfig("777", Difficulty.MEDIUM, Length.SHORT).withStartingClass("Thief")).code();

        driver.get(url("?seed=777&difficulty=medium&length=short&class=Thief&gift=1"));

        assertEquals(code, waitFor(By.className("code")).getAttribute("textContent"));
        waitForText(By.className("notice"), "gift");
        new WebDriverWait(driver, PATIENCE).until(d -> d.getCurrentUrl().endsWith("?c=" + code));
    }

    @Test
    void signs_up_records_a_run_and_shows_it_on_the_ranking() {
        var name = ("Player " + UUID.randomUUID().toString().replace("-", "")).substring(0, 20);
        driver.get(url("account"));
        type("email", UUID.randomUUID().toString().replace("-", "") + "@example.test");
        type("password", "Praise-the-Sun-1");
        click("Create account");
        type("name", name);
        click("Save name");
        waitForText(By.className("saved"), "Saved");
        waitFor(By.cssSelector("a[href='/ranking']")).click();
        waitFor(By.className("page-title"));
        waitFor(By.cssSelector(".nav a[href='/']")).click();

        // Generate draws a new challenge, in the same tab, so the sign-in holds.
        new Select(waitFor(By.id("length"))).selectByVisibleText("Short");
        click("Generate");
        waitFor(By.className("code"));
        type("deaths", "4");
        click("I followed every order");
        waitForText(By.className("record"), "Recorded for " + name);

        driver.get(url("ranking"));
        waitForText(By.className("data-table"), name);
    }
}
