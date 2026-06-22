# Discovery Reference

Step-by-step procedures for discovering all available capabilities (skills, agents, plugins) using file system scanning and tool inspection.

## Why File System Discovery?

The file system is the **source of truth** for installed capabilities:

- Skills are directories in `.claude/skills/` with `SKILL.md` files
- Agents are defined in the Task tool's `subagent_type` options
- Plugins are tools prefixed with `mcp__`

This approach ensures:
- New capabilities are automatically discovered
- No hardcoded catalogs that go stale
- Discovery always reflects what's actually installed

---

## Skill Discovery

### Step 1: Find All Skill Directories

Use Glob to scan for SKILL.md files:

```
Glob: .claude/skills/*/SKILL.md
```

This returns paths like:
- `.claude/skills/commit/SKILL.md`
- `.claude/skills/create-pr/SKILL.md`
- `.claude/skills/start/SKILL.md`

**IMPORTANT - Naming Convention:** Skill files **MUST** be named `SKILL.md` (uppercase). The Glob pattern is case-sensitive. Using `skill.md` (lowercase) will cause the skill to be missed during discovery.

### Step 2: Extract Skill Name from Path

The skill name is the directory name:

| Path | Skill Name |
|------|------------|
| `.claude/skills/commit/SKILL.md` | `commit` |
| `.claude/skills/create-pr/SKILL.md` | `create-pr` |
| `.claude/skills/writing-tools/SKILL.md` | `writing-tools` |

### Step 3: Read Skill Description

Read the first 15 lines of each SKILL.md to extract the description:

```
Read: .claude/skills/[skill-name]/SKILL.md (lines 1-15)
```

Look for:
- The first `# Heading` line (skill title)
- The first paragraph after the heading (description)
- Or a line starting with `## Overview` or `## Purpose`

### Step 4: Build Skills List

Compile results into a table:

```markdown
| Skill | Description |
|-------|-------------|
| commit | Commit changes with intelligent conventional commit messages |
| create-pr | Create pull requests with validation |
| start | Mandatory workflow for every task |
```

---

## Agent Discovery

### Step 1: Read Task Tool Description

The Task tool description contains all available `subagent_type` options. Look for the agent catalog section.

### Step 2: Extract Agent Types

From the Task tool description, extract:
- Agent type name (e.g., `laravel-senior-engineer`)
- Brief description of what the agent does
- Tools available to that agent

### Common Agents

| Agent Type | Description | Tools |
|------------|-------------|-------|
| `laravel-senior-engineer` | Laravel/PHP backend development | All tools + context7 |
| `nextjs-senior-engineer` | Next.js/React applications | All tools + context7 |
| `express-senior-engineer` | Express.js APIs and middleware | All tools + context7 |
| `nodejs-cli-senior-engineer` | Node.js CLI tool development | All tools |
| `devops-aws-senior-engineer` | AWS infrastructure and CDK | All tools + context7 |
| `devops-docker-senior-engineer` | Docker containerization | All tools + context7 |
| `Plan` | Architecture and implementation planning | Read-only tools |
| `Explore` | Fast codebase exploration | Read-only tools |
| `general-purpose` | Multi-step research and complex tasks | All tools |

### Step 3: Build Agents List

Present as a table with type, description, and key use cases.

---

## Plugin Discovery

### Step 1: Scan Tool Names for MCP Prefix

All available tools with the `mcp__` prefix are MCP plugins.

Pattern: `mcp__<plugin-name>__<tool-name>`

### Step 2: Group Tools by Plugin

Example tool names:
- `mcp__mastra__mastraDocs`
- `mcp__mastra__mastraMigration`
- `mcp__context7__resolve-library-id`
- `mcp__context7__get-library-docs`

Grouped:
- **mastra**: `mastraDocs`, `mastraMigration`
- **context7**: `resolve-library-id`, `get-library-docs`

### Step 3: Extract Plugin Purpose

Read the description of one tool from each plugin to understand the plugin's purpose.

### Step 4: Build Plugins List

```markdown
| Plugin | Description | Tools |
|--------|-------------|-------|
| mastra | Mastra framework documentation | mastraDocs, mastraMigration, startMastraCourse |
| context7 | Library documentation lookup | resolve-library-id, get-library-docs |
```

---

## Complete Discovery Workflow

Execute these steps in order when the start skill is invoked:

### 1. Discover Skills

```
1. Glob: .claude/skills/*/SKILL.md
2. For each result:
   a. Extract skill name from path
   b. Read first 15 lines for description
3. Build skills table
```

### 2. Discover Agents

```
1. Read Task tool description
2. Extract subagent_type options
3. Build agents table
```

### 3. Discover Plugins

```
1. Scan all tool names for mcp__ prefix
2. Group by plugin name (segment between mcp__ and second __)
3. Extract purpose from tool descriptions
4. Build plugins table
```

### 4. Present Results

Output all three tables to the user with clear section headings.

### 5. Sync CLAUDE.md

Compare discovered capabilities against CLAUDE.md's `## Skills, Agents & Plugins` section and update if needed.

---

## Troubleshooting

### No Skills Found

If `Glob: .claude/skills/*/SKILL.md` returns empty:
- Verify the project has a `.claude/skills/` directory
- Check if skills are installed in a different location
- Skills may be at project root or in user's home directory

### Skill Not Discovered (But Directory Exists)

If a skill directory exists but isn't discovered:
- **Check filename casing**: Must be `SKILL.md` (uppercase), not `skill.md`
- The Glob pattern is case-sensitive on most file systems
- Fix: Rename the file to `SKILL.md`

### Missing Agents

If Task tool doesn't list expected agents:
- The agent may not be configured for this environment
- Check if the agent is a custom or workspace-specific agent

### No Plugins Found

If no `mcp__` prefixed tools exist:
- MCP servers may not be configured
- Check `.claude/settings.json` for MCP server configuration

---

## Example Output

After running discovery:

```
I'm using the start skill. Discovering capabilities from file system and tools...

**Available Skills:** (from .claude/skills/*/SKILL.md)
| Skill | Description |
|-------|-------------|
| commit | Commit changes with intelligent conventional commit messages |
| create-pr | Create pull requests with validation and formatting |
| start | Mandatory workflow establishing skills, agents, and context |
| git-merge-expert | Safe merging with CI checks, conflict resolution, rollback |
| git-merge-expert-worktree | Worktree-native merging with full lifecycle management |
| writing-tools | Create and edit skills with TDD methodology |
| writing-agents | Create and configure agent definitions |
| run-parallel-agents-feature-build | Orchestrate parallel agents for independent features |
| run-parallel-agents-feature-debug | Orchestrate parallel agents for debugging |
| map-project | Scan codebase and update CLAUDE.md with project-specific patterns |
| ast-grep | Structural code search using AST patterns |

**Available Agents:** (from Task tool subagent_type)
| Agent | Description |
|-------|-------------|
| laravel-senior-engineer | Laravel/PHP backend development |
| nextjs-senior-engineer | Next.js/React applications |
| express-senior-engineer | Express.js APIs and middleware |
| nodejs-cli-senior-engineer | Node.js CLI tool development |
| devops-aws-senior-engineer | AWS infrastructure and CDK |
| devops-docker-senior-engineer | Docker containerization |
| Plan | Architecture and implementation planning |
| Explore | Fast codebase exploration |
| general-purpose | Multi-step research and complex tasks |

**Available Plugins (MCP):** (from mcp__ prefixed tools)
| Plugin | Description | Tools |
|--------|-------------|-------|
| mastra | Mastra framework documentation | mastraDocs, mastraMigration, startMastraCourse |
| context7 | Library documentation lookup | resolve-library-id, get-library-docs |

Now, let's proceed with your task...
```
