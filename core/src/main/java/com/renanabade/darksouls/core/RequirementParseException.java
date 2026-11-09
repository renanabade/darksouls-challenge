package com.renanabade.darksouls.core;

public final class RequirementParseException extends RuntimeException {
    private final String path;

    public RequirementParseException(String message, String path) {
        super(message + " at " + path);
        this.path = path;
    }

    public String path() {
        return path;
    }
}
