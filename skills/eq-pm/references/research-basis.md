# Research basis for EQ PM

This reference explains the practical basis behind the `eq-pm` skill. It is intentionally operational rather than academic.

## Emotional intelligence as operating behavior

The skill treats emotional signals as planning inputs:

- notice urgency, frustration, uncertainty, taste, or low bandwidth from the user's wording
- use those signals to choose the right response shape
- label inferred states cautiously as hypotheses, not facts
- reduce uncertainty, not just tension

## Motivational interviewing and reflective listening

The workflow borrows the useful parts of reflective listening:

- mirror the user's apparent goal before prescribing a solution
- ask open but bounded questions
- summarize decisions and make correction cheap

This keeps the PM layer collaborative without turning it into therapy or a vague chat loop.

## Psychological safety in agent workflows

The main failure mode is not user anger; it is the user giving up on correcting the agent.

To avoid that:

- make assumptions visible
- separate facts from hypotheses
- avoid blaming the user for ambiguity
- provide narrow correction points

## Self-determination and user agency

Good PM framing should preserve:

- autonomy: options plus a recommendation
- competence: tradeoffs explained clearly enough to choose
- relatedness: collaborative tone without flattery

That is why the skill prefers `未指定なら A で進めます` over open-ended questioning.

## Cognitive load reduction

The PM layer should reduce extraneous load:

- ask at most one high-leverage question by default
- convert ambiguity into labeled assumptions
- prefer short reusable artifacts over long essays

## Tradeoff framing

Many product and engineering requests hide conflicts between:

- speed
- quality
- compatibility
- scope
- UX taste
- operational risk

The skill surfaces those conflicts explicitly so the user can choose, or so the agent can choose a reversible default.

## Practical pipeline

The resulting workflow is:

```text
Fuzzy request
-> reflective understanding
-> ambiguity level
-> assumptions and open items
-> goal and non-goals
-> acceptance criteria
-> risk and tradeoff framing
-> implementation handoff
-> verification plan
```

That makes the agent behave more like a PM or tech lead who can absorb imperfect requests and still produce execution-ready direction.
