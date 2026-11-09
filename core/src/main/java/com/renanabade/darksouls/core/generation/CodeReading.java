package com.renanabade.darksouls.core.generation;

/** A code as it was read: what it holds, or why it could not be read. Exactly one of the two is set. */
public record CodeReading(DecodedCode decoded, String problem) {
    static CodeReading failed(String problem) {
        return new CodeReading(null, problem);
    }

    public boolean ok() {
        return decoded != null;
    }
}
