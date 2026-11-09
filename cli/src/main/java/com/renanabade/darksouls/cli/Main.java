package com.renanabade.darksouls.cli;

import com.renanabade.darksouls.core.RawDataSet;
import com.renanabade.darksouls.core.World;
import com.renanabade.darksouls.core.WorldParseException;
import com.renanabade.darksouls.core.WorldParser;
import com.renanabade.darksouls.core.generation.ChallengeDocument;
import com.renanabade.darksouls.core.generation.CoreJson;
import com.renanabade.darksouls.core.generation.Curve;
import com.renanabade.darksouls.core.generation.GenerationRequest;
import com.renanabade.darksouls.core.generation.Length;
import com.renanabade.darksouls.core.orders.Difficulty;
import java.io.PrintStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.stream.Collectors;
import picocli.CommandLine;
import picocli.CommandLine.Command;
import picocli.CommandLine.Option;

/**
 * Generates a static challenge and prints its manual (Markdown, or JSON with --json).
 *
 * <pre>
 *   java -jar darksouls-challenge.jar --seed ashen-one --difficulty medium --length epic --curve rising
 *   java -jar darksouls-challenge.jar --seed ashen-one --class Knight --gift 2406 --level-cap 30 --json
 *   java -jar darksouls-challenge.jar --seed ashen-one --players easy,hard
 *   java -jar darksouls-challenge.jar --code ds1.8.07-K39ZA00001
 * </pre>
 *
 * Without --seed or --code, a seed is drawn. The manual prints the code, so the challenge can be shared.
 */
@Command(name = "darksouls-challenge", description = "Generates a Dark Souls challenge.", mixinStandardHelpOptions = true)
public final class Main implements Callable<Integer> {
    @Option(names = "--code", description = "A challenge code: reproduces that challenge exactly, whatever the other settings.")
    String code;

    @Option(names = "--seed", description = "Same seed and settings, same challenge. Drawn when absent.")
    String seed;

    @Option(names = "--difficulty", defaultValue = "medium", description = "easy, medium, hard or extreme.")
    Difficulty difficulty;

    @Option(names = "--players", description = "One difficulty per player, comma separated: a challenge for a group, with handicap.")
    String players;

    @Option(names = "--length", defaultValue = "full", description = "short, full or epic.")
    Length length;

    @Option(names = "--curve", description = "constant, rising, peaks or rollercoaster. Drawn when absent.")
    Curve curve;

    @Option(names = "--class", description = "Starting class. Drawn when absent.")
    String startingClass;

    @Option(names = "--gift", description = "Starting gift, by row. Drawn when absent.")
    Integer gift;

    @Option(names = "--level-cap", description = "Soul level cap. Drawn when absent.")
    Integer levelCap;

    @Option(names = "--data", description = "Directory of the data set. Defaults to the one inside this program.")
    Path data;

    @Option(names = "--json", description = "Print JSON instead of the manual.")
    boolean json;

    private final PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);

    public static void main(String[] args) {
        System.exit(new CommandLine(new Main()).setCaseInsensitiveEnumValuesAllowed(true).execute(args));
    }

    @Override
    public Integer call() {
        try {
            World world = WorldParser.parse(data != null ? RawDataSet.fromDirectory(data) : RawDataSet.embedded());
            var request = new GenerationRequest(
                    code,
                    seed,
                    players == null ? List.of(difficulty) : parsePlayers(players),
                    length,
                    curve,
                    startingClass,
                    gift,
                    levelCap);
            var problems = request.problems();
            if (!problems.isEmpty()) throw new IllegalArgumentException(String.join("\n", problems));

            var documents = request.run(world);
            if (json) {
                out.println(CoreJson.write(players == null ? documents.get(0) : documents));
            } else {
                out.print(documents.stream().map(ChallengeDocument::manual).collect(Collectors.joining("\n---\n\n")));
            }

            out.flush();
            return 0;
        } catch (IllegalArgumentException | IllegalStateException | WorldParseException | UncheckedIOException error) {
            System.err.println(error.getMessage());
            return 1;
        }
    }

    private static List<Difficulty> parsePlayers(String list) {
        return Arrays.stream(list.split("[ ,]+")).filter(name -> !name.isEmpty()).map(Difficulty::named).toList();
    }
}
