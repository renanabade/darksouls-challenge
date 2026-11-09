package com.renanabade.darksouls.core;

/** A programming error in the generator: an order with missing or unknown parameters, or in the wrong mode. */
public final class InvalidOrderException extends RuntimeException {
    public InvalidOrderException(String message) {
        super(message);
    }
}
