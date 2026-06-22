---
name: update-agent-learnings
description: Extract learnings from a session and propagate them to appropriate agent files based on scope (Global for all subagents, Claude Code Only for main agent, or Agent-Specific). Use when a session revealed patterns, mistakes, or insights. Invoke via /update-agent-learnings or after challenging sessions.
---

# Update Agent Learnings

## Overview

Extract learnings from the current session and systematically propagate them to:
1. The central learnings repository (`.claude/learnings/agent-learnings.md`)
2. Appropriate agent files based on learning scope

**IMPORTANT: Not all learnings apply to all agents.**

- **Subagent learnings** (Global, Agent-Specific): Apply to specialized engineer agents that write application code
- **Claude Code learnings**: Apply only to the main Claude Code agent, NOT propagated to subagents

This creates a feedback loop that improves agent behavior over time based on real-world session outcomes.

## When to Use

- After a challenging session where things went wrong
- When patterns emerge that should inform future behavior
- After discovering anti-patterns or better approaches
- When user provides feedback about agent behavior
- Invoke via `/update-learnings` command

## Phase 1: Session Analysis

**Gate: Identify at least one concrete learning before proceeding.**

Review the current conversation/session:

1. **Identify challenges encountered:**
   - What problems occurred during the session?
   - What mistakes were made?
   - What took multiple attempts to get right?

2. **Look for patterns:**
   - Over-scoping (changing more than requested)
   - Session management issues (premature endings, lost context)
   - Coordination problems (subagent noise, focus issues)
   - Testing gaps (missing validation, broken tests)
   - Scope creep (tangential work)

3. **Categorize findings:**
   - Is this a global learning (applies to ALL agents)?
   - Is this agent-specific (only relevant to one type of agent)?

## Phase 2: Learning Extraction

**Gate: User confirms extracted learnings before proceeding.**

Present findings to user and ask for confirmation:

```
I identified the following learnings from this session:

**Global Learnings:**
1. [Category]: [Learning description]
   - Action type: Always/Never/Prefer

**Agent-Specific Learnings (if any):**
1. [Agent name]: [Learning description]

Should I add these to the learnings system?
```

Use AskUserQuestion to:
- Confirm the extracted learnings are accurate
- Allow user to refine or add additional learnings
- Get approval before making changes

### Learning Classification

Each learning should specify:

| Field | Options | Description |
|-------|---------|-------------|
| **Category** | Scope Control, Session Management, Multi-Agent Coordination, Autonomous Iteration, Testing Integration, Other | Where does this learning fit? |
| **Scope** | Global, Claude Code Only, or [Agent Name] | Who does this learning apply to? |
| **Action Type** | Always, Never, Prefer | How strong is the directive? |

### Scope Decision Guide

**CRITICAL: Choose the correct scope. Not all learnings belong in subagent files.**

| Scope | When to Use | Propagate to Subagents? |
|-------|-------------|------------------------|
| **Global** | Learnings about writing code, testing, debugging, scope control | ✅ Yes - all subagents |
| **Claude Code Only** | Learnings about skills, agents, configuration files, orchestration | ❌ No - main agent only |
| **[Agent Name]** | Learnings specific to one technology/framework | ✅ Yes - that agent only |

**Examples of Claude Code Only learnings (DO NOT propagate to subagents):**
- Improving skills or configuration files
- Creating or modifying agent definitions
- Orchestrating multiple subagents
- Working with CLAUDE.md or project setup
- Meta-level patterns about how Claude Code works

**Examples of Global learnings (DO propagate to subagents):**
- Scope control when writing application code
- Testing practices for code changes
- Session management and checkpointing
- Multi-agent coordination as a subagent

**Ask yourself:** "Would a nodejs-cli-senior-engineer or fastapi-senior-engineer need this learning while writing application code?" If no, it's Claude Code Only.

## Phase 3: Update Central Learnings File

**Gate: Learnings file updated successfully before proceeding.**

1. Read current `.claude/learnings/agent-learnings.md`
2. Locate the appropriate section:
   - Global learnings go under `## Global Learnings` → appropriate category
   - Agent-specific learnings go under `## Agent-Specific Learnings` → appropriate agent
3. Add new learnings to the appropriate section
4. Write updated file

### File Structure

The learnings file should follow this structure:

```markdown
# Agent Learnings

## Global Learnings

These learnings apply to ALL subagents and should be synced to every agent file.

### Scope Control
- [learning items...]

### Session Management
- [learning items...]

### Multi-Agent Coordination
- [learning items...]

### Autonomous Iteration
- [learning items...]

### Testing Integration
- [learning items...]

---

## Claude Code Only Learnings

These learnings apply ONLY to the main Claude Code agent. DO NOT propagate to subagent files.

### Skills & Configuration
- [learnings about creating/improving skills, agents, configs...]

### Orchestration
- [learnings about coordinating subagents, workflows...]

### Project Setup
- [learnings about CLAUDE.md, project initialization...]

---

## Agent-Specific Learnings

### nodejs-cli-senior-engineer
- [learning specific to this agent...]

### nextjs-senior-engineer
- [learning specific to this agent...]

[...other agents as needed...]
```

## Phase 4: Propagate to Agents

**Gate: All agent files updated before proceeding.**

**CRITICAL: This phase requires a FULL SYNC of the `## Learnings` section, not just adding new learnings.**

**IMPORTANT: Only propagate learnings that apply to subagents. Skip "Claude Code Only" learnings.**

### Step 4.1: Read Central Learnings

First, read `.claude/learnings/agent-learnings.md` and extract:
1. All content under `## Global Learnings` (all categories: Scope Control, Session Management, etc.) → **Propagate to ALL subagents**
2. All content under `## Agent-Specific Learnings` (per-agent subsections) → **Propagate to THAT agent only**
3. All content under `## Claude Code Only Learnings` → **DO NOT propagate to any subagent files**

### Step 4.2: Process Each Agent File

For each agent in `.claude/agents/`:

1. **Read the agent file completely**

2. **Check if `## Learnings` section exists** by searching for the heading `## Learnings`

3. **If `## Learnings` section is MISSING:**
   - Find the `## Examples` section
   - Insert a complete `## Learnings` section BEFORE `## Examples`
   - The section must contain ALL global learnings from the central file
   - Include any agent-specific learnings for this agent

4. **If `## Learnings` section EXISTS:**
   - Replace the ENTIRE section content with fresh sync from central file
   - Do NOT just append - regenerate the full section to ensure consistency

5. **Verify the edit was successful** before moving to next agent

### Step 4.3: Section Placement

The `## Learnings` section MUST be placed:
- AFTER `## Rules` (and any subsections like `### AWS Security Best Practices`)
- BEFORE `## Examples`

Use this pattern to locate insertion point:
```
---

## Examples
```

Insert the Learnings section just before this pattern.

### Agent Learnings Section Format

**IMPORTANT: Generate this COMPLETE section for each agent. Do not skip any categories.**

```markdown
---

## Learnings

> Auto-synced from `.claude/learnings/agent-learnings.md`

### Global Learnings

#### Scope Control

**Always:**
- Confirm scope before making changes: "I'll modify X. Should I also update Y?"
- Make minimal, targeted edits for bug fixes - don't refactor adjacent code
- Stop after completing the stated task - don't continue to "improve" things
- Ask before expanding scope: "I noticed Z could also be improved. Want me to address it?"

**Never:**
- Make changes beyond the explicitly requested scope
- Refactor working code while fixing a bug
- Add "improvements" that weren't requested
- Continue with tangential work after completing the main task

#### Session Management

- Provide checkpoint summaries every 3-5 edits on complex tasks
- Before session timeout risk, summarize progress and provide continuation notes
- Prioritize delivering a working solution over exploring alternatives
- If time is short, deliver partial working solution rather than incomplete exploration
- Don't get stuck in exploration mode - propose a concrete fix

**Prefer:**
- When editing multiple similar files, prefer sequential edits over parallel to avoid 'file modified since read' conflicts

#### Multi-Agent Coordination

- When spawned as a subagent, focus exclusively on the delegated task
- Don't spawn additional subagents without explicit permission
- Report completion status clearly: "Task complete. Ready for next instruction."
- Acknowledge and dismiss stale notifications rather than context-switching
- Maintain focus on parent agent's primary request

#### Autonomous Iteration

- For test failures: run tests -> analyze -> fix -> re-run (up to 5 cycles)
- For type errors: run tsc --noEmit -> fix -> re-run until clean
- For lint errors: run linter -> fix -> re-run until clean
- Report back only when: task complete, or stuck after N attempts
- Document iteration attempts for debugging

#### Testing Integration

- After any code change, run the relevant test file if it exists
- For TypeScript files, run tsc --noEmit to catch type errors
- Validate changes work before marking task complete
- Mock stdin/stdout for interactive prompt tests in CLI tools

### Agent-Specific Learnings

- [Include learnings from central file for this specific agent]
- [If no agent-specific learnings exist, write: "No agent-specific learnings yet."]
```

### Agent Files to Update

Process these files in order (sequentially, not in parallel):

1. `devops-aws-senior-engineer.md`
2. `devops-docker-senior-engineer.md`
3. `expo-react-native-engineer.md`
4. `express-senior-engineer.md`
5. `fastapi-senior-engineer.md`
6. `laravel-senior-engineer.md`
7. `nextjs-senior-engineer.md`
8. `nodejs-cli-senior-engineer.md`
9. `python-senior-engineer.md`

### Agent-Specific Learnings Reference

Copy these from the central learnings file:

| Agent | Specific Learnings |
|-------|-------------------|
| nodejs-cli-senior-engineer | Test --help output after commander.js changes; Validate exit codes; Use Pino logger |
| TypeScript agents (nextjs, express, expo) | Run tsc --noEmit after edits; Prefer explicit types; Use strict mode |
| DevOps agents (aws, docker) | Validate with dry-run; Document resource changes; Test locally first |
| python-senior-engineer | No agent-specific learnings yet |
| laravel-senior-engineer | No agent-specific learnings yet |
| fastapi-senior-engineer | No agent-specific learnings yet |

## Phase 5: Verification

**Gate: All checks pass before marking complete.**

### Step 5.1: Verify Learnings Section Exists

Run this command to verify ALL agent files have the `## Learnings` section:

```bash
grep -l "^## Learnings" .claude/agents/*.md | wc -l
```

**Expected result: 9** (one for each agent file)

If the count is less than 9, identify which files are missing and fix them.

### Step 5.2: Verify Section Content

For each agent file, verify the Learnings section contains:
- `### Global Learnings` header
- `#### Scope Control` subsection
- `#### Session Management` subsection
- `#### Multi-Agent Coordination` subsection
- `#### Autonomous Iteration` subsection
- `#### Testing Integration` subsection
- `### Agent-Specific Learnings` header

### Step 5.3: Display Summary

```
Learnings Update Complete

**Central Learnings File:**
- Added X global learning(s)
- Added Y agent-specific learning(s)

**Agent Files Updated:**
- [agent-name.md]: ✓ Learnings section verified
- [agent-name.md]: ✓ Learnings section verified
[...for each agent...]

**Verification Results:**
- grep "^## Learnings" count: 9/9 ✓
- Central file structure valid ✓
- All agent files have complete Learnings section ✓
```

## Quality Checklist

Before marking the update complete, verify:

- [ ] Learnings are actionable (not vague observations)
- [ ] Learnings use imperative mood ("Do X" not "Should do X")
- [ ] Category assignment is appropriate
- [ ] Global vs agent-specific classification is correct
- [ ] No duplicate learnings added
- [ ] Central file structure is preserved
- [ ] **CRITICAL: Run `grep "^## Learnings" .claude/agents/*.md` to verify ALL agent files have the `## Learnings` section**
- [ ] Each agent's Learnings section contains ALL global learning categories (Scope Control, Session Management, Multi-Agent Coordination, Autonomous Iteration, Testing Integration)
- [ ] Agent-specific learnings are included where applicable

## Examples

### Example 1: Adding a Global Scope Control Learning

**Session Issue:** Agent modified test files when only asked to fix production code.

**Learning Extraction:**
- Category: Scope Control
- Scope: Global
- Action Type: Never
- Learning: "Never modify test files unless explicitly requested, even if tests are failing due to production changes"

**Result:**
1. Added to `.claude/learnings/agent-learnings.md` under Global Learnings → Scope Control
2. Synced to all 8 agent files under their `## Learnings` section

### Example 2: Adding an Agent-Specific Learning

**Session Issue:** Node.js CLI agent used console.log instead of Pino logger.

**Learning Extraction:**
- Category: Testing Integration
- Scope: nodejs-cli-senior-engineer
- Action Type: Always
- Learning: "Always verify Pino logger is used instead of console.log when reviewing CLI code changes"

**Result:**
1. Added to `.claude/learnings/agent-learnings.md` under Agent-Specific Learnings → nodejs-cli-senior-engineer
2. Added only to `nodejs-cli-senior-engineer.md` under Agent-Specific Learnings

### Example 3: Adding a Claude Code Only Learning (NOT propagated to subagents)

**Session Issue:** Improved a skill without first reading a reference skill for quality patterns.

**Learning Extraction:**
- Category: Skills & Configuration
- Scope: Claude Code Only
- Action Type: Always
- Learning: "When improving a skill or configuration file, read a reference example first to understand the quality bar and structural patterns expected"

**Result:**
1. Added to `.claude/learnings/agent-learnings.md` under Claude Code Only Learnings → Skills & Configuration
2. **NOT propagated to any subagent files** (nodejs-cli, fastapi, etc. don't create skills)

**Why Claude Code Only?** This learning is about meta-work (improving skills/configs) that only the main Claude Code agent does. The specialized engineer agents (nodejs-cli-senior-engineer, fastapi-senior-engineer, etc.) focus on writing application code, not on creating or improving Claude Code skills.

## Integration with Other Skills

This skill works well after:
- **`commit`** — After committing, reflect on what went wrong during the session
- **`create-pr`** — After PR creation, capture learnings about the implementation process
- **`start`** — At session start, review existing learnings

## Safety Rules

| Rule | Reason |
|------|--------|
| Always get user confirmation before writing | Ensures learnings are accurate and desired |
| Never delete existing learnings | Preserve institutional knowledge |
| Preserve file structure when editing | Maintains compatibility with other tools |
| Keep learnings concise and actionable | Prevents bloat and ensures usability |
