package com.renanabade.darksouls.core.orders;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The shape of an order template: the three pieces (trigger, scope, command), the modes it exists in, how each mode validates
 * it, and the parameters the generator fills in from the seed. The templates are in {@link Catalog}.
 *
 * @param number the order's number in the catalog
 * @param text manual text; {name} placeholders are parameters or the exceptions list
 * @param staticValidation how the static mode validates the order; null when the order is not in that mode
 * @param liveValidation how the live mode validates the order; null when the order is not in that mode
 * @param advice advice printed with the order. Not an order: ignoring it never ends the run
 * @param optIn only generated when the player opts in on the customizer
 */
public record OrderTemplate(
        String id,
        int number,
        String title,
        String text,
        TextIfZero textIfZero,
        Map<String, ParamSpec> params,
        Weight weight,
        Trigger trigger,
        Scope scope,
        Command command,
        Validation staticValidation,
        Validation liveValidation,
        OrderCondition condition,
        OrderExceptions exceptions,
        Question asks,
        String advice,
        boolean optIn) {
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{(\\w+)\\}");

    public Validation validationIn(Mode mode) {
        return mode == Mode.STATIC ? staticValidation : liveValidation;
    }

    public List<Mode> modes() {
        List<Mode> modes = new ArrayList<>();
        if (staticValidation != null) modes.add(Mode.STATIC);
        if (liveValidation != null) modes.add(Mode.LIVE);
        return modes;
    }

    /** Every parameter the pieces refer to, with the kind it must have. */
    public List<ParamRef> paramRefs() {
        List<ParamRef> refs = new ArrayList<>();
        switch (trigger) {
            case Trigger.EnterArea t -> refs.add(new ParamRef(t.area(), ParamKind.AREA));
            case Trigger.EnterArena t -> refs.add(new ParamRef(t.boss(), ParamKind.BOSS));
            case Trigger.DefeatBoss t -> {
                if (t.boss() != null) refs.add(new ParamRef(t.boss(), ParamKind.BOSS));
            }
            case Trigger.MilestoneReached t -> addMilestone(refs, t.milestone());
            default -> {}
        }

        switch (scope) {
            case Scope.Phase s -> {
                addMilestone(refs, s.from());
                addMilestone(refs, s.until());
            }
            case Scope.InArea s -> refs.add(new ParamRef(s.area(), ParamKind.AREA));
            case Scope.Fight s -> refs.add(new ParamRef(s.boss(), ParamKind.BOSS));
            default -> {}
        }

        refs.addAll(command.params());

        switch (condition) {
            case OrderCondition.AttemptsAtMost c -> refs.add(new ParamRef(c.max(), ParamKind.COUNT));
            case OrderCondition.Drawn c -> refs.add(new ParamRef(c.param(), ParamKind.CONDITION));
            case null -> {}
        }

        return refs;
    }

    private static void addMilestone(List<ParamRef> refs, MilestoneRef reference) {
        if (reference instanceof MilestoneRef.Param p) refs.add(new ParamRef(p.name(), ParamKind.MILESTONE));
    }

    /** The {name} placeholders of a text, in order of first appearance. */
    public static List<String> placeholdersOf(String text) {
        Set<String> names = new LinkedHashSet<>();
        var match = PLACEHOLDER.matcher(text);
        while (match.find()) names.add(match.group(1));
        return new ArrayList<>(names);
    }
}
