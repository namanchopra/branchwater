---
name: update-skill-learnings
description: Extract learnings about skill creation/improvement from a session and propagate them to the central skill learnings file, then sync to appropriate skills. Use when a session revealed patterns, anti-patterns, or insights about structuring skills. Invoke via /update-skill-learnings or after skill creation/improvement sessions.
---

<EXTREMELY-IMPORTANT>
Before adding ANY skill learning, you **ABSOLUTELY MUST**:

1. Identify a concrete, actionable pattern (not vague observation)
2. Verify the pattern is about skill structure/content (not application code)
3. Categorize correctly: Structural Pattern, Content Pattern, Anti-Pattern, or Skill-Specific
4. Get user confirmation before writing

**Adding learnings without verification = cluttered, unhelpful knowledge base**

This is not optional. Every learning requires disciplined validation.
</EXTREMELY-IMPORTANT>

# Update Skill Learnings

## MANDATORY FIRST RESPONSE PROTOCOL

Before adding ANY skill learning, you **MUST** complete this checklist:

1. ☐ Identify the specific pattern or anti-pattern from the session
2. ☐ Verify this is about skill creation/improvement (not application code)
3. ☐ Categorize: Structural, Content, Anti-Pattern, or Skill-Specific
4. ☐ Formulate as actionable guidance (imperative mood)
5. ☐ Check for duplicates in existing learnings
6. ☐ Present learning to user for confirmation
7. ☐ Announce: "Adding skill learning: [category] - [brief description]"

**Adding learnings WITHOUT completing this checklist = noise in the knowledge base.**

## Purpose

This skill captures learnings about **creating and improving Claude Code skills**.

**What it captures:**
- Structural patterns (required sections, quality signals)
- Content patterns (clarity, user interaction)
- Anti-patterns to avoid
- Skill-specific learnings

**Output:** Updates to `.claude/learnings/skill-learnings.md` → synced to appropriate skills

**Does NOT:**
- Capture learnings about application code (use update-agent-learnings instead)
- Modify existing skills without user confirmation

## When to Use

- After creating a new skill
- After improving an existing skill
- After reviewing skill quality (like the ulpi-generate-hooks review)
- When discovering patterns that make skills more effective
- Invoke via `/update-skill-learnings`

**Never add learnings proactively.** Only when session revealed concrete patterns.

## Step 1: Session Analysis

**Gate: Identify at least one concrete skill pattern before proceeding to Step 2.**

Review the current conversation/session for skill-related patterns:

1. **Structural discoveries:**
   - What sections were missing from a skill?
   - What structural patterns made skills more effective?
   - What formatting improved clarity?

2. **Content discoveries:**
   - What made instructions clearer?
   - What examples helped understanding?
   - What error handling was missing?

3. **Anti-patterns discovered:**
   - What caused confusion or errors?
   - What was missing that caused problems?
   - What patterns should be avoided?

## Step 2: Learning Extraction

**Gate: User confirms extracted learnings before proceeding to Step 3.**

Present findings to user and ask for confirmation:

```
I identified the following skill learnings from this session:

**Structural Patterns:**
1. [Pattern description]

**Content Patterns:**
1. [Pattern description]

**Anti-Patterns:**
1. [Pattern description]

**Skill-Specific (if any):**
1. [Skill name]: [Learning description]

Should I add these to the skill learnings file?
```

Use AskUserQuestion to:
- Confirm the extracted learnings are accurate
- Allow user to refine or add additional learnings
- Get approval before making changes

### Learning Classification

Each learning should specify:

| Field | Options | Description |
|-------|---------|-------------|
| **Category** | Structural Patterns, Content Patterns, Anti-Patterns, Skill-Specific | Where does this learning fit? |
| **Subcategory** | Required Sections, Quality Signals, Clarity, User Interaction, Structure, Content | More specific placement |

### Classification Guide

| Category | What It Covers | Examples |
|----------|---------------|----------|
| **Structural Patterns** | Required sections, file organization, quality signals | EXTREMELY-IMPORTANT block, Gate checkpoints, Quality Checklist |
| **Content Patterns** | Writing style, clarity, examples, user interaction | Imperative mood, concrete examples, error handling |
| **Anti-Patterns** | Things to avoid in skills | Missing gates, vague instructions, no failure modes |
| **Skill-Specific** | Learnings about one particular skill | ulpi-generate-hooks needs same patterns as commit |

## Step 3: Update Central Learnings File

**Gate: Learnings file updated successfully before proceeding to Step 4.**

1. Read current `.claude/learnings/skill-learnings.md`
2. Locate the appropriate section:
   - Structural patterns go under `## Structural Patterns` → appropriate subsection
   - Content patterns go under `## Content Patterns` → appropriate subsection
   - Anti-patterns go under `## Anti-Patterns` → appropriate subsection
   - Skill-specific learnings go under `## Skill-Specific Learnings` → appropriate skill
3. Add new learnings to the appropriate section
4. Update the "Last updated" timestamp
5. Write updated file

### File Structure

The learnings file follows this structure:

```markdown
# Skill Learnings

## Structural Patterns
### Required Sections
- [learning items...]

### Quality Signals
- [learning items...]

---

## Content Patterns
### Clarity
- [learning items...]

### User Interaction
- [learning items...]

---

## Anti-Patterns
### Structure
- [learning items...]

### Content
- [learning items...]

---

## Skill-Specific Learnings

### [skill-name]
- [learning specific to this skill...]

---

*Last updated: [date]*
```

## Step 4: Verification

**Gate: All checks pass before marking complete.**

### Check 1: Learning Added

- [ ] New learning appears in correct section
- [ ] No duplicate entries created
- [ ] Timestamp updated

### Check 2: Learning Quality

- [ ] Learning is actionable (imperative mood)
- [ ] Learning is specific (not vague)
- [ ] Learning includes context if needed

### Check 3: File Integrity

- [ ] File structure preserved
- [ ] No sections accidentally removed
- [ ] Markdown formatting valid

## Pre-Update Checklist

Before updating, verify:
- [ ] Learning is concrete and actionable
- [ ] Learning is about skills (not application code)
- [ ] Category assignment is correct
- [ ] No duplicates exist
- [ ] User confirmed the learning

## Error Handling

| Situation | Action |
|-----------|--------|
| Learning is vague | Refine to be actionable before adding |
| Learning is about application code | Redirect to update-agent-learnings |
| Category unclear | Ask user to clarify |
| Duplicate exists | Merge or skip, inform user |
| File structure broken | Fix structure before adding |

## Safety Rules

| Rule | Reason |
|------|--------|
| Always get user confirmation | Ensures learnings are accurate and desired |
| Never delete existing learnings | Preserve institutional knowledge |
| Keep learnings actionable | Vague observations don't help |
| Use imperative mood | Clearer instructions |
| Preserve file structure | Maintains organization |

---

## Quality Checklist (Must Score 8/10)

Score yourself honestly before marking update complete:

### Learning Identification (0-2 points)
- **0 points:** Vague observation, not actionable
- **1 point:** Somewhat specific but could be clearer
- **2 points:** Concrete, actionable pattern

### Classification (0-2 points)
- **0 points:** Wrong category
- **1 point:** Correct category, wrong subcategory
- **2 points:** Correct category and subcategory

### User Confirmation (0-2 points)
- **0 points:** Added without showing to user
- **1 point:** Showed but didn't wait for confirmation
- **2 points:** Full confirmation before writing

### File Integrity (0-2 points)
- **0 points:** Broke file structure
- **1 point:** Minor formatting issues
- **2 points:** Clean update, structure preserved

### Duplicate Check (0-2 points)
- **0 points:** Added duplicate without checking
- **1 point:** Checked but not thoroughly
- **2 points:** Verified no duplicates exist

**Minimum passing score: 8/10**

---

## Common Rationalizations (All Wrong)

These are excuses. Don't fall for them:

- **"This pattern is obvious"** → STILL document it explicitly
- **"It's just a small insight"** → Small insights compound into quality
- **"The learnings file is already comprehensive"** → STILL check for gaps
- **"The user knows what they want"** → STILL confirm before adding
- **"This is similar to an existing learning"** → Check if it's a duplicate or refinement

---

## Failure Modes

### Failure Mode 1: Vague Learnings

**Symptom:** Learnings like "skills should be clear"
**Fix:** Be specific - "Use imperative mood, provide concrete examples"

### Failure Mode 2: Wrong Category

**Symptom:** Structural pattern filed under Anti-Patterns
**Fix:** Review category definitions before filing

### Failure Mode 3: Duplicate Added

**Symptom:** Same learning exists in multiple places
**Fix:** Search existing learnings before adding

### Failure Mode 4: Application Code Learning

**Symptom:** Learning about TypeScript patterns added to skill learnings
**Fix:** Redirect to update-agent-learnings skill

---

## Quick Workflow Summary

```
STEP 1: SESSION ANALYSIS
├── Review session for skill patterns
├── Identify structural discoveries
├── Identify content discoveries
├── Identify anti-patterns
└── Gate: Concrete pattern identified

STEP 2: LEARNING EXTRACTION
├── Categorize the learning
├── Formulate as actionable guidance
├── Check for duplicates
├── Present to user
├── Get confirmation
└── Gate: User approved

STEP 3: UPDATE LEARNINGS FILE
├── Read current skill-learnings.md
├── Locate correct section
├── Add new learning
├── Update timestamp
├── Write file
└── Gate: File updated

STEP 4: VERIFICATION
├── Verify learning added correctly
├── Verify learning quality
├── Verify file integrity
└── Gate: All checks pass
```

---

## Completion Announcement

When update is complete, announce:

```
Skill learning added.

**Quality Score: X/10**
- Learning Identification: X/2
- Classification: X/2
- User Confirmation: X/2
- File Integrity: X/2
- Duplicate Check: X/2

**Learning Added:**
- Category: [category]
- Subcategory: [subcategory]
- Learning: [brief description]

**File Updated:** .claude/learnings/skill-learnings.md

**Next steps:**
Review the skill-learnings.md file to see all captured patterns.
```

---

## Integration with Other Skills

The `update-skill-learnings` skill integrates with:

- **`update-agent-learnings`** — Use for application code learnings, not skill learnings
- **`commit`** — Commit skill-learnings.md changes after update
- **`skill-creator` (example-skills)** — Reference skill-learnings.md when creating new skills

**Workflow Chain:**

```
Session reveals skill pattern
         │
         ▼
update-skill-learnings skill (this skill)
         │
         ▼
skill-learnings.md updated
         │
         ▼
Future skill creation benefits from learnings
```

**Decision Guide:**

```
Is the learning about...
         │
    ┌────┴────┐
    ▼         ▼
Skills?   Application Code?
    │         │
    ▼         ▼
This skill   update-agent-learnings
```

---

## Examples

### Example 1: Adding a Structural Pattern Learning

**Session Issue:** Created a skill without EXTREMELY-IMPORTANT block.

**Learning Extraction:**
- Category: Structural Patterns
- Subcategory: Required Sections
- Learning: "Always include `<EXTREMELY-IMPORTANT>` block after frontmatter with verification requirements"

**Result:**
1. Added to `.claude/learnings/skill-learnings.md` under Structural Patterns → Required Sections

### Example 2: Adding an Anti-Pattern

**Session Issue:** Skill had bash code blocks that looked executable but were meant as instructions.

**Learning Extraction:**
- Category: Anti-Patterns
- Subcategory: Content
- Learning: "Avoid bash code blocks that look executable but are meant as agent instructions - rephrase as prose"

**Result:**
1. Added to `.claude/learnings/skill-learnings.md` under Anti-Patterns → Content

### Example 3: Adding a Skill-Specific Learning

**Session Issue:** ulpi-generate-hooks was missing patterns that commit/create-pr/start have.

**Learning Extraction:**
- Category: Skill-Specific
- Skill: ulpi-generate-hooks
- Learning: "Apply same structural patterns as commit/create-pr/start for consistency"

**Result:**
1. Added to `.claude/learnings/skill-learnings.md` under Skill-Specific Learnings → ulpi-generate-hooks
