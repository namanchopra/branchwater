# Skill Learnings

Learnings about creating and improving Claude Code skills.

---

## Structural Patterns

Patterns that high-quality skills share.

### Required Sections

- `<EXTREMELY-IMPORTANT>` warning block after frontmatter
- MANDATORY FIRST RESPONSE PROTOCOL checklist
- Purpose section explaining what skill does/doesn't do
- Gate checkpoints between all workflow steps
- Quality Checklist (Must Score 8/10)
- Common Rationalizations (All Wrong) section
- Failure Modes section with symptoms and fixes
- Quick Workflow Summary (ASCII diagram)
- Completion Announcement template
- Integration with Other Skills section
- Safety Rules table

### Quality Signals

- When improving a skill, read a reference example first to understand the quality bar and structural patterns expected
- Frontmatter `name` must match directory name exactly
- Steps should have numbered workflow with clear gates
- Include error handling guidance
- Provide concrete examples, not just abstract rules

---

## Content Patterns

What to include in skill content.

### Clarity

- Use imperative mood for instructions
- Provide specific, actionable steps (not vague guidance)
- Include "When to Use" and "When NOT to Use" sections
- Show example outputs/announcements

### User Interaction

- Specify when to ask for user confirmation
- Include AskUserQuestion patterns where decisions are needed
- Never skip verification steps even when "obvious"

---

## Anti-Patterns

Common mistakes to avoid in skills.

### Structure

- Missing `<EXTREMELY-IMPORTANT>` block
- No gate checkpoints between steps
- No quality scoring system
- Bash code blocks that look executable but are meant as instructions

### Content

- Vague instructions without concrete examples
- Missing error handling for edge cases
- No failure modes documentation
- No integration guidance with other skills

---

## Skill-Specific Learnings

### commit

*No specific learnings yet*

### create-pr

*No specific learnings yet*

### start

*No specific learnings yet*

### ulpi-generate-hooks

- Apply same structural patterns as commit/create-pr/start for consistency

### update-agent-learnings

- Distinguish between learnings for subagents vs Claude Code only
- Not all learnings should propagate to all files

---

*Last updated: 2026-02-05*
