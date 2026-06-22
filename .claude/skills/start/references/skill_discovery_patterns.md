# Skill Discovery Patterns Reference

Comprehensive patterns for discovering, evaluating, and invoking relevant skills during the start workflow.

---

## Core Principle

**IF A SKILL EXISTS FOR YOUR TASK, YOU MUST USE IT.**

This is not optional. This is not negotiable. Missing an applicable skill = workflow failure.

---

## Skill Discovery Checklist

Before ANY task execution, complete this mental checklist:

### Phase 1: Immediate Skill Scan

```
☐ What is the user requesting?
☐ Is there a skill name that matches this request?
☐ Are there any keywords in the request that match skill domains?
☐ Have I seen a similar request before that used a skill?
```

### Phase 2: Domain Analysis

```
☐ What domain does this task fall into?
  ├─ Parallel work? → Check for parallel agents skills
  ├─ Framework-specific? → Check for framework skills
  ├─ Code pattern/structural search? → Check for ast-grep skill
  ├─ Testing? → Check for testing skills
  ├─ Documentation? → Check for doc generation skills
  ├─ Code review? → Check for review skills
  └─ Design/architecture? → Check for design skills

☐ Does my available skills list contain this domain?

☐ Does an MCP plugin provide tools relevant to this task?
  ├─ Scan tools prefixed with mcp__ for domain matches
  ├─ Documentation lookup? → Check for docs plugins (mastra, context7)
  ├─ Memory/context? → Check for memory plugins (claude-mem)
  └─ External services? → Check for service-specific plugins
```

### Phase 3: Task Type Analysis

```
☐ What type of task is this?
  ├─ Building multiple features → parallel build skill
  ├─ Debugging multiple issues → parallel debug skill
  ├─ Structural code search → ast-grep skill
  ├─ Git commits → commit skill
  ├─ Pull requests → create-pr skill
  ├─ Exploration/discovery → Explore agent
  ├─ Starting any work → start skill (currently active)
  └─ Other specialized work → Check other skills
```

### Phase 4: Rationalization Check

```
☐ Am I thinking any of these rationalizations?
  ├─ "This is too simple for a skill" → WRONG
  ├─ "I can do this quickly without a skill" → WRONG
  ├─ "The skill is overkill" → WRONG
  ├─ "Let me just gather info first" → WRONG
  └─ "I remember the skill content" → WRONG

If YES to any → STOP. Use the skill.
```

---

## Discovering Available Skills

**Skills are discovered from the file system, not from hardcoded catalogs.**

### How to Discover Skills

```
1. Glob: .claude/skills/*/SKILL.md
2. For each result:
   a. Extract skill name from directory path
   b. Read first 10-15 lines for description
3. Build list of available skills
```

See `references/discovery.md` for detailed discovery procedures.

### Common Skill Categories

| Category | Example Skills | Triggers |
|----------|---------------|----------|
| Git workflow | commit, create-pr, git-merge-expert, git-merge-expert-worktree | "commit", "PR", "branch", "merge" |
| Parallel execution | run-parallel-agents-feature-build, run-parallel-agents-feature-debug | 3+ independent tasks |
| Code search | ast-grep | "find pattern", "structural search" |
| Writing skills | writing-tools, writing-agents | create/edit skills or agents |
| Documentation | map-project | update docs after changes |

**Note:** This is not exhaustive. Always scan `.claude/skills/` for the actual available skills.

---

## Plugin Discovery (MCP)

### What Are Plugins?

Plugins are Claude Code extensions that provide additional capabilities through MCP servers.

**Plugins can provide:**
- **MCP tools** — Callable functions prefixed with `mcp__<plugin>__<tool>`
- **Skills** — Slash commands contributed by the plugin
- **System prompt additions** — Extra context injected into conversations

### How to Identify Plugins

Scan all available tools for the `mcp__` prefix:

```
mcp__<plugin-name>__<tool-name>
```

| Tool Name | Plugin | Tool |
|-----------|--------|------|
| `mcp__mastra__mastraDocs` | mastra | mastraDocs |
| `mcp__context7__resolve-library-id` | context7 | resolve-library-id |

### Plugin Matching for Tasks

| Task Domain | Look For Plugin |
|-------------|-----------------|
| Framework docs | mastra, context7 |
| Library APIs | context7 |
| Past context | memory plugins |

---

## Skill Matching Algorithm

```python
def should_use_skill(user_request, available_skills):
    # Phase 1: Universal skills (always check)
    if is_conversation_start() or is_new_task():
        return ("start", "MANDATORY")

    # Phase 2: Parallel work detection
    independent_tasks = count_independent_tasks(user_request)
    if independent_tasks >= 3:
        if contains_debugging_keywords(user_request):
            return ("run-parallel-agents-feature-debug", "HIGH")
        if contains_feature_keywords(user_request):
            return ("run-parallel-agents-feature-build", "HIGH")

    # Phase 3: Structural code search
    if requires_structural_code_search(user_request):
        return ("ast-grep", "HIGH")

    # Phase 4: Domain-specific skills
    for skill in available_skills:
        if matches_domain(user_request, skill):
            return (skill.name, "HIGH")

    # Phase 5: Exploration
    if is_exploration_task(user_request):
        return ("Explore agent", "MEDIUM")

    return (None, "NONE")
```

---

## Common Rationalization Traps

### Trap 1: "This is Too Simple"

**Thought:** "I don't need a skill for that."
**Reality:** Even single tasks should go through start workflow.
**Fix:** Use start skill, identify framework, delegate appropriately.

### Trap 2: "Let Me Explore First"

**Thought:** "Let me search the codebase before using a skill."
**Reality:** Exploration IS part of the start skill workflow.
**Fix:** Use start skill, which guides exploration properly.

### Trap 3: "I Remember the Skill"

**Thought:** "I know what to do, no need to re-read it."
**Reality:** Skills may have been updated.
**Fix:** Always use Skill tool to get latest version.

### Trap 4: "The Skill Is Overkill"

**Thought:** "Sure, there are 3 features, but they're simple."
**Reality:** If criteria match, you MUST use it.
**Fix:** Use the skill. Let it determine if delegation is appropriate.

---

## Skill Priority Matrix

| Priority | Skills | Condition |
|----------|--------|-----------|
| 1 (Always) | start | Conversation/task start |
| 2 (High) | run-parallel-agents-* | 3+ independent tasks |
| 3 (High) | ast-grep | Structural code search |
| 4 (Medium) | Domain-specific | Framework/domain match |
| 5 (Fallback) | Explore agent | Exploration tasks |

---

## Skill Announcement Template

Always announce skill usage:

```
"I'm using the [SKILL NAME] to [GOAL]."
```

**Examples:**
- "I'm using the start skill to plan this task."
- "I'm using the run-parallel-agents-feature-build skill to build these three features concurrently."
- "I'm using the commit skill to create a structured commit message."

---

## Red Flags: You're About to Skip a Skill

If you catch yourself thinking ANY of these, STOP:

❌ "This is just a quick question"
❌ "Let me gather info first"
❌ "This is too simple"
❌ "I can do this faster without a skill"
❌ "The skill won't help here"
❌ "I'll use the skill if it gets complex"

**If you think ANY red flag → Immediately scan skills again.**

---

## Skill Discovery Workflow

```
1. Read user request
   ↓
2. Mental skill scan
   ├─ Does ANY skill name match keywords?
   ├─ Does ANY skill domain match task domain?
   └─ Am I rationalizing skipping a skill?
   ↓
3. Plugin awareness scan
   ├─ Do ANY mcp__ tools match the task domain?
   └─ Note relevant plugins for execution
   ↓
4. If skill match found
   ├─ Use Skill tool to invoke skill
   ├─ Announce skill usage
   └─ Follow skill workflow exactly
   ↓
5. If NO skills match
   ├─ Proceed with start workflow
   ├─ Identify appropriate agent
   └─ Execute task
```

---

## Confidence Levels

| Confidence | Indicators | Action |
|------------|-----------|--------|
| High (90%+) | Clear keyword/domain match | Use skill immediately |
| Medium (60-89%) | Partial match | Use skill, mention assumption |
| Low (30-59%) | Weak indicators | Re-read skill description |
| Very Low (<30%) | No match | Verify not rationalizing, then skip |

---

## Edge Cases

### Skill Applies Mid-Task

**Scenario:** Started task, discovered it's 3 independent subtasks
**Action:** Stop, announce skill match, invoke skill, restart with workflow

### Multiple Skills Apply

**Scenario:** Both parallel agents AND framework skill apply
**Action:** Use higher priority skill, delegate to specialized agents within it

### Unclear If Skill Applies

**Scenario:** Can't determine if tasks are independent
**Action:** Use AskUserQuestion to clarify independence

---

## Summary

### Key Principles

1. **Always check for skills FIRST** - Before any work
2. **If even 1% chance a skill applies** - Read and use it
3. **Catch rationalizations** - Common traps that lead to skipping skills
4. **Announce usage** - Always tell user which skill you're using
5. **Follow exactly** - Don't deviate from skill workflows
6. **No exceptions** - If skill matches criteria, you MUST use it

### Quick Checklist

```
☐ Scanned all available skills (Glob .claude/skills/*/SKILL.md)
☐ Checked for keyword matches
☐ Checked for domain matches
☐ Scanned for relevant MCP plugins
☐ Verified I'm not rationalizing skipping
☐ If skill applies → Announced and invoked
☐ Following skill workflow exactly
```

**The existence of a skill for your task means that task has been solved before. Not using the skill = reinventing the wheel = failure.**

**Always. Check. For. Skills. First.**
