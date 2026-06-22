# Agent Learnings

Derived from Claude Code usage analytics (77k+ messages, 9k+ sessions).

---

## User Profile

- **Scale**: Power user with multi-agent orchestration workflows
- **Primary language**: TypeScript (141k+ lines)
- **Work style**: Balanced bug fixes/features, tolerates iterative progress
- **Task management**: 51k+ task operations (TaskCreate, TaskUpdate, Task)

---

## Key Friction Points

| Friction | Frequency | Root Cause |
|----------|-----------|------------|
| Excessive changes | 131 instances | Claude over-scopes modifications beyond request |
| Scope creep | Multiple | Tangential work instead of focused execution |
| Premature endings | 261 partial vs 131 full | Sessions end before meaningful completion |
| Subagent noise | Frequent | Old notifications interrupt main workflow |

---

## Global Learnings

These learnings apply to ALL agents and should be synced to every agent file.

### Scope Control

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

### Session Management

- Provide checkpoint summaries every 3-5 edits on complex tasks
- Before session timeout risk, summarize progress and provide continuation notes
- Prioritize delivering a working solution over exploring alternatives
- If time is short, deliver partial working solution rather than incomplete exploration
- Don't get stuck in exploration mode - propose a concrete fix

**Prefer:**
- When editing multiple similar files, prefer sequential edits over parallel to avoid 'file modified since read' conflicts

### Multi-Agent Coordination

- When spawned as a subagent, focus exclusively on the delegated task
- Don't spawn additional subagents without explicit permission
- Report completion status clearly: "Task complete. Ready for next instruction."
- Acknowledge and dismiss stale notifications rather than context-switching
- Maintain focus on parent agent's primary request

### Autonomous Iteration

- For test failures: run tests -> analyze -> fix -> re-run (up to 5 cycles)
- For type errors: run tsc --noEmit -> fix -> re-run until clean
- For lint errors: run linter -> fix -> re-run until clean
- Report back only when: task complete, or stuck after N attempts
- Document iteration attempts for debugging

### Testing Integration

- After any code change, run the relevant test file if it exists
- For TypeScript files, run tsc --noEmit to catch type errors
- Validate changes work before marking task complete
- Mock stdin/stdout for interactive prompt tests in CLI tools

---

## Claude Code Only Learnings

These learnings apply ONLY to the main Claude Code agent. DO NOT propagate to subagent files.

Subagents (nodejs-cli-senior-engineer, fastapi-senior-engineer, etc.) focus on writing application code. They don't create skills, agents, or configuration files, so these learnings don't apply to them.

### Skills & Configuration

- When improving a skill or configuration file, read a reference example first to understand the quality bar and structural patterns expected

### Orchestration

*No learnings yet*

### Project Setup

*No learnings yet*

---

## Effective Patterns

### Read-Edit Ratio

User has 107k reads vs 82k edits (1.3:1 ratio). Optimize by:
- Using targeted Grep searches before reading entire files
- Jumping directly to relevant code via error messages or function names
- Avoiding excessive exploration when the fix location is known

### Partial Achievement Recovery

With 261 partial vs 131 full achievements:
- Break complex tasks into smaller, completable chunks
- Start sessions with explicit scope boundaries
- Use "Just fix X, don't refactor Y" framing
- Stop after first working version, iterate later

### Multi-Agent Success

With 51k+ task operations, multi-agent workflows succeed when:
- Each agent has clear, scoped responsibilities
- Parent agents maintain focus despite subagent notifications
- Completion is clearly signaled
- Handoffs include context summaries

---

## Agent-Specific Learnings

### nodejs-cli-senior-engineer

- Test --help output after commander.js changes
- Validate exit codes match expected behavior
- Run relevant test file after any CLI code change
- Use Pino logger for all output (structured, testable)

### TypeScript Agents (All)

- Run tsc --noEmit after edits to catch type errors early
- Prefer explicit types over inference for public APIs
- Use strict mode configuration

### DevOps Agents

- Validate infrastructure changes with dry-run before applying
- Document all resource changes in commit messages
- Test locally before deploying

---

## CLAUDE.md Recommendations

Add these to project CLAUDE.md for consistent behavior:

```markdown
## Session Management

- For bug fixes and feature work, deliver a working solution before session end
- If time is short, summarize progress and provide actionable continuation notes
- Don't get stuck in exploration mode - propose a concrete fix

## Scope Control

- Make minimal, targeted changes for the requested task
- Ask before expanding scope to adjacent code
- Stop after completing the stated task

## Multi-Agent Behavior

- When spawning sub-agents, maintain focus on the user's primary request
- Acknowledge and dismiss stale subagent notifications
- Report completion status clearly
```

---

*Last updated from usage analytics: 2026-02-05*
