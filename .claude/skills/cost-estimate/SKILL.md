---
name: cost-estimate
description: Estimate development cost of a codebase (full repo, branch diff, or single commit). Invoke via /cost-estimate or when user says "estimate cost", "how much would this cost", "development cost". Accepts optional scope args like "branch:feat/foo" or "commit:abc1234".
---

# Cost Estimate Command

You are a senior software engineering consultant tasked with estimating the development cost of code in the current repository.

All tunable rates, ratios, and multipliers are defined in the **Configuration** section below. When performing calculations in later steps, always reference these values — do not use hardcoded numbers elsewhere. To customize the estimate for a different market, team structure, or role mix, edit only this section.

## Configuration

All cost parameters in one place. Edit these to adjust the entire estimate.

### Coding Productivity Rates (lines/hour, pure focused output)

| Code Category | Low | High | Examples |
|---------------|-----|------|----------|
| Simple CRUD/UI/boilerplate | 50 | 80 | Forms, lists, repetitive layouts, config screens |
| Standard views with logic | 35 | 55 | Typical screens, moderate complexity views |
| Complex UI (animations, custom) | 25 | 40 | Onboarding flows, custom components, transitions |
| Business logic / API clients | 30 | 50 | Networking, state management, data transforms |
| Database/persistence | 30 | 50 | CRUD, migrations, queries, schema definitions |
| Audio/video processing | 20 | 30 | AV pipelines, streaming, encoding/decoding |
| GPU/shader programming | 15 | 25 | Metal, CUDA, render pipelines, compute shaders |
| Native C/C++ interop | 15 | 25 | FFI, bridging, unsafe code, native plugins |
| System extensions/plugins | 15 | 25 | OS extensions, daemons, drivers, kernel modules |
| On-device ML inference | 15 | 25 | CoreML, MLX, ONNX, model integration |
| Tests | 50 | 80 | Tests are boilerplate-heavy with assertions |
| Config/build files | 40 | 60 | Build configs, CI/CD, manifests, project files |
| Documentation | 60 | 100 | Markdown, READMEs, API docs, comments-only files |

### Development Overhead Multipliers (% of base coding hours)

| Overhead Category | Low | High | Notes |
|-------------------|-----|------|-------|
| Architecture & design | 12% | 15% | Upfront design, API contracts, data modeling |
| Debugging & troubleshooting | 20% | 25% | Bug fixing, edge cases, platform quirks |
| Code review & refactoring | 8% | 12% | PR reviews, cleanup passes, tech debt |
| Documentation | 5% | 8% | Inline docs, README updates, API docs |
| Integration & testing | 15% | 18% | Wiring components, end-to-end testing |
| Learning curve | 8% | 15% | New frameworks, APIs, unfamiliar domains |

**Total overhead range: ~68-93%**

### Hourly Market Rates by Role (USD, 2025 US market)

| Role | Low | Mid | High | Notes |
|------|-----|-----|------|-------|
| Senior Engineer (generalist) | 100 | 150 | 225 | IC5+ full-stack / backend / mobile |
| Senior Engineer (specialist) | 125 | 175 | 250 | GPU, ML, systems, AV, security |
| Product Management | 125 | 160 | 200 | PRDs, roadmap, stakeholder mgmt |
| UX/UI Design | 100 | 140 | 175 | Wireframes, mockups, design systems |
| Engineering Management | 150 | 185 | 225 | 1:1s, hiring, performance, strategy |
| QA/Testing | 75 | 100 | 125 | Test plans, manual testing, automation |
| Project/Program Management | 100 | 125 | 150 | Schedules, dependencies, status |
| Technical Writing | 75 | 100 | 125 | User docs, API docs, internal docs |
| DevOps/Platform | 125 | 160 | 200 | CI/CD, infra, deployments |

### Role Ratios (hours as % of engineering hours, by company stage)

| Role | Solo | Lean Startup | Growth Co | Enterprise |
|------|------|--------------|-----------|------------|
| Product Management | 0% | 15% | 30% | 40% |
| UX/UI Design | 0% | 15% | 25% | 35% |
| Engineering Management | 0% | 5% | 15% | 20% |
| QA/Testing | 0% | 5% | 20% | 25% |
| Project/Program Management | 0% | 0% | 10% | 15% |
| Technical Writing | 0% | 0% | 5% | 10% |
| DevOps/Platform | 0% | 5% | 15% | 20% |
| **Full Team Multiplier** | **1.0x** | **~1.45x** | **~2.2x** | **~2.65x** |

### Organizational Efficiency (coding hours as % of 40-hr week)

| Company Type | Efficiency | Effective Coding Hrs/Week |
|--------------|------------|--------------------------|
| Solo/Startup (lean) | 65% | 26 |
| Growth Company | 55% | 22 |
| Enterprise | 45% | 18 |
| Large Bureaucracy | 35% | 14 |

### Sanity Check Bounds

| Metric | Too Conservative | Target Range | Too Aggressive |
|--------|-----------------|--------------|----------------|
| Effective lines/hour (LOC / total hours) | < 12 | 15-30 | > 40 |

### Claude ROI Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Claude coding speed | 200-500 lines/hr | Fallback when no git history |
| Claude coding speed (midpoint) | 350 lines/hr | Used for LOC-based hour estimate |
| Human baseline rate for comparison | 150 $/hr | Senior engineer, used in savings calc |
| Claude subscription range | $20-200/month | Pro to Team plans |

---

## Helper Scripts

Three Python scripts in `.claude/skills/cost-estimate/helpers/` automate the heavy lifting. **Use these instead of manual `find`, `wc -l`, `git log`, and inline math.** They work on any repo.

### 1. `loc_counter.py` — Count lines of code
```bash
# Full repo (respects .gitignore via git ls-files)
python3 .claude/skills/cost-estimate/helpers/loc_counter.py

# Branch diff (added lines only)
python3 .claude/skills/cost-estimate/helpers/loc_counter.py --branch feat/foo

# Branch diff against specific base
python3 .claude/skills/cost-estimate/helpers/loc_counter.py --branch feat/foo --base develop

# Single commit
python3 .claude/skills/cost-estimate/helpers/loc_counter.py --commit abc1234
```
**Output (JSON):** `totals` (lines, files, test/doc/config/source breakdown), `by_language`, `by_directory`, `all_files` (with path, lines, category, is_test, is_doc, is_config flags).

### 2. `git_session_analyzer.py` — Estimate Claude active hours
```bash
# All commits on current branch
python3 .claude/skills/cost-estimate/helpers/git_session_analyzer.py

# Specific branch
python3 .claude/skills/cost-estimate/helpers/git_session_analyzer.py --branch feat/foo
```
**Output (JSON):** `total_commits`, `total_sessions`, `estimated_active_hours`, `sessions[]` with date/start/end/commits/estimated_hours/subjects. Review the session estimates and adjust upward for large-scope commits (e.g. a single commit that adds 5000 lines should count as more than 1 hour).

### 3. `cost_calculator.py` — Calculate costs from categorized LOC

```bash
# Pipe categories as JSON
echo '{"audio_video_processing": 2000, "business_logic": 5000, ...}' | \
  python3 .claude/skills/cost-estimate/helpers/cost_calculator.py --rate 150 --claude-hours 29
```
**Valid category keys:** `simple_crud_ui_boilerplate`, `standard_views`, `complex_ui`, `business_logic`, `database_persistence`, `audio_video_processing`, `gpu_shader`, `native_interop`, `system_extensions`, `on_device_ml`, `tests`, `config_build`, `documentation`

**Output (JSON):** `base_coding` (rows with category/lines/rate/hours), `overhead` (rows), `total_estimated_hours`, `sanity_check`, `calendar_time`, `engineering_cost`, `team_costs` (per stage with role breakdowns), `claude_roi` (if --claude-hours given).

### 4. `report_generator.py` — Generate markdown report sections
```bash
# Full report from calculator + session data
python3 .claude/skills/cost-estimate/helpers/report_generator.py \
  --calc costs.json --sessions sessions.json --project "MyApp" --scope "Full codebase"

# Single section only
python3 .claude/skills/cost-estimate/helpers/report_generator.py \
  --calc costs.json --section executive_summary

# Pipe directly from calculator
echo '{"business_logic": 5000}' | python3 cost_calculator.py --rate 150 --claude-hours 29 | \
  python3 report_generator.py --project "MyApp"
```
**Available sections:** `executive_summary`, `development_time`, `calendar_time`, `engineering_cost`, `team_cost`, `grand_total`, `claude_roi`, `assumptions`

**Output:** Ready-to-paste markdown. Review, add complexity factors, market research rationale, and codebase metrics (which are project-specific and come from Step 1).

### Recommended Workflow

```bash
# 1. Count LOC
python3 .claude/skills/cost-estimate/helpers/loc_counter.py > /tmp/loc.json

# 2. Analyze git sessions
python3 .claude/skills/cost-estimate/helpers/git_session_analyzer.py > /tmp/sessions.json

# 3. Classify files into categories (done manually from loc.json)
#    Then pipe to calculator:
echo '{"category": lines, ...}' | \
  python3 .claude/skills/cost-estimate/helpers/cost_calculator.py \
    --rate 150 --claude-hours 29 > /tmp/calc.json

# 4. Generate report sections
python3 .claude/skills/cost-estimate/helpers/report_generator.py \
  --calc /tmp/calc.json --sessions /tmp/sessions.json --project "MyApp"
```

The main job is: **classify files into categories** (the creative/judgment part) and **add context** (complexity factors, market research, codebase description). The math and formatting are handled by the scripts.

---

## Step 0: Determine Scope

Check the user's input for scope specifiers:

- **No arguments (default)**: Estimate the entire codebase.
- **`branch:<name>`**: Estimate only the diff introduced by that branch (added lines only).
- **`commit:<hash>`**: Estimate only the diff for that single commit (added lines only).

The `loc_counter.py` script handles all three modes via `--branch` and `--commit` flags.

## Step 1: Analyze the Codebase

**Run `loc_counter.py`** to get a complete breakdown. Then review the output to:

1. **Identify the primary languages** from `by_language`
2. **Understand the directory structure** from `by_directory`
3. **Note test/doc/config splits** from `totals`
4. **Identify complexity factors** — scan the `all_files` list for signs of advanced work (GPU code, system extensions, audio/video pipelines, ML inference, native interop, complex UI, etc.)
5. **Detect project name** from the repo directory name or top-level config files

## Step 2: Classify and Calculate Development Hours

Review the `all_files` output from Step 1 and classify each file (or group of files) into categories from the **Coding Productivity Rates** table. Build a JSON object mapping category keys to line counts, then **pipe it to `cost_calculator.py`**.

> **These rates represent pure focused coding output** — fingers on keyboard, writing code with modern IDE autocomplete. All thinking, debugging, reviewing, and design time is captured by the overhead multipliers — do not bake overhead into rates or it will be double-counted.

The calculator handles: base hours, overhead multipliers, sanity check, calendar time, engineering cost, and full team costs. Review the `sanity_check` in the output — if it fails, adjust your category assignments.

**Every source line must be assigned to exactly one category. Do not double-count.**

## Step 3: Research Market Rates

Start with the **Hourly Market Rates by Role** from the Configuration section as baseline defaults. Then use WebSearch to validate or adjust for:
- The specific tech stack detected in Step 1
- Geographic variations (US markets: SF Bay Area, NYC, Austin, Remote)
- Contractor vs. employee rates

Search queries to use:
- "senior full stack developer hourly rate 2025"
- "senior software engineer hourly rate United States 2025"
- "[detected language/platform] developer contractor rate 2025"

If web search results differ significantly from the config defaults, note the discrepancy and use the researched rates. Otherwise, use the config defaults to avoid slowing down the estimate.

## Step 4: Calculate Organizational Overhead

Real companies don't have developers coding 40 hours/week. Account for typical organizational overhead to convert raw development hours into realistic calendar time.

**Weekly Time Allocation for Typical Company**:

| Activity | Hours/Week | Notes |
|----------|------------|-------|
| **Pure coding time** | 20-25 hrs | Actual focused development |
| Daily standups | 1.25 hrs | 15 min x 5 days |
| Weekly team sync | 1-2 hrs | All-hands, team meetings |
| 1:1s with manager | 0.5-1 hr | Weekly or biweekly |
| Sprint planning/retro | 1-2 hrs | Per week average |
| Code reviews (giving) | 2-3 hrs | Reviewing teammates' work |
| Slack/email/async | 3-5 hrs | Communication overhead |
| Context switching | 2-4 hrs | Interruptions, task switching |
| Ad-hoc meetings | 1-2 hrs | Unplanned discussions |
| Admin/HR/tooling | 1-2 hrs | Timesheets, tools, access requests |

Use the **Organizational Efficiency** table from the Configuration section for coding hours per week by company type.

**Calendar Weeks Calculation**:
```
Calendar Weeks = Raw Dev Hours / Effective Coding Hrs/Week (from config)
```

## Step 5: Calculate Full Team Cost

Engineering doesn't ship products alone. Use the **Role Ratios** and **Hourly Market Rates by Role** from the Configuration section to calculate the fully-loaded team cost.

For each company stage:
1. Look up the role ratio % from the config's Role Ratios table
2. Multiply engineering hours by that % to get each role's hours
3. Multiply each role's hours by the Mid rate from the Hourly Market Rates table
4. Sum all roles for Full Team Cost, or use the Full Team Multiplier shortcut

**Calculation**:
```
Full Team Cost = Engineering Cost x Full Team Multiplier (from config)
```

## Step 6: Generate Cost Estimate

Detect the project name from the repository (directory name, package manifest, or top-level config).

**IMPORTANT: The report MUST lead with the Executive Summary and Claude ROI at the very top.** The detailed breakdowns come after. This is the required report structure:

---

## [Project Name] - Development Cost Estimate

**Analysis Date**: [Current Date]
**Scope**: [Full codebase / Branch `<name>` (diff from `<base>`) / Commit `<hash>`]

---

### Executive Summary

| Metric | Value |
|--------|-------|
| **Codebase** | [X] lines of [language] across [X] files |
| **Engineering hours** | [X] hours |
| **Engineering cost (avg)** | **$[X,XXX]** |
| **Full team cost (Growth Co)** | **$[X,XXX]** |
| **Calendar time (solo dev)** | ~[X] months |

### Claude ROI

| Metric | Value |
|--------|-------|
| **Claude active hours** | ~[X] hours (across [X] calendar days) |
| **Speed multiplier** | [X]x faster than human developer |
| **Value per Claude hour** | $[X,XXX]/hr (engineering) |
| **ROI** | [X]x ($[X]k value for ~$[X] in Claude costs) |

> Claude worked ~[X] hours and produced $[X] of professional development value = **$[X,XXX] per Claude hour**

---

### Grand Total Summary

| Metric | Solo | Lean Startup | Growth Co | Enterprise |
|--------|------|--------------|-----------|------------|
| Calendar Time | [X] | [X] | [X] | [X] |
| Total Human Hours | [X] | [X] | [X] | [X] |
| **Total Cost** | **$[X]** | **$[X]** | **$[X]** | **$[X]** |

---

*Detailed breakdown follows.*

---

### Codebase Metrics

- **Total Lines of Code**: [number] ([scope context: "in repository" or "in diff"])
  - [Language 1]: [number] lines
  - [Language 2]: [number] lines
  - Tests: [number] lines
  - Config/Build: [number] lines
  - Documentation: [number] lines

- **Complexity Factors**:
  - [Auto-detected factor 1, e.g. "Audio/video processing pipeline"]
  - [Auto-detected factor 2, e.g. "System extension architecture"]
  - [Auto-detected factor 3, e.g. "Third-party API integrations"]

### Development Time Estimate

**Base Development Hours**: [number] hours

| Code Category | Lines | Rate (lines/hr) | Hours |
|---------------|-------|-----------------|-------|
| [Category 1] | [X] | [X] | [X] |
| [Category 2] | [X] | [X] | [X] |
| ... | ... | ... | ... |
| **Total Base** | **[X]** | | **[X]** |

**Overhead Multipliers**:
- Architecture & Design: +[X]% ([hours] hours)
- Debugging & Troubleshooting: +[X]% ([hours] hours)
- Code Review & Refactoring: +[X]% ([hours] hours)
- Documentation: +[X]% ([hours] hours)
- Integration & Testing: +[X]% ([hours] hours)
- Learning Curve: +[X]% ([hours] hours)

**Total Estimated Hours**: [number] hours

**Sanity Check**: [total LOC] / [total hours] = [X] effective lines/hour [PASS: within 15-30 range / ADJUST: outside range, explain adjustment]

### Realistic Calendar Time (with Organizational Overhead)

| Company Type | Efficiency | Coding Hrs/Week | Calendar Weeks | Calendar Time |
|--------------|------------|-----------------|----------------|---------------|
| Solo/Startup (lean) | 65% | 26 hrs | [X] weeks | ~[X] months |
| Growth Company | 55% | 22 hrs | [X] weeks | ~[X] years |
| Enterprise | 45% | 18 hrs | [X] weeks | ~[X] years |
| Large Bureaucracy | 35% | 14 hrs | [X] weeks | ~[X] years |

### Market Rate Research

**Senior Developer Rates (2025)**:
- Low end: $[X]/hour (remote, mid-level market)
- Average: $[X]/hour (standard US market)
- High end: $[X]/hour (SF Bay Area, NYC, specialized)

**Recommended Rate for This Project**: $[X]/hour

*Rationale*: [Based on detected tech stack complexity and specialization requirements]

### Total Cost Estimate (Engineering Only)

| Scenario | Hourly Rate | Total Hours | **Total Cost** |
|----------|-------------|-------------|----------------|
| Low-end | $[X] | [hours] | **$[X,XXX]** |
| Average | $[X] | [hours] | **$[X,XXX]** |
| High-end | $[X] | [hours] | **$[X,XXX]** |

**Recommended Estimate (Engineering Only)**: **$[X,XXX] - $[X,XXX]**

### Full Team Cost (All Roles)

| Company Stage | Team Multiplier | Engineering Cost | **Full Team Cost** |
|---------------|-----------------|------------------|-------------------|
| Solo/Founder | 1.0x | $[X] | **$[X]** |
| Lean Startup | 1.45x | $[X] | **$[X]** |
| Growth Company | 2.2x | $[X] | **$[X]** |
| Enterprise | 2.65x | $[X] | **$[X]** |

**Role Breakdown (Growth Company Example)**:

| Role | Hours | Rate | Cost |
|------|-------|------|------|
| Engineering | [X] hrs | $[X]/hr | $[X] |
| Product Management | [X] hrs | $[X]/hr | $[X] |
| UX/UI Design | [X] hrs | $[X]/hr | $[X] |
| Engineering Management | [X] hrs | $[X]/hr | $[X] |
| QA/Testing | [X] hrs | $[X]/hr | $[X] |
| Project Management | [X] hrs | $[X]/hr | $[X] |
| Technical Writing | [X] hrs | $[X]/hr | $[X] |
| DevOps/Platform | [X] hrs | $[X]/hr | $[X] |
| **TOTAL** | **[X] hrs** | | **$[X]** |

### Claude ROI Analysis (Detailed)

**Project Timeline**:
- First commit / project start: [date]
- Latest commit: [date]
- Total calendar time: [X] days ([X] weeks)

**Claude Active Hours Estimate**:
- Total sessions identified: [X] sessions
- Estimated active hours: [X] hours
- Method: [git clustering / file timestamps / LOC estimate]

**Value per Claude Hour**:

| Value Basis | Total Value | Claude Hours | $/Claude Hour |
|-------------|-------------|--------------|---------------|
| Engineering only | $[X] | [X] hrs | **$[X,XXX]/Claude hr** |
| Full team (Growth Co) | $[X] | [X] hrs | **$[X,XXX]/Claude hr** |

**Speed vs. Human Developer**:
- Estimated human hours for same work: [X] hours
- Claude active hours: [X] hours
- **Speed multiplier: [X]x** (Claude was [X]x faster)

**Cost Comparison**:
- Human developer cost: $[X] (at config baseline rate)
- Estimated Claude cost: $[X] (subscription + API)
- **Net savings: $[X]**
- **ROI: [X]x** (every $1 spent on Claude produced $[X] of value)

### Assumptions

1. Rates based on US market averages (2025)
2. Full-time equivalent allocation for all roles
3. Does not include:
   - Marketing & sales
   - Legal & compliance
   - Office/equipment
   - Hosting/infrastructure
   - Ongoing maintenance post-launch

---

## Step 7: Calculate Claude ROI — Value Per Claude Hour

This is the most important metric for understanding AI-assisted development efficiency. It answers: **"What did each hour of Claude's actual working time produce?"**

**IMPORTANT**: The Claude ROI results must appear in TWO places in the report:
1. **Executive Summary** at the very top (compact table format)
2. **Claude ROI Analysis (Detailed)** section with full breakdown

Calculate all ROI values in this step, then populate both sections when writing the report.

### 7a: Determine Actual Claude Clock Time

**Run `git_session_analyzer.py`** to automatically cluster commits into sessions and estimate active hours:

```bash
python3 .claude/skills/cost-estimate/helpers/git_session_analyzer.py
```

Review the output sessions and adjust estimates upward for commits with large scope (e.g. a single commit adding thousands of lines likely took 2-4 hours, not 1 hour). Use `git show <hash> --stat` to check the scope of low-commit sessions.

**Fallback (no git):** Estimate from LOC using the Claude ROI Constants: `Claude active hours = Total LOC / 350 lines/hr`

### 7b: Calculate ROI

Pass `--claude-hours` to `cost_calculator.py` (in Step 2) to get the full ROI breakdown automatically. The calculator computes speed multiplier, value per Claude hour, cost comparison, and savings.

---

## Notes

Present the estimate in a clear, professional format suitable for sharing with stakeholders. Include confidence intervals and key assumptions. Highlight areas of highest complexity that drive cost.

**IMPORTANT — Dollar Sign Escaping**: Always escape `$` as `\$` in the final markdown report. Bare `$` characters are interpreted as LaTeX math delimiters by many markdown renderers (GitHub, VS Code, etc.), which mangles currency values. The `report_generator.py` `fmt()` function handles this automatically, but when writing prose sections manually (e.g., market rate research, rationale text, assumptions), always use `\$` for currency.
