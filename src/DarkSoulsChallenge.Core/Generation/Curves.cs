using DarkSoulsChallenge.Core.Orders;

namespace DarkSoulsChallenge.Core.Generation;

/// <summary>
/// How difficulty moves across the chapters of a journey: the chosen difficulty is the level the curve moves around,
/// not the level of every chapter. Constant: every chapter at the chosen level. Rising: a step below it at the start, a
/// step above it at the end. Peaks: the chosen level, with one chapter in four two steps above it; at extreme, where
/// nothing is above, the peaks turn into valleys a step below. Rollercoaster: a step below, at or above it, the level
/// changing from chapter to chapter. Whatever the curve, the last chapter is never below the chosen level: the end of
/// the run is its climax.
/// </summary>
public enum Curve
{
    Constant,
    Rising,
    Peaks,
    Rollercoaster,
}

public static class Curves
{
    /// <summary>One peak per this many chapters after the first (two in a journey of nine).</summary>
    private const int ChaptersPerPeak = 4;

    public static IReadOnlyList<Curve> All { get; } = [Curve.Constant, Curve.Rising, Curve.Peaks, Curve.Rollercoaster];

    /// <summary>Easiest to hardest.</summary>
    public static IReadOnlyList<Difficulty> Difficulties { get; } =
        [Difficulty.Easy, Difficulty.Medium, Difficulty.Hard, Difficulty.Extreme];

    /// <summary>
    /// Each chapter's distance from the chosen difficulty, in steps. Kept apart from the difficulty so a group shares one
    /// curve: each player adds their own difficulty to the same offsets (a group's curve is drawn for its hardest player).
    /// </summary>
    public static IReadOnlyList<int> Offsets(Curve curve, int chapters, Difficulty difficulty, SeededRandom rng)
    {
        ArgumentNullException.ThrowIfNull(rng);
        switch (curve)
        {
            case Curve.Constant:
                return new int[chapters];
            case Curve.Rising:
                return Enumerable.Range(0, chapters)
                    .Select(k => chapters == 1 ? 0 : JsMath.Round(-1 + (2.0 * k / (chapters - 1))))
                    .ToList();
            case Curve.Peaks:
                {
                    var height = Shifted(difficulty, 1) == difficulty ? -1 : 2;

                    // Never the first chapter (the Asylum is a tutorial), and a valley never the last.
                    var places = Enumerable.Range(1, Math.Max(0, chapters - (height < 0 ? 2 : 1)));
                    var count = Math.Max(1, JsMath.Round((chapters - 1) / (double)ChaptersPerPeak));
                    var peaks = rng.Shuffle(places).Take(count).ToHashSet();
                    return Enumerable.Range(0, chapters).Select(k => peaks.Contains(k) ? height : 0).ToList();
                }

            case Curve.Rollercoaster:
                {
                    // The level changes, not just the offset: at easy or extreme two offsets give the same level.
                    var offsets = new List<int>();
                    for (var k = 0; k < chapters; k++)
                    {
                        int? previous = k > 0 ? offsets[k - 1] : null;
                        var allowed = new[] { -1, 0, 1 }.Where(o => k < chapters - 1 || o >= 0).ToList();
                        var changing = allowed
                            .Where(o => previous is not { } p || Shifted(difficulty, o) != Shifted(difficulty, p))
                            .ToList();
                        offsets.Add(rng.Pick(changing.Count > 0 ? changing : allowed.Where(o => o != previous).ToList()));
                    }

                    return offsets;
                }

            default:
                throw new ArgumentOutOfRangeException(nameof(curve));
        }
    }

    /// <summary>The difficulty a step offset away, held within easy and extreme.</summary>
    public static Difficulty Shifted(Difficulty difficulty, int offset) =>
        (Difficulty)Math.Clamp((int)difficulty + offset, (int)Difficulty.Easy, (int)Difficulty.Extreme);
}

/// <summary>What the challenges were first drawn with: halves round up, unlike <see cref="Math.Round(double)"/>.</summary>
internal static class JsMath
{
    public static int Round(double value) => (int)Math.Floor(value + 0.5);
}
