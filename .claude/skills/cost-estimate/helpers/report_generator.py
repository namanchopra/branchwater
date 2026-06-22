#!/usr/bin/env python3
"""
Report Generator — Format cost estimate data into markdown report sections.

Part of the cost-estimate agent toolchain. Takes the JSON output from
cost_calculator.py (and optionally git_session_analyzer.py) and generates
ready-to-paste markdown sections for the final COST-ESTIMATE.md report.

Can generate individual sections or the full report. The agent can then
review, adjust descriptions, and add complexity factors and market research.

Usage:
  # Generate full report from calculator output
  python3 report_generator.py --calc costs.json --sessions sessions.json --project "MyApp"

  # Generate specific section only
  python3 report_generator.py --calc costs.json --section executive_summary
  python3 report_generator.py --calc costs.json --section development_time
  python3 report_generator.py --calc costs.json --section calendar_time
  python3 report_generator.py --calc costs.json --section engineering_cost
  python3 report_generator.py --calc costs.json --section team_cost
  python3 report_generator.py --calc costs.json --section grand_total
  python3 report_generator.py --calc costs.json --sessions sessions.json --section claude_roi

  # Pipe calculator output directly
  echo '{"audio_video_processing": 2000}' | python3 cost_calculator.py --rate 150 --claude-hours 29 | python3 report_generator.py --project "MyApp"

Available sections:
  executive_summary  - Key numbers table + Claude ROI headline (goes at top of report)
  development_time   - Code category table + overhead multipliers + sanity check
  calendar_time      - Organizational efficiency table
  engineering_cost   - Low/avg/high engineering-only cost table
  team_cost          - Full team cost by company stage + role breakdown
  grand_total        - Summary table across all company stages
  claude_roi         - Project timeline, sessions, value per hour, speed/cost comparison
  assumptions        - Standard assumptions section

Output: Markdown text printed to stdout. Redirect to file or copy into report.
"""

import argparse
import json
import sys


def fmt(n: float, prefix: str = r"\$") -> str:
    """Format number with commas and optional prefix. Default prefix is escaped $ for markdown."""
    return f"{prefix}{n:,.0f}"


def months_label(months: float) -> str:
    if months < 12:
        return f"~{int(months)} months"
    years = months / 12
    if years == int(years):
        return f"~{int(years)} years"
    return f"~{years:.1f} years"


def section_executive_summary(calc: dict, sessions: dict | None, project: str) -> str:
    total_lines = calc["base_coding"]["total_lines"]
    total_hours = calc["total_estimated_hours"]
    eng_cost = calc["engineering_cost"]["mid"]["cost"]
    growth_cost = calc["team_costs"]["growth_company"]["total_cost"]
    solo_months = calc["calendar_time"]["solo"]["months"]

    lines = [
        f"## Executive Summary",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| **Total Lines of Code** | {total_lines:,} |",
        f"| **Estimated Engineering Hours** | {total_hours:,} |",
        f"| **Engineering Cost (avg rate)** | {fmt(eng_cost)} |",
        f"| **Full Team Cost (Growth Co)** | {fmt(growth_cost)} |",
        f"| **Calendar Time (solo, lean)** | {months_label(solo_months)} |",
        "",
    ]

    roi = calc.get("claude_roi")
    if roi and sessions:
        claude_hrs = roi["claude_hours"]
        speed = roi["speed_multiplier"]
        val_per_hr = roi["value_per_claude_hour"]["engineering_avg"]
        roi_mult = roi["roi_multiplier"]
        claude_cost = roi["claude_cost"]
        days = sessions.get("total_calendar_days", "?")

        lines.extend([
            "### Claude ROI",
            "",
            "| Metric | Value |",
            "|--------|-------|",
            f"| **Claude active hours** | ~{int(claude_hrs)} hours (across {days} calendar days) |",
            f"| **Speed multiplier** | {int(speed)}x faster than human developer |",
            f"| **Value per Claude hour** | {fmt(val_per_hr)}/hr (engineering) |",
            f"| **ROI** | {int(roi_mult)}x ({fmt(eng_cost / 1000)}k value for ~{fmt(claude_cost)} in Claude costs) |",
            "",
            f"> Claude worked ~{int(claude_hrs)} hours and produced {fmt(eng_cost)} of professional development value = **{fmt(val_per_hr)} per Claude hour**",
            "",
        ])

    return "\n".join(lines)


def section_development_time(calc: dict) -> str:
    lines = [
        "## Development Time Estimate",
        "",
        "### Code Category Classification",
        "",
        "| Code Category | Lines | Rate (lines/hr) | Hours |",
        "|---------------|-------|-----------------|-------|",
    ]

    for row in calc["base_coding"]["rows"]:
        lines.append(
            f"| {row['category']} | {row['lines']:,} | {row['rate']:.0f} | {row['hours']:.1f} |"
        )

    lines.append(
        f"| **TOTAL** | **{calc['base_coding']['total_lines']:,}** | | **{calc['base_coding']['total_hours']:.0f}** |"
    )

    lines.extend([
        "",
        f"### Base Development Hours: {calc['base_coding']['total_hours']:.0f} hours",
        "",
        "### Overhead Multipliers",
        "",
        "| Overhead Category | Rate (midpoint) | Hours |",
        "|-------------------|-----------------|-------|",
    ])

    for row in calc["overhead"]["rows"]:
        lines.append(f"| {row['category']} | {row['percentage']}% | {row['hours']:.1f} |")

    lines.append(
        f"| **Total Overhead** | **{calc['overhead']['total_percentage']}%** | **{calc['overhead']['total_hours']:.1f}** |"
    )

    sc = calc["sanity_check"]
    lines.extend([
        "",
        f"### Total Estimated Hours: {calc['total_estimated_hours']:,} hours",
        "",
        "### Sanity Check",
        "",
        f"{calc['base_coding']['total_lines']:,} LOC / {calc['total_estimated_hours']:,} total hours = **{sc['effective_lines_per_hour']} effective lines/hour**",
        "",
        f"**{sc['status']}** -- {'within' if sc['status'] == 'PASS' else 'outside'} target range of {sc['target_range']} lines/hour.",
        "",
    ])

    return "\n".join(lines)


def section_calendar_time(calc: dict) -> str:
    lines = [
        "## Realistic Calendar Time (with Organizational Overhead)",
        "",
        "| Company Type | Efficiency | Coding Hrs/Week | Calendar Weeks | Calendar Time |",
        "|--------------|------------|-----------------|----------------|---------------|",
    ]

    for key in ["solo", "growth", "enterprise", "bureaucracy"]:
        ct = calc["calendar_time"][key]
        lines.append(
            f"| {ct['label']} | {ct['efficiency']} | {ct['hrs_per_week']} hrs | {ct['weeks']:.1f} weeks | {months_label(ct['months'])} |"
        )

    lines.extend([
        "",
        "*Note: These represent single-developer calendar time. With a 2-3 person team, divide by team size (with ~80% scaling efficiency).*",
        "",
    ])

    return "\n".join(lines)


def section_engineering_cost(calc: dict) -> str:
    ec = calc["engineering_cost"]
    hours = calc["total_estimated_hours"]

    lines = [
        "## Total Cost Estimate (Engineering Only)",
        "",
        "| Scenario | Hourly Rate | Total Hours | **Total Cost** |",
        "|----------|-------------|-------------|----------------|",
        f"| Low-end | {fmt(ec['low']['rate'])}/hr | {hours:,} | **{fmt(ec['low']['cost'])}** |",
        f"| Average | {fmt(ec['mid']['rate'])}/hr | {hours:,} | **{fmt(ec['mid']['cost'])}** |",
        f"| High-end | {fmt(ec['high']['rate'])}/hr | {hours:,} | **{fmt(ec['high']['cost'])}** |",
        "",
        f"**Recommended Estimate (Engineering Only)**: **{fmt(ec['low']['cost'])} - {fmt(ec['mid']['cost'])}**",
        "",
    ]

    return "\n".join(lines)


def section_team_cost(calc: dict) -> str:
    tc = calc["team_costs"]
    eng_cost = calc["engineering_cost"]["mid"]["cost"]

    lines = [
        "## Full Team Cost (All Roles)",
        "",
        "| Company Stage | Team Multiplier | Engineering Cost (avg) | **Full Team Cost** |",
        "|---------------|-----------------|------------------------|--------------------|",
    ]

    stage_labels = {
        "solo": "Solo/Founder",
        "lean_startup": "Lean Startup",
        "growth_company": "Growth Company",
        "enterprise": "Enterprise",
    }

    for key in ["solo", "lean_startup", "growth_company", "enterprise"]:
        stage = tc[key]
        lines.append(
            f"| {stage_labels[key]} | {stage['multiplier']}x | {fmt(eng_cost)} | **{fmt(stage['total_cost'])}** |"
        )

    # Growth company role breakdown
    gc = tc["growth_company"]
    lines.extend([
        "",
        "### Role Breakdown (Growth Company Example)",
        "",
        "| Role | Hours | Rate | Cost |",
        "|------|-------|------|------|",
    ])

    for role in gc["roles"]:
        ratio = f" ({role['ratio']})" if "ratio" in role else ""
        lines.append(
            f"| {role['role']}{ratio} | {int(role['hours']):,} hrs | {fmt(role['rate'])}/hr | {fmt(role['cost'])} |"
        )

    lines.append(
        f"| **TOTAL** | **{int(gc['total_hours']):,} hrs** | | **{fmt(gc['total_cost'])}** |"
    )
    lines.append("")

    return "\n".join(lines)


def section_grand_total(calc: dict) -> str:
    tc = calc["team_costs"]
    ct = calc["calendar_time"]

    lines = [
        "## Grand Total Summary",
        "",
        "| Metric | Solo | Lean Startup | Growth Co | Enterprise |",
        "|--------|------|--------------|-----------|------------|",
        f"| Calendar Time (1 dev) | {months_label(ct['solo']['months'])} | {months_label(ct['growth']['months'])} | {months_label(ct['enterprise']['months'])} | {months_label(ct['bureaucracy']['months'])} |",
        f"| Total Human Hours | {int(tc['solo']['total_hours']):,} | {int(tc['lean_startup']['total_hours']):,} | {int(tc['growth_company']['total_hours']):,} | {int(tc['enterprise']['total_hours']):,} |",
        f"| **Total Cost** | **{fmt(tc['solo']['total_cost'])}** | **{fmt(tc['lean_startup']['total_cost'])}** | **{fmt(tc['growth_company']['total_cost'])}** | **{fmt(tc['enterprise']['total_cost'])}** |",
        "",
    ]

    return "\n".join(lines)


def section_claude_roi(calc: dict, sessions: dict | None) -> str:
    roi = calc.get("claude_roi")
    if not roi:
        return "## Claude ROI Analysis\n\n*No Claude hours provided. Pass --claude-hours to cost_calculator.py.*\n"

    lines = [
        "## Claude ROI Analysis (Detailed)",
        "",
    ]

    if sessions:
        lines.extend([
            "### Project Timeline",
            "",
            f"- **First commit**: {sessions['first_commit'][:10]}",
            f"- **Latest commit**: {sessions['last_commit'][:10]}",
            f"- **Total calendar time**: {sessions['total_calendar_days']} days (~{sessions['total_calendar_days'] / 7:.1f} weeks)",
            "",
            "### Claude Active Hours Estimate",
            "",
            f"Analyzing the git history ({sessions['total_commits']} commits), development sessions cluster as follows:",
            "",
            "| Date | Session Window | Commits | Est. Hours |",
            "|------|---------------|---------|------------|",
        ])

        for s in sessions["sessions"]:
            summary = s["subjects"][0][:60] if s["subjects"] else ""
            if len(s["subjects"]) > 1:
                summary += f" (+{len(s['subjects']) - 1} more)"
            lines.append(
                f"| {s['date']} | {s['start']}-{s['end']} | {s['commits']} | {s['estimated_hours']:.0f} |"
            )

        lines.extend([
            "",
            f"- **Total sessions identified**: {sessions['total_sessions']} sessions",
            f"- **Estimated active hours**: ~{int(roi['claude_hours'])} hours",
            f"- **Method**: Git commit clustering (4-hour window grouping with density-based duration estimation)",
            "",
        ])

    vph = roi["value_per_claude_hour"]
    lines.extend([
        "### Value per Claude Hour",
        "",
        "| Value Basis | Total Value | Claude Hours | \\$/Claude Hour |",
        "|-------------|-------------|--------------|---------------|",
        f"| Engineering only (avg) | {fmt(calc['engineering_cost']['mid']['cost'])} | {int(roi['claude_hours'])} hrs | **{fmt(vph['engineering_avg'])}/Claude hr** |",
        f"| Full team (Growth Co) | {fmt(calc['team_costs']['growth_company']['total_cost'])} | {int(roi['claude_hours'])} hrs | **{fmt(vph['growth_company'])}/Claude hr** |",
        f"| Full team (Enterprise) | {fmt(calc['team_costs']['enterprise']['total_cost'])} | {int(roi['claude_hours'])} hrs | **{fmt(vph['enterprise'])}/Claude hr** |",
        "",
        "### Speed vs. Human Developer",
        "",
        f"- Estimated human hours for same work: **{int(roi['human_hours']):,} hours** (engineering only)",
        f"- Claude active hours: **{int(roi['claude_hours'])} hours**",
        f"- **Speed multiplier: {int(roi['speed_multiplier'])}x** (Claude produced code {int(roi['speed_multiplier'])}x faster than a human developer)",
        "",
        "### Cost Comparison",
        "",
        f"- Human developer cost: **{fmt(roi['human_cost'])}** ({int(roi['human_hours']):,} hrs at \\$150/hr baseline rate)",
        f"- Estimated Claude cost: **~{fmt(roi['claude_cost'])}** (subscription + API)",
        f"- **Net savings: {fmt(roi['savings'])}**",
        f"- **ROI: {int(roi['roi_multiplier'])}x** (every \\$1 spent on Claude produced \\${int(roi['roi_multiplier'])} of value)",
        "",
    ])

    return "\n".join(lines)


def section_assumptions() -> str:
    return """## Assumptions

1. Rates based on US market averages (2025-2026)
2. Full-time equivalent allocation for all roles
3. Lines of code counted include comments and blank lines (standard for LOC-based estimation)
4. Overhead multipliers capture architecture, debugging, code review, documentation, integration, and learning curve
5. Claude active hours estimated from git commit clustering -- actual wall-clock time may vary
6. Does not include:
   - Marketing & sales
   - Legal & compliance
   - Office/equipment costs
   - Hosting/infrastructure
   - Ongoing maintenance post-launch
"""


SECTIONS = {
    "executive_summary": lambda c, s, p: section_executive_summary(c, s, p),
    "development_time": lambda c, s, p: section_development_time(c),
    "calendar_time": lambda c, s, p: section_calendar_time(c),
    "engineering_cost": lambda c, s, p: section_engineering_cost(c),
    "team_cost": lambda c, s, p: section_team_cost(c),
    "grand_total": lambda c, s, p: section_grand_total(c),
    "claude_roi": lambda c, s, p: section_claude_roi(c, s),
    "assumptions": lambda c, s, p: section_assumptions(),
}

FULL_REPORT_ORDER = [
    "executive_summary",
    "grand_total",
    "development_time",
    "calendar_time",
    "engineering_cost",
    "team_cost",
    "claude_roi",
    "assumptions",
]


def main():
    parser = argparse.ArgumentParser(description="Generate markdown report sections from cost data")
    parser.add_argument("--calc", help="JSON file from cost_calculator.py (or pipe via stdin)")
    parser.add_argument("--sessions", help="JSON file from git_session_analyzer.py")
    parser.add_argument("--project", default="Project", help="Project name for report title")
    parser.add_argument("--section", choices=list(SECTIONS.keys()),
                        help="Generate only this section (default: full report)")
    parser.add_argument("--scope", default="Full codebase",
                        help="Scope description (e.g. 'Branch feat/foo diff from main')")
    args = parser.parse_args()

    # Load calculator output
    if args.calc:
        with open(args.calc) as f:
            calc = json.load(f)
    else:
        calc = json.loads(sys.stdin.read())

    # Load sessions if provided
    sessions = None
    if args.sessions:
        with open(args.sessions) as f:
            sessions = json.load(f)

    if args.section:
        print(SECTIONS[args.section](calc, sessions, args.project))
    else:
        # Full report
        header = f"""# {args.project} - Development Cost Estimate

**Analysis Date**: [Current Date]
**Scope**: {args.scope}

---

"""
        print(header)
        for section_key in FULL_REPORT_ORDER:
            print(SECTIONS[section_key](calc, sessions, args.project))
            print("---\n")


if __name__ == "__main__":
    main()
