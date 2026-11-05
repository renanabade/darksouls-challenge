namespace DarkSoulsChallenge.Core.Generation;

/// <summary>
/// A seeded pseudo-random generator, so that the same seed always gives the same challenge on every machine and
/// runtime (System.Random promises neither). sfc32 (Chris Doty-Humphrey's Small Fast Counter), seeded by four salted
/// FNV-1a hashes of the seed text.
/// </summary>
public sealed class SeededRandom
{
    private uint _a;
    private uint _b;
    private uint _c;
    private uint _d;

    public SeededRandom(string seed)
    {
        ArgumentNullException.ThrowIfNull(seed);
        _a = Fnv1a($"1:{seed}");
        _b = Fnv1a($"2:{seed}");
        _c = Fnv1a($"3:{seed}");
        _d = Fnv1a($"4:{seed}");
        for (var i = 0; i < 15; i++)
        {
            Next(); // mix the state before use
        }
    }

    /// <summary>A float in [0, 1).</summary>
    public double Next()
    {
        unchecked
        {
            var t = _a + _b + _d;
            _d += 1;
            _a = _b ^ (_b >> 9);
            _b = _c + (_c << 3);
            _c = (_c << 21) | (_c >> 11);
            _c += t;
            return t / 4294967296.0;
        }
    }

    /// <summary>An integer in [min, max].</summary>
    public int NextInt(int min, int max) => min + (int)Math.Floor(Next() * (max - min + 1));

    public T Pick<T>(IReadOnlyList<T> list)
    {
        ArgumentNullException.ThrowIfNull(list);
        var index = (int)Math.Floor(Next() * list.Count);
        return index < list.Count ? list[index] : throw new ArgumentException("pick from an empty list", nameof(list));
    }

    /// <summary>A shuffled copy (Fisher-Yates). Sort the input first: its order is part of the result.</summary>
    public List<T> Shuffle<T>(IEnumerable<T> list)
    {
        var shuffled = list.ToList();
        for (var i = shuffled.Count - 1; i > 0; i--)
        {
            var j = (int)Math.Floor(Next() * (i + 1));
            (shuffled[i], shuffled[j]) = (shuffled[j], shuffled[i]);
        }

        return shuffled;
    }

    /// <summary>
    /// A shuffled copy where items of larger weight tend to come first (Efraimidis-Spirakis: each item gets the key
    /// u^(1/weight) and the list is sorted by key, descending, keeping ties in order). Weights must be positive.
    /// </summary>
    public List<T> WeightedShuffle<T>(IEnumerable<T> list, Func<T, double> weight)
    {
        var keyed = new List<(T Item, double Key)>();
        foreach (var item in list)
        {
            keyed.Add((item, Math.Pow(Next(), 1 / weight(item))));
        }

        return keyed.OrderByDescending(k => k.Key).Select(k => k.Item).ToList();
    }

    private static uint Fnv1a(string text)
    {
        var hash = 0x811c9dc5;
        foreach (var unit in text)
        {
            hash ^= unit;
            hash = unchecked(hash * 0x01000193);
        }

        return hash;
    }
}
