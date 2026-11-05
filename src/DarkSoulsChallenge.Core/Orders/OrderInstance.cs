using System.Collections;

namespace DarkSoulsChallenge.Core.Orders;

/// <summary>A parameter value drawn by the generator: an id, a number, or a list of ids.</summary>
public abstract record ArgValue
{
    public sealed record Text(string Value) : ArgValue;

    public sealed record Number(int Value) : ArgValue;

    public sealed record TextList(IReadOnlyList<string> Values) : ArgValue;

    public static implicit operator ArgValue(string value) => new Text(value);

    public static implicit operator ArgValue(int value) => new Number(value);

    public static implicit operator ArgValue(string[] values) => new TextList(values);

    public static implicit operator ArgValue(List<string> values) => new TextList(values);
}

/// <summary>The parameters of an order, in the order they were drawn.</summary>
public sealed class OrderArgs : IEnumerable<KeyValuePair<string, ArgValue>>
{
    private readonly OrderedDictionary<string, ArgValue> _values = new(StringComparer.Ordinal);

    public ArgValue? this[string name]
    {
        get => _values.GetValueOrDefault(name);
        set
        {
            if (value is null) _values.Remove(name);
            else _values[name] = value;
        }
    }

    /// <summary>The id a parameter holds, or null when it holds none.</summary>
    public string? Text(string name) => this[name] is ArgValue.Text text ? text.Value : null;

    /// <summary>The number a parameter holds, or null when it holds none.</summary>
    public int? Number(string name) => this[name] is ArgValue.Number number ? number.Value : null;

    /// <summary>The list a parameter holds, or null when it holds none.</summary>
    public IReadOnlyList<string>? List(string name) => this[name] is ArgValue.TextList list ? list.Values : null;

    /// <summary>A copy with one parameter set.</summary>
    public OrderArgs With(string name, ArgValue value)
    {
        var copy = new OrderArgs();
        foreach (var (key, existing) in _values) copy[key] = existing;
        copy[name] = value;
        return copy;
    }

    public IEnumerator<KeyValuePair<string, ArgValue>> GetEnumerator() => _values.GetEnumerator();

    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}

/// <summary>A catalog order with its parameters filled in, and the chapter it belongs to (none: the whole journey).</summary>
public record OrderInstance(OrderTemplate Template, OrderArgs Args, int? Chapter = null);
