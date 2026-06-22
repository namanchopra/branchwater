# Knowledge Reference

## CodeMap Tools

| Tool | Purpose |
|------|---------|
| `search_code("query")` | Semantic code search — find related code by concept |
| `search_symbols("name")` | Find functions, classes, types, interfaces by name |
| `get_file_summary("path")` | Get file overview before reading full content |

## Plan Format Parsing Rules

- Extracts frontmatter (YAML between `---` markers)
- Falls back to `# heading` for title if no frontmatter `title` key
- Parses sections by heading level
- Extracts task fields: id, title, description, priority, type, dependsOn, labels, acceptanceCriteria, effort, assignee
- Auto-generates IDs for sections without explicit `TASK-XXX` (but always include explicit IDs)
- Infers type from heading/body keywords if `**Type:**` not specified
- Default priority is P2 when not specified

## DAG Scheduling Behavior

- Constructs a DAG from task `dependsOn` arrays
- Uses Kahn's algorithm for topological sort with layer assignment
- Sorts within layers by priority (P0 first)
- Detects cycles and reports them
- Ready tasks are those whose dependencies are all complete — they can execute concurrently
- The critical path is the longest dependency chain
- Validation checks for cycles, missing deps, and isolated tasks

## TaskDefinition Interface

```typescript
interface TaskDefinition {
  id: string;              // "TASK-001"
  title: string;           // Task title
  description: string;     // Full description body
  priority: "P0" | "P1" | "P2" | "P3";
  type: "feature" | "bug" | "chore" | "refactor" | "test" | "docs" | "infra";
  dependsOn: string[];     // ["TASK-001", "TASK-002"]
  labels: string[];
  acceptanceCriteria: string[];
  effort?: "S" | "M" | "L" | "XL";
  agent: string;             // subagent type (e.g. "express-senior-engineer")
  assignee?: string;
}
```
