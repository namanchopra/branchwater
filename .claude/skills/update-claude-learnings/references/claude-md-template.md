# CLAUDE.md Template

Use this template when creating a new CLAUDE.md for a project.

## Template

```markdown
# Claude Code Project Configuration

Project-specific instructions and behavioral rules for Claude Code.

---

## Workflow Rules

Rules for how Claude Code should operate in this project.

### Use Available Skills

Always use skills instead of manual commands when available:

- `/commit` instead of `git add && git commit`
- `/create-pr` instead of `gh pr create`
- `/start` at the beginning of sessions

### Session Management

- Provide checkpoint summaries every 3-5 edits on complex tasks
- Before session timeout risk, summarize progress and provide continuation notes
- Prioritize delivering a working solution over exploring alternatives

### Scope Control

- Make minimal, targeted changes for the requested task
- Ask before expanding scope to adjacent code
- Stop after completing the stated task

---

## Project Context

### Repository Purpose

[Describe what this project does]

### Key Directories

[List important directories and their purposes]

### Tech Stack

[List primary technologies used]

---

## Behavioral Patterns

Patterns derived from real sessions that improve Claude Code effectiveness.

[Add learnings here via `/update-claude-learnings`]

---

*Last updated: [date]*
```

## Section Descriptions

### Workflow Rules

Contains rules about how Claude Code should execute workflows:
- Which skills to use instead of manual commands
- Command patterns to follow
- Tool preferences

**Subsections:**
- `### Use Available Skills` - Skill usage rules
- `### Session Management` - Checkpoint, timeout, progress rules
- `### Scope Control` - Expansion, confirmation rules

### Project Context

Contains project-specific information Claude Code needs:
- What the project does
- Important directories
- Tech stack

This section is usually set up once and rarely updated.

### Behavioral Patterns

Contains learnings derived from real sessions:
- Patterns that emerged from usage
- Project-specific behaviors
- Custom rules for this project

This section grows over time via `/update-claude-learnings`.

## Adding to Each Section

### Workflow Rules

Add rules in imperative mood:
- "Use `/commit` instead of manual commits"
- "Run tests after any code change"
- "Ask before modifying configuration files"

### Behavioral Patterns

Add patterns with context:
- "[Pattern in imperative mood]"

Example:
- "After editing agent files, run `/update-agent-learnings` to sync global learnings"
