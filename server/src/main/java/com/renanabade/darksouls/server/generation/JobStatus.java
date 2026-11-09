package com.renanabade.darksouls.server.generation;

import java.util.Locale;

public enum JobStatus {
    QUEUED,
    DONE,
    FAILED;

    public String label() {
        return name().toLowerCase(Locale.ROOT);
    }
}
