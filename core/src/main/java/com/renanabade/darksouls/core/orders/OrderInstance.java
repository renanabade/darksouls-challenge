package com.renanabade.darksouls.core.orders;

/** A catalog order with its parameters filled in, and the chapter it belongs to (null: the whole journey). */
public class OrderInstance {
    private final OrderTemplate template;
    private final OrderArgs args;
    private final Integer chapter;

    public OrderInstance(OrderTemplate template, OrderArgs args, Integer chapter) {
        this.template = template;
        this.args = args;
        this.chapter = chapter;
    }

    public OrderInstance(OrderTemplate template, OrderArgs args) {
        this(template, args, null);
    }

    public OrderTemplate template() {
        return template;
    }

    public OrderArgs args() {
        return args;
    }

    public Integer chapter() {
        return chapter;
    }
}
