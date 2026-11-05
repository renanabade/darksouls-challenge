using System.Text.Json;

namespace DarkSoulsChallenge.Core;

/// <summary>
/// A condition on an edge of the world graph (data/ds1/SCHEMA.md): a constant, an item or milestone held,
/// a region already reached, or a combination of those.
/// </summary>
public abstract record Requirement
{
    public sealed record Constant(bool Value) : Requirement;

    public sealed record Has(string Item) : Requirement;

    public sealed record Region(string Id) : Requirement;

    public sealed record All(IReadOnlyList<Requirement> Children) : Requirement;

    public sealed record Any(IReadOnlyList<Requirement> Children) : Requirement;

    public static readonly Requirement True = new Constant(true);

    /// <summary>Evaluates the expression against what the player holds and has reached.</summary>
    public bool Evaluate(Func<string, bool> has, Func<string, bool> reached) => this switch
    {
        Constant c => c.Value,
        Has h => has(h.Item),
        Region r => reached(r.Id),
        All a => a.Children.All(child => child.Evaluate(has, reached)),
        Any a => a.Children.Any(child => child.Evaluate(has, reached)),
        _ => throw new InvalidOperationException($"unknown requirement {GetType().Name}"),
    };

    /// <summary>Every item the expression mentions, in first-seen order.</summary>
    public IReadOnlyList<string> Items()
    {
        var items = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        Visit(this, has: item =>
        {
            if (seen.Add(item)) items.Add(item);
        }, region: _ => { });
        return items;
    }

    /// <summary>Every region the expression mentions, in first-seen order.</summary>
    public IReadOnlyList<string> Regions()
    {
        var regions = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        Visit(this, has: _ => { }, region: id =>
        {
            if (seen.Add(id)) regions.Add(id);
        });
        return regions;
    }

    /// <summary>
    /// Reads an expression from JSON, or throws with the path of the first bad node. The data set is generated,
    /// but it crosses a process boundary, so it is checked once on load.
    /// </summary>
    public static Requirement Parse(JsonElement value, string path = "$")
    {
        if (value.ValueKind == JsonValueKind.True) return new Constant(true);
        if (value.ValueKind == JsonValueKind.False) return new Constant(false);
        if (value.ValueKind != JsonValueKind.Object)
        {
            throw new RequirementParseException("expected a boolean or an object", path);
        }

        var properties = value.EnumerateObject().ToList();
        if (properties.Count != 1)
        {
            throw new RequirementParseException($"expected exactly one key, got {properties.Count}", path);
        }

        var property = properties[0];
        var key = property.Name;
        var inner = property.Value;
        switch (key)
        {
            case "has":
            case "region":
                if (inner.ValueKind != JsonValueKind.String || inner.GetString() is not { Length: > 0 } text)
                {
                    throw new RequirementParseException($"\"{key}\" must be a non-empty string", $"{path}.{key}");
                }

                return key == "has" ? new Has(text) : new Region(text);
            case "all":
            case "any":
                if (inner.ValueKind != JsonValueKind.Array || inner.GetArrayLength() == 0)
                {
                    throw new RequirementParseException($"\"{key}\" must be a non-empty array", $"{path}.{key}");
                }

                var children = inner.EnumerateArray()
                    .Select((child, i) => Parse(child, $"{path}.{key}[{i}]"))
                    .ToList();
                return key == "all" ? new All(children) : new Any(children);
            default:
                throw new RequirementParseException($"unknown key \"{key}\"", path);
        }
    }

    private static void Visit(Requirement requirement, Action<string> has, Action<string> region)
    {
        switch (requirement)
        {
            case Has h:
                has(h.Item);
                break;
            case Region r:
                region(r.Id);
                break;
            case All a:
                foreach (var child in a.Children) Visit(child, has, region);
                break;
            case Any a:
                foreach (var child in a.Children) Visit(child, has, region);
                break;
        }
    }
}

public sealed class RequirementParseException(string message, string path) : Exception($"{message} at {path}")
{
    public string Path { get; } = path;
}
