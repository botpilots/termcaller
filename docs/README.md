# Ticket Protocol

**Goal:** Standardize engineering tickets to ensure clarity, consistency, and traceability.

---

## 1. File Naming Convention
*   **Format:** `N. descriptive-kebab-case-title.md`
*   **N:** Next available integer (incremental).
*   **Keywords:** Include type in title (e.g., `specification`, `proposal`, `recommendation`).

## 2. Document Structure
Based on `1. implementation-specification.md`:

1.  **Header Block**
    *   **Title** (H1)
    *   **Goal:** Concise summary.
    *   **Context/Tech Stack:** (Optional) relevant details.
    *   Separator (`---`)

2.  **Sections**
    *   **## 1. Overall Goal & Scope**
        *   Define the "What" and "Why".
    *   **## 2. Discussion: Challenges & Solutions**
        *   Address architectural trade-offs or complex logic.
    *   **## 3. PR Implementation Plan**
        *   Break work into logical, atomic Pull Requests (PR 1, PR 2...).
        *   Define **Goal**, **Scope**, and **Test Criteria** for each.

3.  **Footer**
    *   `STATUS: [STATUS]`

---

## 3. STATUS Legend
Status is determined by the document type and lifecycle stage (see existing filenames in `docs/tickets/`).

| Status | Definition | Filename Context |
| :--- | :--- | :--- |
| **PROPOSAL** | A draft or recommendation for improvement. Open for discussion. | `proposal`, `recommendation` (e.g., `3.`, `4.`) |
| **SPECIFICATION** | Approved design plan. Ready for implementation. | `specification` (e.g., `1.`, `2.`) |
| **IMPLEMENTED** | All PRs are merged and deployed. Feature is live. | (Final state for any ticket) |

## 4. Strategy of feature development
It's recommended to develop with an additive strategy. This means that you add new functionality in small, atomic steps. Each step should be self-contained and can be tested independently. At the last step, you switch over to the new logic, then finally do a cleanup PR removing what's now obsolete.