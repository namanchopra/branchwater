---
name: update-claude-learnings
description: Extract learnings about Claude Code behavior from a session and add them to the project's CLAUDE.md file. Use for behavioral rules, workflow patterns, and project-specific instructions that apply to the main Claude Code agent. Invoke via /update-claude-learnings after sessions revealing behavioral patterns.
---

<EXTREMELY-IMPORTANT>
Before adding ANY learning to CLAUDE.md, you **ABSOLUTELY MUST**:

1. Verify the learning is about Claude Code behavior (not application code or skill structure)
2. Verify it applies to the main agent (not subagents or skill creation)
3. Check for duplicates in existing CLAUDE.md sections
4. Get user confirmation before writing

**Adding learnings without verification = cluttered CLAUDE.md, conflicting rules**

This is not optional. Every learning requires disciplined validation.
</EXTREMELY-IMPORTANT>

# Update Claude Learnings

## MANDATORY FIRST RESPONSE PROTOCOL

Before adding ANY learning to CLAUDE.md, you **MUST** complete this checklist:

1. ☐ Identify the specific behavioral pattern from the session
2. ☐ Verify this is about Claude Code behavior (not application code or skills)
3. ☐ Verify it applies to main agent (not subagents)
4. ☐ Categorize: Workflow Rules, Session Management, Scope Control, or Behavioral Patterns
5. ☐ Check CLAUDE.md for existing related rules
6. ☐ Formulate as actionable directive (imperative mood)
7. ☐ Present learning to user for confirmation
8. ☐ Announce: "Adding to CLAUDE.md: [category] - [brief description]"

**Adding learnings WITHOUT completing this checklist = noise in project config.**

## Purpose

This skill captures learnings about **Claude Code's own behavior** in this project.

**What it captures:**
- Workflow rules (use skills, command patterns)
- Session management (checkpoints, timeouts, focus)
- Scope control (expansion rules, confirmation patterns)
- Behavioral patterns (project-specific behaviors)

**Output:** Updates to project's `CLAUDE.md` file

**Does NOT:**
- Capture application code patterns (use `/update-agent-learnings`)
- Capture skill creation patterns (use `/update-skill-learnings`)
- Apply to subagents (they don't read CLAUDE.md during task execution)

## When to Use

- After discovering Claude Code should use a skill instead of manual commands
- After session management issues (lost context, premature endings)
- After scope control problems (over-engineering, tangential work)
- After discovering project-specific behavioral needs
- Invoke via `/update-claude-learnings`

**Never add learnings proactively.** Only when session revealed concrete patterns.

## Decision Guide: Which Skill to Use?

```
Is the learning about...

Application code patterns?
├── Applies to subagents writing code
└── Use: /update-agent-learnings

Skill creation/improvement?
├── Structural patterns, quality signals
└── Use: /update-skill-learnings

Claude Code's own behavior?
├── Workflow rules, session management, scope control
└── Use: /update-claude-learnings (this skill)
```

| Learning Type | Example | Correct Skill |
|---------------|---------|---------------|
| Testing patterns | "Run tsc --noEmit after TypeScript edits" | update-agent-learnings |
| Skill structure | "Include EXTREMELY-IMPORTANT block" | update-skill-learnings |
| Workflow behavior | "Use /commit instead of git commit" | update-claude-learnings |
| Session behavior | "Checkpoint every 3-5 edits" | update-claude-learnings |

## Step 1: Session Analysis

**Gate: Identify at least one concrete behavioral pattern before proceeding to Step 2.**

Review the current conversation/session for Claude Code behavioral patterns:

1. **Workflow discoveries:**
   - Should Claude Code have used a skill instead of manual commands?
   - Are there command patterns that should be standardized?
   - Are there tools that should always/never be used?

2. **Session management discoveries:**
   - Did context get lost?
   - Did the session end prematurely?
   - Were checkpoints needed but missing?

3. **Scope control discoveries:**
   - Did Claude Code over-engineer?
   - Was confirmation needed before expanding scope?
   - Did tangential work distract from the main task?

4. **Project-specific discoveries:**
   - Are there project conventions Claude Code should follow?
   - Are there paths/files that need special handling?
   - Are there commands specific to this project?

## Step 2: Learning Extraction

**Gate: User confirms extracted learning before proceeding to Step 3.**

Present findings to user and ask for confirmation:

```
I identified the following Claude Code behavioral learning from this session:

**Category:** [Workflow Rules / Session Management / Scope Control / Behavioral Patterns]

**Learning:** [Description in imperative mood]

**Why:** [Brief explanation of what happened]

Should I add this to CLAUDE.md?
```

Use AskUserQuestion to:
- Confirm the extracted learning is accurate
- Allow user to refine the wording
- Get approval before making changes

### Learning Classification

| Category | What It Covers | Section in CLAUDE.md |
|----------|---------------|---------------------|
| **Workflow Rules** | Skill usage, command patterns, tool preferences | `## Workflow Rules` |
| **Session Management** | Checkpoints, timeouts, progress tracking | `## Workflow Rules > ### Session Management` |
| **Scope Control** | Expansion rules, confirmation patterns | `## Workflow Rules > ### Scope Control` |
| **Behavioral Patterns** | Project-specific behaviors, conventions | `## Behavioral Patterns` |

## Step 3: Update CLAUDE.md

**Gate: CLAUDE.md updated successfully before proceeding to Step 4.**

1. Read current `CLAUDE.md` from project root
2. Locate the appropriate section based on category
3. Add new learning in imperative mood
4. Preserve existing structure and content
5. Update "Last updated" timestamp
6. Write updated file

### CLAUDE.md Structure

```markdown
# Claude Code Project Configuration

---

## Workflow Rules

### Use Available Skills
- [skill usage rules...]

### Session Management
- [checkpoint rules, timeout handling...]

### Scope Control
- [expansion rules, confirmation patterns...]

---

## Project Context

### Repository Purpose
[project description]

### Key Directories
[important paths]

---

## Behavioral Patterns

[project-specific behaviors derived from sessions]

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
- [ ] Learning applies to main Claude Code agent

### Check 3: File Integrity

- [ ] File structure preserved
- [ ] No sections accidentally removed
- [ ] Markdown formatting valid

### Check 4: Correct Scope

- [ ] Learning is NOT about application code (would go to agent-learnings)
- [ ] Learning is NOT about skill structure (would go to skill-learnings)
- [ ] Learning IS about Claude Code behavior in this project

## Pre-Update Checklist

Before updating, verify:
- [ ] Learning is about Claude Code behavior
- [ ] Learning applies to main agent, not subagents
- [ ] Category assignment is correct
- [ ] No duplicates exist in CLAUDE.md
- [ ] User confirmed the learning

## Error Handling

| Situation | Action |
|-----------|--------|
| Learning is about application code | Redirect to `/update-agent-learnings` |
| Learning is about skill structure | Redirect to `/update-skill-learnings` |
| CLAUDE.md doesn't exist | Create with standard structure |
| Category unclear | Ask user to clarify |
| Duplicate exists | Merge or skip, inform user |
| File structure broken | Fix structure before adding |

## Safety Rules

| Rule | Reason |
|------|--------|
| Always get user confirmation | Ensures learnings are accurate and desired |
| Never delete existing content | Preserve project configuration |
| Keep learnings actionable | Vague rules don't help |
| Use imperative mood | Clearer directives |
| Preserve file structure | Maintains organization |
| Verify scope before adding | Wrong file = wrong audience |

---

## Quality Checklist (Must Score 8/10)

Score yourself honestly before marking update complete:

### Learning Identification (0-2 points)
- **0 points:** Vague observation, not actionable
- **1 point:** Somewhat specific but could be clearer
- **2 points:** Concrete, actionable behavioral rule

### Scope Verification (0-2 points)
- **0 points:** Wrong scope (should be agent or skill learning)
- **1 point:** Correct scope but borderline
- **2 points:** Clearly Claude Code behavior, correct scope

### User Confirmation (0-2 points)
- **0 points:** Added without showing to user
- **1 point:** Showed but didn't wait for confirmation
- **2 points:** Full confirmation before writing

### File Integrity (0-2 points)
- **0 points:** Broke file structure
- **1 point:** Minor formatting issues
- **2 points:** Clean update, structure preserved

### Category Placement (0-2 points)
- **0 points:** Wrong section
- **1 point:** Correct section but awkward placement
- **2 points:** Perfect section and placement

**Minimum passing score: 8/10**

---

## Common Rationalizations (All Wrong)

These are excuses. Don't fall for them:

- **"This is obvious behavior"** → STILL document it explicitly
- **"It's in the other learnings files"** → Check scope - CLAUDE.md is for main agent
- **"The user knows the workflow"** → Future sessions need this documented
- **"It's a small thing"** → Small rules compound into consistent behavior
- **"CLAUDE.md is already long"** → Organization matters more than brevity

---

## Failure Modes

### Failure Mode 1: Wrong Scope

**Symptom:** Added "Run tsc --noEmit after edits" to CLAUDE.md
**Why Wrong:** This is for subagents writing TypeScript, not main Claude Code
**Fix:** Use `/update-agent-learnings` instead

### Failure Mode 2: Skill Pattern in CLAUDE.md

**Symptom:** Added "Include EXTREMELY-IMPORTANT block in skills"
**Why Wrong:** This is about skill structure, not Claude Code behavior
**Fix:** Use `/update-skill-learnings` instead

### Failure Mode 3: Vague Rule

**Symptom:** Added "Be more careful with commits"
**Why Wrong:** Not actionable - what specific behavior?
**Fix:** Make specific: "Use /commit skill instead of manual git commit"

### Failure Mode 4: Duplicate Added

**Symptom:** Same rule exists in multiple sections
**Fix:** Search CLAUDE.md before adding, merge if similar exists

---

## Quick Workflow Summary

```
STEP 1: SESSION ANALYSIS
├── Review session for behavioral patterns
├── Identify workflow issues
├── Identify session management issues
├── Identify scope control issues
└── Gate: Concrete pattern identified

STEP 2: LEARNING EXTRACTION
├── Categorize the learning
├── Verify correct scope (not agent/skill learning)
├── Formulate as actionable directive
├── Check for duplicates
├── Present to user
├── Get confirmation
└── Gate: User approved

STEP 3: UPDATE CLAUDE.MD
├── Read current CLAUDE.md
├── Locate correct section
├── Add new learning
├── Update timestamp
├── Write file
└── Gate: File updated

STEP 4: VERIFICATION
├── Verify learning added correctly
├── Verify learning quality
├── Verify file integrity
├── Verify correct scope
└── Gate: All checks pass
```

---

## Completion Announcement

When update is complete, announce:

```
CLAUDE.md updated.

**Quality Score: X/10**
- Learning Identification: X/2
- Scope Verification: X/2
- User Confirmation: X/2
- File Integrity: X/2
- Category Placement: X/2

**Learning Added:**
- Category: [category]
- Section: [section path]
- Learning: [brief description]

**File Updated:** CLAUDE.md

**Next steps:**
The learning will be active in future sessions.
```

---

## Integration with Other Skills

The `update-claude-learnings` skill completes the learning system:

| Skill | Target | Audience |
|-------|--------|----------|
| `update-agent-learnings` | agent-learnings.md → agent files | Subagents writing code |
| `update-skill-learnings` | skill-learnings.md | Skill creators |
| `update-claude-learnings` | CLAUDE.md | Main Claude Code agent |

**Complete Learning System:**

```
Session reveals pattern
         │
    ┌────┼────────────────┐
    ▼    ▼                ▼
Subagent  Skill        Claude Code
pattern?  pattern?     behavior?
    │        │             │
    ▼        ▼             ▼
/update-  /update-     /update-
agent-    skill-       claude-
learnings learnings    learnings
    │        │             │
    ▼        ▼             ▼
agent-    skill-       CLAUDE.md
learnings learnings
.md       .md
    │
    ▼
Synced to
agent files
```

**Workflow Chain:**

```
Session reveals behavioral pattern
              │
              ▼
update-claude-learnings skill (this skill)
              │
              ▼
CLAUDE.md updated
              │
              ▼
Future sessions benefit from the rule
```

---

## Examples

### Example 1: Workflow Rule - Use Skills

**Session Issue:** Used `git add && git commit` instead of `/commit` skill.

**Learning Extraction:**
- Category: Workflow Rules
- Section: Use Available Skills
- Learning: "Use `/commit` instead of manual `git add && git commit`"

**Result:**
Added to CLAUDE.md under `## Workflow Rules > ### Use Available Skills`

### Example 2: Session Management

**Session Issue:** Complex task completed but no checkpoints provided.

**Learning Extraction:**
- Category: Session Management
- Section: Session Management
- Learning: "Provide checkpoint summaries every 3-5 edits on complex tasks"

**Result:**
Added to CLAUDE.md under `## Workflow Rules > ### Session Management`

### Example 3: Project-Specific Behavior

**Session Issue:** Edited files in `.claude/agents/` without running learnings sync.

**Learning Extraction:**
- Category: Behavioral Patterns
- Section: Behavioral Patterns
- Learning: "After editing agent files, run `/update-agent-learnings` to sync global learnings"

**Result:**
Added to CLAUDE.md under `## Behavioral Patterns`

### Example 4: Scope Redirect

**Session Issue:** User suggests adding "Run tests after code changes"

**Analysis:** This applies to subagents writing code, not main Claude Code behavior.

**Action:** Redirect to `/update-agent-learnings` instead of adding to CLAUDE.md.
