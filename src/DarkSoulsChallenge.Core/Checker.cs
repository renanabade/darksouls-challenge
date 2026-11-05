using System.Text.Json;

namespace DarkSoulsChallenge.Core;

/// <summary>
/// Reads untrusted JSON field by field. Collects every problem instead of stopping at the first, so one pipeline
/// run can fix them all; each reader returns a harmless default after a failure. A null element means the field is
/// absent, which is not the same as a JSON null.
/// </summary>
internal sealed class Checker
{
    public static readonly JsonElement NoFields = EmptyObject();

    public List<string> Problems { get; } = [];

    public void Fail(string path, string message) => Problems.Add($"{message} at {path}");

    public static JsonElement? Get(JsonElement fields, string key) =>
        fields.ValueKind == JsonValueKind.Object && fields.TryGetProperty(key, out var value) ? value : null;

    /// <summary>The field, unless it is absent or a JSON null.</summary>
    public static JsonElement? Present(JsonElement? value) =>
        value is { ValueKind: not JsonValueKind.Null } ? value : null;

    public IReadOnlyList<JsonElement> Array(JsonElement? value, string path)
    {
        if (value is { ValueKind: JsonValueKind.Array } array)
        {
            return array.EnumerateArray().ToList();
        }

        Fail(path, "expected an array");
        return [];
    }

    /// <summary>An array, or nothing when the field is absent or a JSON null.</summary>
    public IReadOnlyList<JsonElement> OptionalArray(JsonElement? value, string path) =>
        Present(value) is null ? [] : Array(value, path);

    public JsonElement? Object(JsonElement? value, string path)
    {
        if (value is { ValueKind: JsonValueKind.Object })
        {
            return value;
        }

        Fail(path, "expected an object");
        return null;
    }

    public string String(JsonElement fields, string key, string path)
    {
        if (Get(fields, key) is { ValueKind: JsonValueKind.String } value && value.GetString() is { Length: > 0 } text)
        {
            return text;
        }

        Fail($"{path}.{key}", "expected a non-empty string");
        return "";
    }

    public string? NullableString(JsonElement fields, string key, string path) =>
        Get(fields, key) is { ValueKind: JsonValueKind.Null } ? null : String(fields, key, path);

    public bool Boolean(JsonElement fields, string key, string path, bool? fallback = null)
    {
        var value = Get(fields, key);
        if (value is { ValueKind: JsonValueKind.True or JsonValueKind.False } flag)
        {
            return flag.GetBoolean();
        }

        if (value is null && fallback is { } byDefault)
        {
            return byDefault;
        }

        Fail($"{path}.{key}", "expected a boolean");
        return false;
    }

    public int Integer(JsonElement fields, string key, string path)
    {
        if (Get(fields, key) is { ValueKind: JsonValueKind.Number } value
            && value.TryGetDouble(out var number)
            && Math.Floor(number) == number
            && Math.Abs(number) <= int.MaxValue)
        {
            return (int)number;
        }

        Fail($"{path}.{key}", "expected an integer");
        return 0;
    }

    public double Number(JsonElement fields, string key, string path)
    {
        if (Get(fields, key) is { ValueKind: JsonValueKind.Number } value
            && value.TryGetDouble(out var number)
            && double.IsFinite(number))
        {
            return number;
        }

        Fail($"{path}.{key}", "expected a number");
        return 0;
    }

    /// <summary>An array of non-empty strings.</summary>
    public List<string> Strings(IEnumerable<JsonElement> values, string path)
    {
        var strings = new List<string>();
        var i = 0;
        foreach (var item in values)
        {
            if (item.ValueKind == JsonValueKind.String && item.GetString() is { Length: > 0 } text)
            {
                strings.Add(text);
            }
            else
            {
                Fail($"{path}[{i}]", "expected a non-empty string");
            }

            i++;
        }

        return strings;
    }

    public Requirement Requirement(JsonElement? value, string path)
    {
        if (value is not { } element)
        {
            Fail(path, "expected a boolean or an object");
            return new Requirement.Constant(false);
        }

        try
        {
            return Core.Requirement.Parse(element, path);
        }
        catch (RequirementParseException error)
        {
            Problems.Add(error.Message);
            return new Requirement.Constant(false);
        }
    }

    private static JsonElement EmptyObject()
    {
        using var document = JsonDocument.Parse("{}");
        return document.RootElement.Clone();
    }
}
