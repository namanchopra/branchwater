---
name: ast-grep
description: Guide for writing ast-grep rules to perform structural code search and analysis. Use when users need to search codebases using Abstract Syntax Tree (AST) patterns, find specific code structures, or perform complex code queries that go beyond simple text search. This skill should be used when users ask to search for code patterns, find specific language constructs, or locate code with particular structural characteristics.
---

<EXTREMELY-IMPORTANT>
Before writing ANY ast-grep rule, you **ABSOLUTELY MUST**:

1. Create example code that represents what you want to match
2. Use `--debug-query=cst` to understand the actual AST structure
3. Always add `stopBy: end` to relational rules (inside/has)
4. Test the rule against example code BEFORE searching the codebase
5. Escape metavariables in shell commands (\$VAR or use single quotes)

**Writing rules without testing = false negatives, missed matches, wasted time**

This is not optional. Every ast-grep search requires disciplined verification.
</EXTREMELY-IMPORTANT>

# ast-grep Code Search

## MANDATORY FIRST RESPONSE PROTOCOL

Before writing ANY ast-grep rule, you **MUST** complete this checklist:

1. ☐ **Verify ast-grep is installed** (run `ast-grep --version`)
2. ☐ **If not installed, provide installation instructions and STOP**
3. ☐ Clarify what the user wants to find (pattern, language, edge cases)
4. ☐ Create example code snippet representing the target pattern
5. ☐ Use `--debug-query=cst` to inspect the AST structure
6. ☐ Identify the correct `kind` values for target nodes
7. ☐ Write the simplest rule that could work (pattern first)
8. ☐ Add `stopBy: end` to any relational rules (inside/has)
9. ☐ Test rule against example code with `--stdin`
10. ☐ Announce: "Searching for [pattern description] using [rule type]"

**Writing ast-grep rules WITHOUT completing this checklist = missed matches.**

## Overview

This skill helps translate natural language queries into ast-grep rules for structural code search. ast-grep uses Abstract Syntax Tree (AST) patterns to match code based on its structure rather than just text, enabling powerful and precise code search across large codebases.

## Prerequisites Check

**CRITICAL: Before proceeding with any ast-grep search, verify ast-grep is installed.**

Check if ast-grep is available:

```bash
ast-grep --version
```

**If ast-grep is NOT installed:**

1. Inform the user: "ast-grep is not installed. Would you like installation instructions?"
2. If user confirms, provide installation instructions:

**macOS (Homebrew):**
```bash
brew install ast-grep
```

**Linux (Cargo):**
```bash
cargo install ast-grep
```

**npm (all platforms):**
```bash
npm install -g @ast-grep/cli
```

**Manual installation:**
```bash
# Download from GitHub releases
# https://github.com/ast-grep/ast-grep/releases
```

3. After installation, verify with `ast-grep --version`
4. Only proceed with ast-grep search after installation is confirmed

**Do NOT attempt to run ast-grep commands if it's not installed.**

## When to Use This Skill

Use this skill when users:
- Need to search for code patterns using structural matching (e.g., "find all async functions that don't have error handling")
- Want to locate specific language constructs (e.g., "find all function calls with specific parameters")
- Request searches that require understanding code structure rather than just text
- Ask to search for code with particular AST characteristics
- Need to perform complex code queries that traditional text search cannot handle

## General Workflow

Follow this process to help users write effective ast-grep rules:

### Step 0: Verify Installation (MANDATORY)

**Gate: ast-grep installed and verified before proceeding to Step 1.**

Before doing anything else, check if ast-grep is installed:

```bash
ast-grep --version
```

**If NOT installed:**
1. Stop immediately
2. Inform the user that ast-grep is required
3. Provide installation instructions (see Prerequisites Check section above)
4. Do NOT proceed until user confirms installation

**If installed:**
- Note the version for reference
- Proceed to Step 1

### Step 1: Understand the Query

**Gate: Pattern and language clarified before proceeding to Step 2.**

Clearly understand what the user wants to find. Ask clarifying questions if needed:
- What specific code pattern or structure are they looking for?
- Which programming language?
- Are there specific edge cases or variations to consider?
- What should be included or excluded from matches?

### Step 2: Create Example Code

**Gate: Example code saved to temp file before proceeding to Step 3.**

Write a simple code snippet that represents what the user wants to match. Save this to a temporary file for testing.

**Example:**
If searching for "async functions that use await", create a test file:

```javascript
// test_example.js
async function example() {
  const result = await fetchData();
  return result;
}
```

### Step 3: Write the ast-grep Rule

**Gate: Rule compiles without errors before proceeding to Step 4.**

Translate the pattern into an ast-grep rule. Start simple and add complexity as needed.

**Key principles:**
- Always use `stopBy: end` for relational rules (`inside`, `has`) to ensure search goes to the end of the direction
- Use `pattern` for simple structures
- Use `kind` with `has`/`inside` for complex structures
- Break complex queries into smaller sub-rules using `all`, `any`, or `not`

**Example rule file (test_rule.yml):**
```yaml
id: async-with-await
language: javascript
rule:
  kind: function_declaration
  has:
    pattern: await $EXPR
    stopBy: end
```

See `references/rule_reference.md` for comprehensive rule documentation.

### Step 4: Test the Rule

**Gate: Rule matches example code correctly before proceeding to Step 5.**

Use ast-grep CLI to verify the rule matches the example code. There are two main approaches:

**Option A: Test with inline rules (for quick iterations)**
```bash
echo "async function test() { await fetch(); }" | ast-grep scan --inline-rules "id: test
language: javascript
rule:
  kind: function_declaration
  has:
    pattern: await \$EXPR
    stopBy: end" --stdin
```

**Option B: Test with rule files (recommended for complex rules)**
```bash
ast-grep scan --rule test_rule.yml test_example.js
```

**Debugging if no matches:**
1. Simplify the rule (remove sub-rules)
2. Add `stopBy: end` to relational rules if not present
3. Use `--debug-query` to understand the AST structure (see below)
4. Check if `kind` values are correct for the language

### Step 5: Search the Codebase

**Gate: Results returned and reviewed before proceeding to Step 6.**

Once the rule matches the example code correctly, search the actual codebase:

**For simple pattern searches:**
```bash
ast-grep run --pattern 'console.log($ARG)' --lang javascript /path/to/project
```

**For complex rule-based searches:**
```bash
ast-grep scan --rule my_rule.yml /path/to/project
```

**For inline rules (without creating files):**
```bash
ast-grep scan --inline-rules "id: my-rule
language: javascript
rule:
  pattern: \$PATTERN" /path/to/project
```

## ast-grep CLI Commands

### Inspect Code Structure (--debug-query)

Dump the AST structure to understand how code is parsed:

```bash
ast-grep run --pattern 'async function example() { await fetch(); }' \
  --lang javascript \
  --debug-query=cst
```

**Available formats:**
- `cst`: Concrete Syntax Tree (shows all nodes including punctuation)
- `ast`: Abstract Syntax Tree (shows only named nodes)
- `pattern`: Shows how ast-grep interprets your pattern

**Use this to:**
- Find the correct `kind` values for nodes
- Understand the structure of code you want to match
- Debug why patterns aren't matching

**Example:**
```bash
# See the structure of your target code
ast-grep run --pattern 'class User { constructor() {} }' \
  --lang javascript \
  --debug-query=cst

# See how ast-grep interprets your pattern
ast-grep run --pattern 'class $NAME { $$$BODY }' \
  --lang javascript \
  --debug-query=pattern
```

### Test Rules (scan with --stdin)

Test a rule against code snippet without creating files:

```bash
echo "const x = await fetch();" | ast-grep scan --inline-rules "id: test
language: javascript
rule:
  pattern: await \$EXPR" --stdin
```

**Add --json for structured output:**
```bash
echo "const x = await fetch();" | ast-grep scan --inline-rules "..." --stdin --json
```

### Search with Patterns (run)

Simple pattern-based search for single AST node matches:

```bash
# Basic pattern search
ast-grep run --pattern 'console.log($ARG)' --lang javascript .

# Search specific files
ast-grep run --pattern 'class $NAME' --lang python /path/to/project

# JSON output for programmatic use
ast-grep run --pattern 'function $NAME($$$)' --lang javascript --json .
```

**When to use:**
- Simple, single-node matches
- Quick searches without complex logic
- When you don't need relational rules (inside/has)

### Search with Rules (scan)

YAML rule-based search for complex structural queries:

```bash
# With rule file
ast-grep scan --rule my_rule.yml /path/to/project

# With inline rules
ast-grep scan --inline-rules "id: find-async
language: javascript
rule:
  kind: function_declaration
  has:
    pattern: await \$EXPR
    stopBy: end" /path/to/project

# JSON output
ast-grep scan --rule my_rule.yml --json /path/to/project
```

**When to use:**
- Complex structural searches
- Relational rules (inside, has, precedes, follows)
- Composite logic (all, any, not)
- When you need the power of full YAML rules

**Tip:** For relational rules (inside/has), always add `stopBy: end` to ensure complete traversal.

## Tips for Writing Effective Rules

### Always Use stopBy: end

For relational rules, always use `stopBy: end` unless there's a specific reason not to:

```yaml
has:
  pattern: await $EXPR
  stopBy: end
```

This ensures the search traverses the entire subtree rather than stopping at the first non-matching node.

### Start Simple, Then Add Complexity

Begin with the simplest rule that could work:
1. Try a `pattern` first
2. If that doesn't work, try `kind` to match the node type
3. Add relational rules (`has`, `inside`) as needed
4. Combine with composite rules (`all`, `any`, `not`) for complex logic

### Use the Right Rule Type

- **Pattern**: For simple, direct code matching (e.g., `console.log($ARG)`)
- **Kind + Relational**: For complex structures (e.g., "function containing await")
- **Composite**: For logical combinations (e.g., "function with await but not in try-catch")

### Debug with AST Inspection

When rules don't match:
1. Use `--debug-query=cst` to see the actual AST structure
2. Check if metavariables are being detected correctly
3. Verify the node `kind` matches what you expect
4. Ensure relational rules are searching in the right direction

### Escaping in Inline Rules

When using `--inline-rules`, escape metavariables in shell commands:
- Use `\$VAR` instead of `$VAR` (shell interprets `$` as variable)
- Or use single quotes: `'$VAR'` works in most shells

**Example:**
```bash
# Correct: escaped $
ast-grep scan --inline-rules "rule: {pattern: 'console.log(\$ARG)'}" .

# Or use single quotes
ast-grep scan --inline-rules 'rule: {pattern: "console.log($ARG)"}' .
```

## Common Use Cases

### Find Functions with Specific Content

Find async functions that use await:
```bash
ast-grep scan --inline-rules "id: async-await
language: javascript
rule:
  all:
    - kind: function_declaration
    - has:
        pattern: await \$EXPR
        stopBy: end" /path/to/project
```

### Find Code Inside Specific Contexts

Find console.log inside class methods:
```bash
ast-grep scan --inline-rules "id: console-in-class
language: javascript
rule:
  pattern: console.log(\$\$\$)
  inside:
    kind: method_definition
    stopBy: end" /path/to/project
```

### Find Code Missing Expected Patterns

Find async functions without try-catch:
```bash
ast-grep scan --inline-rules "id: async-no-trycatch
language: javascript
rule:
  all:
    - kind: function_declaration
    - has:
        pattern: await \$EXPR
        stopBy: end
    - not:
        has:
          pattern: try { \$\$\$ } catch (\$E) { \$\$\$ }
          stopBy: end" /path/to/project
```

## Resources

### references/
Contains detailed documentation for ast-grep rule syntax:
- `rule_reference.md`: Comprehensive ast-grep rule documentation covering atomic rules, relational rules, composite rules, and metavariables

Load these references when detailed rule syntax information is needed.

---

## Step 6: Verification (MANDATORY)

After searching the codebase, verify the complete workflow:

### Check 1: Rule Matches Example
- [ ] Rule matches the example code created in Step 2
- [ ] No false negatives on known examples

### Check 2: Results Are Valid
- [ ] Spot-check 3-5 results to confirm they match intent
- [ ] No obvious false positives

### Check 3: Edge Cases Covered
- [ ] Rule handles variations mentioned by user
- [ ] Nested cases handled (if applicable)

### Check 4: Rule Is Reproducible
- [ ] Rule can be re-run with same results
- [ ] Rule file or inline command documented for user

### Check 5: Results Reported
- [ ] Match count reported to user
- [ ] File paths and line numbers provided
- [ ] Example matches shown

**Gate:** Do NOT mark search complete until all 5 checks pass.

---

## Quality Checklist (Must Score 8/10)

Score yourself honestly before marking search complete:

### Query Understanding (0-2 points)
- **0 points:** Wrote rule without clarifying requirements
- **1 point:** Partial clarification (language or pattern, not both)
- **2 points:** Full clarification: pattern, language, edge cases, exclusions

### Example Code (0-2 points)
- **0 points:** No example code created
- **1 point:** Example code in memory only (not tested)
- **2 points:** Example code saved and verified with --debug-query

### Rule Quality (0-2 points)
- **0 points:** Rule doesn't compile or match anything
- **1 point:** Rule matches but missing stopBy: end on relational rules
- **2 points:** Rule is minimal, correct, uses stopBy: end where needed

### Testing (0-2 points)
- **0 points:** Searched codebase without testing
- **1 point:** Tested but didn't verify against example
- **2 points:** Tested against example with --stdin, verified matches

### Result Validation (0-2 points)
- **0 points:** Returned results without checking
- **1 point:** Checked count only
- **2 points:** Spot-checked results, confirmed they match intent

**Minimum passing score: 8/10**

---

## Common Rationalizations (All Wrong)

These are excuses. Don't fall for them:

- **"I know the AST structure"** → STILL use --debug-query=cst to verify
- **"It's a simple pattern"** → STILL test against example code first
- **"stopBy: end slows it down"** → STILL add it to relational rules (correctness > speed)
- **"The rule compiled"** → STILL verify it matches the example
- **"I'll check the results later"** → Spot-check NOW before returning them
- **"This is similar to a previous search"** → STILL write fresh example code
- **"The user knows what they want"** → STILL clarify language and edge cases
- **"Inline rules are harder"** → Learn to escape \$VAR properly, it's not optional

---

## Failure Modes

### Failure Mode 1: Missing stopBy: end
**Symptom:** Relational rule (inside/has) returns no matches even though they exist
**Fix:** Add `stopBy: end` to ensure search traverses the entire subtree

### Failure Mode 2: Wrong Node Kind
**Symptom:** Pattern doesn't match even though code looks correct
**Fix:** Use `--debug-query=cst` to find the actual kind name (e.g., `arrow_function` vs `function_declaration`)

### Failure Mode 3: Metavariable Not Detected
**Symptom:** `$VAR` appears literally in output instead of matching
**Fix:** Ensure metavariable is the only content in its AST node; use `--debug-query=pattern` to verify

### Failure Mode 4: Shell Escaping Issues
**Symptom:** Inline rule fails with "unexpected token" or empty results
**Fix:** Escape `$` as `\$` in double quotes, or use single quotes around the pattern

### Failure Mode 5: Wrong Language
**Symptom:** Rule matches nothing in a codebase that clearly has the pattern
**Fix:** Verify `--lang` flag matches file extension (e.g., `typescript` not `javascript` for `.tsx` files)

---

## Quick Workflow Summary

```
STEP 0: VERIFY INSTALLATION (MANDATORY)
├── Run ast-grep --version
├── If NOT installed: provide instructions and STOP
├── If installed: note version and proceed
└── Gate: ast-grep installed and verified

STEP 1: UNDERSTAND THE QUERY
├── What pattern to find?
├── Which programming language?
├── Any edge cases or exclusions?
└── Gate: Pattern and language clarified

STEP 2: CREATE EXAMPLE CODE
├── Write code snippet that should match
├── Save to temp file (test_example.js/ts/py)
├── Run --debug-query=cst to see AST structure
└── Gate: Example code created and AST understood

STEP 3: WRITE THE AST-GREP RULE
├── Start simple: try pattern first
├── If complex: use kind + relational rules
├── Always add stopBy: end to inside/has
├── Combine with all/any/not as needed
└── Gate: Rule compiles without errors

STEP 4: TEST THE RULE
├── Test with --stdin against example code
├── Verify matches are correct
├── Adjust rule if needed
├── Iterate until example matches
└── Gate: Rule matches example correctly

STEP 5: SEARCH THE CODEBASE
├── Run ast-grep scan or run
├── Review results count
├── Spot-check 3-5 results
└── Gate: Results returned and validated

STEP 6: VERIFICATION
├── Check 1: Rule matches example
├── Check 2: Results are valid
├── Check 3: Edge cases covered
├── Check 4: Rule is reproducible
├── Check 5: Results reported
└── Gate: All 5 checks pass
```

---

## Completion Announcement

When ast-grep search is complete, announce:

```
ast-grep search complete.

**Quality Score: X/10**
- Query Understanding: X/2
- Example Code: X/2
- Rule Quality: X/2
- Testing: X/2
- Result Validation: X/2

**Search:**
- Pattern: [description]
- Language: [language]
- Rule type: [pattern/kind+relational/composite]

**Results:**
- Matches: [count]
- Files: [file count]

**Example matches:**
[Show 2-3 example file:line matches]

**Rule (for re-use):**
```yaml
[The rule used]
```

**Next steps:**
[Review matches, refine search, or proceed with refactoring]
```

---

## Integration with Other Skills

The `ast-grep` skill integrates with:

- **`start`** — Use `start` to identify if ast-grep is the right tool for the search
- **`Grep` tool** — Use Grep for text search; use ast-grep for structural search
- **`Explore` agent** — Use Explore for broad discovery; use ast-grep for precise patterns

**When to use ast-grep vs Grep:**

| Scenario | Tool |
|----------|------|
| Find text "TODO" anywhere | Grep |
| Find function calls with specific structure | ast-grep |
| Find variable names matching regex | Grep |
| Find async functions without try-catch | ast-grep |
| Find imports from specific package | Either (ast-grep more precise) |
| Find code patterns across language constructs | ast-grep |

**Workflow Chain:**

```
User asks "find X"
       │
       ▼
Is X structural (AST-level)?
       │
  Yes──┼──No
       │     │
       ▼     ▼
  ast-grep  Grep/Explore
```

**Escalation Pattern:**

If ast-grep rule becomes too complex (5+ nested conditions), consider:
1. Breaking into multiple simpler searches
2. Using Explore agent for discovery first
3. Asking user to narrow the pattern
