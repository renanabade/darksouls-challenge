package com.renanabade.darksouls.core;

import java.util.List;

/** A starting gift. "(none)" is a gift with no items. */
public record StartingGift(int row, List<GiftItem> items) {}
