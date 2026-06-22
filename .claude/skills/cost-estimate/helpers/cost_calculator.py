#!/usr/bin/env python3
"""
Cost Calculator — Calculate development cost from categorized LOC data.

Part of the cost-estimate agent toolchain. Takes a JSON mapping of {category: lines}
and applies the rate tables and overhead multipliers from the cost-estimate agent
configuration. Outputs a complete cost breakdown as JSON.

Works with any codebase -- categories are generic.

Usage:
  echo '{"audio_video_processing": 2000, "standard_views": 5000}' | python3 cost_calculator.py
  python3 cost_calculator.py --input categories.json
  python3 cost_calculator.py --input categories.json --rate 175
  python3 cost_calculator.py --input categories.json --claude-hours 29

Valid Category Keys (matching Coding Productivity Rates from agent config):
  simple_crud_ui_boilerplate   50-80 lines/hr   Forms, lists, repetitive layouts
  standard_views               35-55 lines/hr   Typical screens, moderate complexity
  complex_ui                   25-40 lines/hr   Onboarding, custom components, animations
  business_logic               30-50 lines/hr   Networking, state management, data transforms
  database_persistence         30-50 lines/hr   CRUD, migrations, queries, schema
  audio_video_processing       20-30 lines/hr   AV pipelines, streaming, encoding
  gpu_shader                   15-25 lines/hr   Metal, CUDA, render pipelines
  native_interop               15-25 lines/hr   FFI, bridging, unsafe code
  system_extensions            15-25 lines/hr   OS extensions, daemons, hotkeys
  on_device_ml                 15-25 lines/hr   CoreML, MLX, ONNX, model integration
  tests                        50-80 lines/hr   Tests (boilerplate-heavy)
  config_build                 40-60 lines/hr   Build configs, CI/CD, manifests
  documentation                60-100 lines/hr  Markdown, READMEs, API docs

Overhead Multipliers Applied (% of base coding hours):
  Architecture & Design         12-15%
  Debugging & Troubleshooting   20-25%
  Code Review & Refactoring      8-12%
  Documentation                  5-8%
  Integration & Testing         15-18%
  Learning Curve                 8-15%
  Total overhead:              ~68-93% (midpoint ~80.5%)

Role Ratios by Company Stage (hours as % of engineering hours):
  Solo:           1.0x (engineering only)
  Lean Startup:  ~1.45x (adds PM, UX, DevOps at 5-15%)
  Growth Co:     ~2.2x  (adds QA, ProjMgmt, TechWriting at 5-30%)
  Enterprise:    ~2.65x (all roles at 10-40%)

Output JSON structure:
  {
    "base_coding":        { "rows": [...], "total_lines": int, "total_hours": float },
    "overhead":           { "rows": [...], "total_percentage": float, "total_hours": float },
    "total_estimated_hours": int,
    "sanity_check":       { "effective_lines_per_hour": float, "status": "PASS"|"ADJUST" },
    "calendar_time":      { "solo": {...}, "growth": {...}, ... },
    "engineering_cost":   { "low": {...}, "mid": {...}, "high": {...} },
    "team_costs":         { "solo": {...}, "growth_company": {...}, ... },
    "claude_roi":         { ... } // only if --claude-hours provided
  }
"""

import argparse
import json
import math
import sys


# ============================================================
# CONFIGURATION: Coding Productivity Rates (lines/hour)
# These match the cost-estimate agent's configuration exactly.
# ============================================================
RATE_TABLE = {
    "simple_crud_ui_boilerplate":  {"low": 50, "high": 80,  "label": "Simple CRUD/UI/boilerplate"},
    "standard_views":              {"low": 35, "high": 55,  "label": "Standard views with logic"},
    "complex_ui":                  {"low": 25, "high": 40,  "label": "Complex UI (animations, custom)"},
    "business_logic":              {"low": 30, "high": 50,  "label": "Business logic / API clients"},
    "database_persistence":        {"low": 30, "high": 50,  "label": "Database/persistence"},
    "audio_video_processing":      {"low": 20, "high": 30,  "label": "Audio/video processing"},
    "gpu_shader":                  {"low": 15, "high": 25,  "label": "GPU/shader programming"},
    "native_interop":              {"low": 15, "high": 25,  "label": "Native C/C++ interop"},
    "system_extensions":           {"low": 15, "high": 25,  "label": "System extensions/plugins"},
    "on_device_ml":                {"low": 15, "high": 25,  "label": "On-device ML inference"},
    "tests":                       {"low": 50, "high": 80,  "label": "Tests"},
    "config_build":                {"low": 40, "high": 60,  "label": "Config/build files"},
    "documentation":               {"low": 60, "high": 100, "label": "Documentation"},
}

# ============================================================
# CONFIGURATION: Overhead Multipliers (% of base coding hours)
# ============================================================
OVERHEAD_MULTIPLIERS = {
    "architecture_design":      {"low": 0.12, "high": 0.15, "label": "Architecture & Design"},
    "debugging_troubleshooting": {"low": 0.20, "high": 0.25, "label": "Debugging & Troubleshooting"},
    "code_review_refactoring":  {"low": 0.08, "high": 0.12, "label": "Code Review & Refactoring"},
    "documentation":            {"low": 0.05, "high": 0.08, "label": "Documentation"},
    "integration_testing":      {"low": 0.15, "high": 0.18, "label": "Integration & Testing"},
    "learning_curve":           {"low": 0.08, "high": 0.15, "label": "Learning Curve"},
}

# ============================================================
# CONFIGURATION: Hourly Market Rates by Role (USD)
# ============================================================
ROLE_RATES = {
    "engineering":     {"low": 100, "mid": 150, "high": 225},
    "product_mgmt":    {"low": 125, "mid": 160, "high": 200},
    "ux_design":       {"low": 100, "mid": 140, "high": 175},
    "eng_mgmt":        {"low": 150, "mid": 185, "high": 225},
    "qa_testing":      {"low": 75,  "mid": 100, "high": 125},
    "project_mgmt":    {"low": 100, "mid": 125, "high": 150},
    "tech_writing":    {"low": 75,  "mid": 100, "high": 125},
    "devops":          {"low": 125, "mid": 160, "high": 200},
}

# ============================================================
# CONFIGURATION: Role Ratios by Company Stage
# ============================================================
ROLE_RATIOS = {
    "solo": {
        "product_mgmt": 0.00, "ux_design": 0.00, "eng_mgmt": 0.00,
        "qa_testing": 0.00, "project_mgmt": 0.00, "tech_writing": 0.00, "devops": 0.00,
        "multiplier": 1.0,
    },
    "lean_startup": {
        "product_mgmt": 0.15, "ux_design": 0.15, "eng_mgmt": 0.05,
        "qa_testing": 0.05, "project_mgmt": 0.00, "tech_writing": 0.00, "devops": 0.05,
        "multiplier": 1.45,
    },
    "growth_company": {
        "product_mgmt": 0.30, "ux_design": 0.25, "eng_mgmt": 0.15,
        "qa_testing": 0.20, "project_mgmt": 0.10, "tech_writing": 0.05, "devops": 0.15,
        "multiplier": 2.2,
    },
    "enterprise": {
        "product_mgmt": 0.40, "ux_design": 0.35, "eng_mgmt": 0.20,
        "qa_testing": 0.25, "project_mgmt": 0.15, "tech_writing": 0.10, "devops": 0.20,
        "multiplier": 2.65,
    },
}

# ============================================================
# CONFIGURATION: Organizational Efficiency
# ============================================================
ORG_EFFICIENCY = {
    "solo":        {"efficiency": 0.65, "hrs_per_week": 26, "label": "Solo/Startup (lean)"},
    "growth":      {"efficiency": 0.55, "hrs_per_week": 22, "label": "Growth Company"},
    "enterprise":  {"efficiency": 0.45, "hrs_per_week": 18, "label": "Enterprise"},
    "bureaucracy": {"efficiency": 0.35, "hrs_per_week": 14, "label": "Large Bureaucracy"},
}

# Sanity check bounds
SANITY_LOW = 12
SANITY_HIGH = 40
SANITY_TARGET_LOW = 15
SANITY_TARGET_HIGH = 30

# Claude ROI constants
CLAUDE_CODING_SPEED_MID = 350  # lines/hr
HUMAN_BASELINE_RATE = 150  # $/hr
CLAUDE_SUBSCRIPTION_RANGE = (20, 200)  # $/month


def midpoint(low: float, high: float) -> float:
    return (low + high) / 2


def calculate(categories: dict[str, int], hourly_rate: float = 150.0,
              claude_hours: float | None = None) -> dict:
    """Calculate full cost estimate from categorized line counts."""

    # Step 1: Base coding hours
    base_rows = []
    total_lines = 0
    total_base_hours = 0.0

    for cat_key, lines in sorted(categories.items(), key=lambda x: x[1], reverse=True):
        if lines <= 0:
            continue
        if cat_key not in RATE_TABLE:
            print(f"Warning: unknown category '{cat_key}', using business_logic rates",
                  file=sys.stderr)
            rate_info = RATE_TABLE["business_logic"]
        else:
            rate_info = RATE_TABLE[cat_key]

        rate = midpoint(rate_info["low"], rate_info["high"])
        hours = lines / rate

        base_rows.append({
            "category": rate_info.get("label", cat_key),
            "lines": lines,
            "rate": rate,
            "hours": round(hours, 1),
        })
        total_lines += lines
        total_base_hours += hours

    # Step 2: Overhead
    total_overhead_pct = 0.0
    overhead_rows = []
    for key, mult in OVERHEAD_MULTIPLIERS.items():
        pct = midpoint(mult["low"], mult["high"])
        hours = total_base_hours * pct
        overhead_rows.append({
            "category": mult["label"],
            "percentage": round(pct * 100, 1),
            "hours": round(hours, 1),
        })
        total_overhead_pct += pct

    total_overhead_hours = total_base_hours * total_overhead_pct
    total_hours = total_base_hours + total_overhead_hours

    # Step 3: Sanity check
    effective_lph = total_lines / total_hours if total_hours > 0 else 0
    sanity_pass = SANITY_TARGET_LOW <= effective_lph <= SANITY_TARGET_HIGH
    sanity_status = "PASS" if sanity_pass else "ADJUST"

    # Step 4: Calendar time
    calendar = {}
    for key, org in ORG_EFFICIENCY.items():
        weeks = total_hours / org["hrs_per_week"]
        months = weeks / 4.33
        calendar[key] = {
            "label": org["label"],
            "efficiency": f"{int(org['efficiency'] * 100)}%",
            "hrs_per_week": org["hrs_per_week"],
            "weeks": round(weeks, 1),
            "months": round(months, 0),
        }

    # Step 5: Cost estimates
    eng_cost_low = total_hours * ROLE_RATES["engineering"]["low"]
    eng_cost_mid = total_hours * hourly_rate
    eng_cost_high = total_hours * ROLE_RATES["engineering"]["high"]

    # Step 6: Full team cost
    team_costs = {}
    for stage_key, ratios in ROLE_RATIOS.items():
        eng_hours = total_hours
        roles = [{"role": "Engineering", "hours": round(eng_hours, 0),
                  "rate": hourly_rate, "cost": round(eng_hours * hourly_rate, 0)}]
        total_team_hours = eng_hours
        total_team_cost = eng_hours * hourly_rate

        for role_key, ratio in ratios.items():
            if role_key == "multiplier" or ratio == 0:
                continue
            role_hours = eng_hours * ratio
            role_rate = ROLE_RATES[role_key]["mid"]
            role_cost = role_hours * role_rate
            total_team_hours += role_hours
            total_team_cost += role_cost
            role_label = {
                "product_mgmt": "Product Management",
                "ux_design": "UX/UI Design",
                "eng_mgmt": "Engineering Management",
                "qa_testing": "QA/Testing",
                "project_mgmt": "Project Management",
                "tech_writing": "Technical Writing",
                "devops": "DevOps/Platform",
            }.get(role_key, role_key)
            roles.append({
                "role": role_label,
                "hours": round(role_hours, 0),
                "rate": role_rate,
                "cost": round(role_cost, 0),
                "ratio": f"{int(ratio * 100)}%",
            })

        team_costs[stage_key] = {
            "multiplier": ratios["multiplier"],
            "total_hours": round(total_team_hours, 0),
            "total_cost": round(total_team_cost, 0),
            "roles": roles,
        }

    # Step 7: Claude ROI (if claude_hours provided)
    roi = None
    if claude_hours and claude_hours > 0:
        speed_multiplier = total_hours / claude_hours
        human_cost = total_hours * HUMAN_BASELINE_RATE
        # Estimate Claude cost: ~$200/month for duration
        claude_months = max(1, claude_hours / (26 * 4.33))  # rough months
        claude_cost = claude_months * 200 + (total_lines / 1000) * 0.5  # sub + API estimate
        claude_cost = max(claude_cost, 200)  # minimum 1 month
        savings = human_cost - claude_cost
        roi_multiplier = savings / claude_cost if claude_cost > 0 else 0

        roi = {
            "claude_hours": claude_hours,
            "speed_multiplier": round(speed_multiplier, 0),
            "human_hours": round(total_hours, 0),
            "human_cost": round(human_cost, 0),
            "claude_cost": round(claude_cost, 0),
            "savings": round(savings, 0),
            "roi_multiplier": round(roi_multiplier, 0),
            "value_per_claude_hour": {
                "engineering_avg": round(eng_cost_mid / claude_hours, 0),
                "growth_company": round(team_costs["growth_company"]["total_cost"] / claude_hours, 0),
                "enterprise": round(team_costs["enterprise"]["total_cost"] / claude_hours, 0),
            },
        }

    return {
        "base_coding": {
            "rows": base_rows,
            "total_lines": total_lines,
            "total_hours": round(total_base_hours, 1),
        },
        "overhead": {
            "rows": overhead_rows,
            "total_percentage": round(total_overhead_pct * 100, 1),
            "total_hours": round(total_overhead_hours, 1),
        },
        "total_estimated_hours": round(total_hours, 0),
        "sanity_check": {
            "effective_lines_per_hour": round(effective_lph, 1),
            "target_range": f"{SANITY_TARGET_LOW}-{SANITY_TARGET_HIGH}",
            "status": sanity_status,
        },
        "calendar_time": calendar,
        "engineering_cost": {
            "low": {"rate": ROLE_RATES["engineering"]["low"], "cost": round(eng_cost_low, 0)},
            "mid": {"rate": hourly_rate, "cost": round(eng_cost_mid, 0)},
            "high": {"rate": ROLE_RATES["engineering"]["high"], "cost": round(eng_cost_high, 0)},
        },
        "team_costs": team_costs,
        "claude_roi": roi,
    }


def main():
    parser = argparse.ArgumentParser(description="Calculate development cost from categorized LOC")
    parser.add_argument("--input", help="JSON file with {category: lines} mapping")
    parser.add_argument("--rate", type=float, default=150.0,
                        help="Recommended hourly rate (default: $150)")
    parser.add_argument("--claude-hours", type=float,
                        help="Estimated Claude active hours for ROI calculation")
    args = parser.parse_args()

    if args.input:
        with open(args.input) as f:
            categories = json.load(f)
    else:
        categories = json.loads(sys.stdin.read())

    result = calculate(categories, args.rate, args.claude_hours)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
