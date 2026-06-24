# Reality-Grounded Terminology Generation

## Vision

Technical documentation is the foundation for high-quality translation.

However, terminology often originates from generic language rather than a precise understanding of the physical objects being described.

Our vision is to generate terminology that is grounded in visual reality.

Instead of asking AI to extract terms from text, we use images, diagrams, screenshots, and callouts to understand the concepts behind those terms.

The result is a stronger conceptual foundation for technical authoring, terminology management, and localization.

---

# The Problem

Terminology is inherently difficult.

Unlike paragraphs or complete procedures, individual terms contain very little semantic information.

Consider terms such as:

* cover
* bracket
* guide
* holder
* attachment point

These words can represent many different concepts depending on the product and the surrounding visual context.

This makes terminology difficult for:

* Technical authors
* Terminology managers
* Translators
* AI systems

Traditional terminology extraction operates on text alone.

As a result, AI tends to extract every seemingly important noun while having little understanding of whether those words actually represent distinct engineering concepts.

---

# The Root Cause

The problem begins long before translation.

Technical authors frequently choose generic terminology because:

* a more precise term is unknown
* engineering terminology is unavailable
* previous documentation used the same wording
* generic terminology is the safest choice

Later, localization teams build termbases around these source terms.

The result is highly consistent translation of terminology that may already be under-specified.

Current workflows optimize consistency.

They rarely improve the underlying concepts.

---

# Our Approach

Rather than extracting terminology from language, we generate concept candidates from visual evidence.

Images contain information that is often missing from text.

A diagram may reveal that an "attachment point" is actually a "top tether anchor."

A component described as a "cover" may visually correspond to an inspection panel or battery compartment cover.

The image becomes the primary source of semantic information.

The surrounding text provides local grounding.

---

# MVP

The first version intentionally solves only one problem:

Generate reality-grounded concept candidates independently for every illustration.

There is no document-wide reasoning.

There is no automatic terminology management.

Each illustration is treated as an independent work item.

This makes the solution:

* highly parallelizable
* scalable
* simple to explain
* suitable for large technical documentation sets

---

# Workflow

## Step 1

Extract all illustrations from the document.

Supported inputs:

* DITA XML
* Generic XML
* PDF
* HTML

Every illustration becomes an independent processing task.

---

## Step 2

Identify:

* callouts
* labels
* surrounding documentation
* figure captions

This establishes the local context for every referenced object.

---

## Step 3

For every callout, the multimodal LLM receives:

* the illustration
* the nearby documentation
* the callout identifier

The model generates:

* Source term
* Candidate concept name
* A concise definition describing the object and its engineering function

The definition should focus on:

* what the object is
* what it does
* its visible physical characteristics

rather than the specific procedure in which it appears.

Example:

```json
{
  "callout": 7,
  "sourceTerm": "bracket",
  "candidateConcept": "Mounting bracket",
  "definition": "Rigid structural component used to provide a fixed mounting interface between two mechanical components."
}
```

Every image is processed independently.

---

## Step 4

Concept definitions are embedded into a semantic vector space.

Initially, no automatic clustering or AI-driven terminology decisions are made.

Instead, concept candidates are grouped by their source term.

Example:

```text
cover

  Definition A
  Definition B
  Definition C
```

```text
bracket

  Definition A
  Definition B
  Definition C
```

Within each source-term group, semantic similarity is calculated between all generated definitions.

This produces a similarity distribution for every term.

---

## Step 5

The user interface presents the results.

The objective is not to automate terminology management.

The objective is to surface potential inconsistencies efficiently.

Rather than making decisions automatically, the system highlights possible outliers.

Example:

```text
Source term

Bracket

Occurrences

41

Potential semantic outliers

3
```

The terminology manager can inspect those occurrences and decide whether:

* they represent the same concept
* a separate concept should be created
* the source terminology is sufficiently precise

The AI prepares the evidence.

The human makes the terminology decision.

---

# Why This Works

The MVP intentionally avoids solving the hardest problem:

Automatically deciding whether two concepts should be merged or split.

Instead, it generates high-quality concept definitions for every occurrence and lets semantic similarity identify possible outliers.

This significantly reduces AI creativity while still leveraging multimodal reasoning where it provides the greatest value.

---

# Future Work

Future versions may introduce document-wide concept analysis.

Potential capabilities include:

* automatic clustering of concepts
* concept merging recommendations
* concept splitting recommendations
* TBX generation
* multilingual terminology generation
* terminology enrichment for software localization

The MVP provides the foundation for these future capabilities while remaining simple, explainable, and practical.

---

# Long-Term Vision

Today's terminology workflows begin with words.

We propose beginning with the objects those words describe.

By grounding concept generation in visual reality, technical documentation becomes more precise at its source.

Better concepts lead to better terminology.

Better terminology leads to better translations.