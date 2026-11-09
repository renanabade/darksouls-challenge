package com.renanabade.darksouls.core.generation;

import com.renanabade.darksouls.core.orders.OrderArgs;
import java.util.List;

/** An order as it leaves the system: the template's id, its arguments and its manual text. */
public record OrderDocument(String id, Integer chapter, OrderArgs args, List<String> exceptions, String text) {}
