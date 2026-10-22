import type { ApolloServerPlugin } from "@apollo/server";
import {
  GraphQLError,
  Kind,
  type ASTNode,
  type FragmentDefinitionNode,
  type ValidationContext,
  type ValidationRule,
} from "graphql";
import { getComplexity, simpleEstimator } from "graphql-query-complexity";

/** Deepest selection allowed: the real queries go job → challenge → players → chapters → field. */
export const MAX_DEPTH = 7;
/** Highest cost allowed, one point per field: a full challenge with its players costs about 40. */
export const MAX_COMPLEXITY = 300;

function depthOf(
  node: ASTNode,
  fragments: Readonly<Record<string, FragmentDefinitionNode>>,
  seen: ReadonlySet<string>,
): number {
  switch (node.kind) {
    case Kind.FIELD:
      return node.selectionSet === undefined ? 0 : 1 + depthOf(node.selectionSet, fragments, seen);
    case Kind.SELECTION_SET:
      return Math.max(0, ...node.selections.map((s) => depthOf(s, fragments, seen)));
    case Kind.INLINE_FRAGMENT:
      return depthOf(node.selectionSet, fragments, seen);
    case Kind.FRAGMENT_SPREAD: {
      const fragment = fragments[node.name.value];
      if (fragment === undefined || seen.has(node.name.value)) return 0;
      return depthOf(fragment.selectionSet, fragments, new Set([...seen, node.name.value]));
    }
    default:
      return 0;
  }
}

/**
 * Refuses a query nested deeper than `max`, before it runs. Fragments count where they are spread; a
 * fragment that spreads itself is refused by GraphQL's own validation.
 */
export function depthLimit(max: number): ValidationRule {
  return (context: ValidationContext) => {
    const fragments = Object.fromEntries(
      context
        .getDocument()
        .definitions.filter((d) => d.kind === Kind.FRAGMENT_DEFINITION)
        .map((d) => [d.name.value, d]),
    );
    return {
      OperationDefinition(operation) {
        const depth = depthOf(operation.selectionSet, fragments, new Set());
        if (depth > max)
          context.reportError(
            new GraphQLError(`query depth ${String(depth)} exceeds the limit of ${String(max)}`, {
              nodes: [operation],
            }),
          );
      },
    };
  };
}

/** Refuses an operation whose cost passes `max`, after validation and before execution. */
export function complexityLimit(max: number): ApolloServerPlugin {
  return {
    requestDidStart: () =>
      Promise.resolve({
        didResolveOperation({ request, document, schema }) {
          const complexity = getComplexity({
            schema,
            query: document,
            ...(request.operationName != null && { operationName: request.operationName }),
            variables: request.variables ?? {},
            estimators: [simpleEstimator({ defaultComplexity: 1 })],
          });
          if (complexity > max)
            throw new GraphQLError(
              `query cost ${String(complexity)} exceeds the limit of ${String(max)}`,
              { extensions: { code: "QUERY_TOO_COMPLEX" } },
            );
          return Promise.resolve();
        },
      }),
  };
}
