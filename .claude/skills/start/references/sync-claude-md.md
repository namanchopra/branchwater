# Sync CLAUDE.md Reference

Guide for updating CLAUDE.md with discovered capabilities after running the start skill's discovery process.

## Purpose

After discovering skills, agents, and plugins, CLAUDE.md should be updated to reflect the current state. This ensures:

- Documentation stays current as capabilities are installed/removed
- Users can reference CLAUDE.md for available capabilities
- Future sessions start with accurate capability information

---

## Target Section

CLAUDE.md should have a `## Skills, Agents & Plugins` section with three tables:

1. **Available Skills** - Skills discovered from `.claude/skills/*/SKILL.md`
2. **Available Agents** - Agents from Task tool subagent_type options
3. **Available MCP Plugins** - Plugins discovered from `mcp__` prefixed tools

---

## Section Template

```markdown
## Skills, Agents & Plugins

### Available Skills

| Skill | Description |
|-------|-------------|
| commit | Commit changes with intelligent conventional commit messages |
| create-pr | Create pull requests with validation and formatting |
| start | Mandatory workflow establishing skills, agents, and context |
| [skill-name] | [description from SKILL.md] |

### Available Agents

| Agent | Description |
|-------|-------------|
| laravel-senior-engineer | Laravel/PHP backend development |
| nextjs-senior-engineer | Next.js/React applications |
| express-senior-engineer | Express.js APIs and middleware |
| Plan | Architecture and implementation planning |
| Explore | Fast codebase exploration |
| general-purpose | Multi-step research and complex tasks |
| [agent-type] | [description from Task tool] |

### Available MCP Plugins

| Plugin | Description | Key Tools |
|--------|-------------|-----------|
| mastra | Mastra framework documentation | mastraDocs, mastraMigration |
| context7 | Library documentation lookup | resolve-library-id, get-library-docs |
| [plugin-name] | [purpose] | [tool1, tool2] |
```

---

## Sync Process

### Step 1: Read Current CLAUDE.md

```
Read: CLAUDE.md
```

Find the `## Skills, Agents & Plugins` section. Note:
- Does the section exist?
- What capabilities are currently listed?
- Is the format correct (tables with proper columns)?

### Step 2: Compare Against Discovery Results

Create a comparison checklist:

**Skills:**
- [ ] All discovered skills are in the table
- [ ] No obsolete skills (removed but still listed)
- [ ] Descriptions are accurate and concise

**Agents:**
- [ ] All available agents are in the table
- [ ] Agent descriptions match their actual purpose

**Plugins:**
- [ ] All discovered plugins are in the table
- [ ] Tools listed for each plugin are accurate

### Step 3: Determine Required Updates

Identify:
- **Missing entries** - Discovered but not in CLAUDE.md
- **Obsolete entries** - In CLAUDE.md but not discovered
- **Incorrect entries** - Listed but description is wrong

### Step 4: Apply Updates Using Edit Tool

**Adding a missing skill:**

```
Edit CLAUDE.md:
old_string: "| start | Mandatory workflow establishing skills, agents, and context |"
new_string: "| start | Mandatory workflow establishing skills, agents, and context |
| new-skill | Description of the new skill |"
```

**Removing an obsolete entry:**

```
Edit CLAUDE.md:
old_string: "| obsolete-skill | Old description |
"
new_string: ""
```

**Correcting a description:**

```
Edit CLAUDE.md:
old_string: "| skill-name | Old incorrect description |"
new_string: "| skill-name | New accurate description |"
```

---

## Handling Edge Cases

### Section Doesn't Exist

If CLAUDE.md lacks the `## Skills, Agents & Plugins` section, add it:

1. Find the end of the existing content (or an appropriate location)
2. Use Edit tool to add the complete section with all three tables

### Section Has Wrong Format

If the section exists but uses a different format (bullets vs tables):
1. Preserve the information
2. Convert to the table format for consistency

### Partial Updates

If only some capabilities changed:
1. Only edit the affected rows
2. Don't rewrite the entire section unnecessarily

---

## Best Practices

### Keep Entries Concise

| Good | Bad |
|------|-----|
| `Commit changes with conventional messages` | `This skill analyzes your changes and creates a commit message following conventional commit standards` |
| `Next.js/React applications` | `Agent for building Next.js applications with React Server Components, Server Actions, and App Router` |

### Maintain Alphabetical Order

Sort entries alphabetically within each table for easy scanning.

### Use Consistent Descriptions

Match the tone and style of existing entries. If most descriptions start with verbs, new entries should too.

### Verify After Editing

After making edits, read the section again to verify:
- Tables render correctly (proper markdown)
- No duplicate entries
- All columns aligned

---

## Example Sync Session

**Discovered:**
- Skills: commit, create-pr, start, git-merge-expert, writing-tools
- Agents: laravel-senior-engineer, nextjs-senior-engineer, Plan, Explore
- Plugins: mastra (mastraDocs, mastraMigration), context7 (resolve-library-id)

**Current CLAUDE.md has:**
- Skills: commit, create-pr, start (missing git-merge-expert, writing-tools)
- Agents: laravel-senior-engineer, nextjs-senior-engineer (missing Plan, Explore)
- Plugins: mastra (correct)

**Sync actions:**
1. Add `git-merge-expert` and `writing-tools` to skills table
2. Add `Plan` and `Explore` to agents table
3. Add `context7` to plugins table

**Result:** CLAUDE.md now accurately reflects all discovered capabilities.

---

## Validation Checklist

After syncing, verify:

- [ ] All discovered skills appear in the skills table
- [ ] All available agents appear in the agents table
- [ ] All discovered plugins appear in the plugins table
- [ ] No duplicate entries exist
- [ ] Table markdown is valid (renders correctly)
- [ ] Descriptions are accurate and concise
- [ ] Order is alphabetical (optional but preferred)
