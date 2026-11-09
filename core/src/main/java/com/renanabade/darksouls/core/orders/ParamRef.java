package com.renanabade.darksouls.core.orders;

/** A parameter an order refers to, with the kind it must have. */
public record ParamRef(String param, ParamKind kind) {}
