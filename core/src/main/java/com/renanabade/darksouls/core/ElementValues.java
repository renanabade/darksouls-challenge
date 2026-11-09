package com.renanabade.darksouls.core;

/** An amount per damage element. */
public record ElementValues(double physical, double magic, double fire, double thunder) {
    public double of(Element element) {
        return switch (element) {
            case PHYSICAL -> physical;
            case MAGIC -> magic;
            case FIRE -> fire;
            case THUNDER -> thunder;
        };
    }
}
