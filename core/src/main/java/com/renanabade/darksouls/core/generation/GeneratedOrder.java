package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.orders.OrderArgs;
import com.renanabade.darksouls.core.orders.OrderInstance;
import com.renanabade.darksouls.core.orders.OrderTemplate;
import java.util.List;

/** An order of a challenge, with what the game requires it to except. */
public final class GeneratedOrder extends OrderInstance {
    private final List<String> exceptions;

    public GeneratedOrder(OrderTemplate template, OrderArgs args, List<String> exceptions, Integer chapter) {
        super(template, args, chapter);
        this.exceptions = exceptions;
    }

    public List<String> exceptions() {
        return exceptions;
    }
}
