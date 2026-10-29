import { z } from "zod";

// score to zwykłe z.number(): zakres 1-10 wymuszamy opisem i promptem,
// bo structured output nie lubi minimum/maximum na integerach
export const ReviewCriterion = z.object({
  score: z.number().describe("Integer score from 1 (worst) to 10 (best)."),
  rationale: z.string().describe("Why this score was given; concrete enough to explain a low score."),
});

export const ReviewCriteria = z.object({
  implementationCorrectness: ReviewCriterion.describe(
    "Does the code do what it claims, handling edge cases and error paths without regressions? " +
      "1: logic broken, misses obvious edge/error cases, or silently regresses. " +
      "10: correct across happy path, edge cases, and failure modes with no regressions.",
  ),
  idiomaticity: ReviewCriterion.describe(
    "Does it follow language, framework and repo conventions? " +
      "1: fights the language/framework, ignores conventions. 10: fully idiomatic and consistent with the codebase.",
  ),
  complexity: ReviewCriterion.describe(
    "Is it as simple as the problem allows? " +
      "1: needlessly convoluted or over-abstracted. 10: minimal, easy to follow.",
  ),
  testRiskCoverage: ReviewCriterion.describe(
    "Are risky paths tested in proportion to their risk? " +
      "1: risky changes with no tests. 10: risky paths and edge cases well covered.",
  ),
  documentation: ReviewCriterion.describe(
    "Are non-obvious decisions and public surfaces explained? " +
      "1: confusing and undocumented. 10: clear comments/docs where they matter.",
  ),
  securitySafety: ReviewCriterion.describe(
    "Does the change avoid vulnerabilities, leaking secrets, or unsafe handling of untrusted input? " +
      "1: introduces an exploitable flaw, leaks secrets, or trusts untrusted input unsafely. " +
      "10: input validated, secrets handled correctly, no new attack surface opened.",
  ),
});

export const ReviewResult = z.object({
  criteria: ReviewCriteria,
  verdict: z.enum(["pass", "fail"]).describe("Authoritative overall verdict for the change."),
  summary: z.string().describe("Markdown summary for a PR comment."),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

export const REVIEWER_PROMPT = `You are a rigorous code reviewer. Review the supplied diff and return ONLY the structured object the schema defines — no prose outside it.
 
Score these six criteria, each as an INTEGER from 1 (worst) to 10 (best), and give each a concrete rationale that justifies the number (especially low scores):
- implementationCorrectness — does the code do what it claims across edge cases and error paths?
- idiomaticity — does it follow language, framework, and repo conventions?
- complexity — is it as simple as the problem allows, free of needless abstraction?
- testRiskCoverage — are risky paths tested in proportion to their risk?
- documentation — are non-obvious decisions and public surfaces explained?
- securitySafety — does it avoid vulnerabilities, secret leaks, and unsafe handling of untrusted input?

Then emit a single authoritative \`verdict\` ("pass" or "fail") and a \`summary\` written as markdown suitable for posting as a PR comment (lead with the verdict, then the most important findings).`;

// Plain JSON Schema dla Codex SDK (outputSchema musi być zwykłym obiektem JSON).
// OpenAI wymaga additionalProperties: false i wszystkich pól jako required;
// zod 4 generuje to domyślnie dla z.object().
const { $schema, ...schema } = z.toJSONSchema(ReviewResult) as Record<string, unknown>;
export const REVIEW_JSON_SCHEMA = schema;
