#!/usr/bin/env python3
"""
Git Session Analyzer — Estimate development sessions and active hours from git history.

Part of the cost-estimate agent toolchain. Clusters commits into sessions using
a configurable time gap, then estimates active hours per session based on commit density.

Usage:
  python3 git_session_analyzer.py                          # All commits, current branch
  python3 git_session_analyzer.py --branch feat/foo        # Specific branch
  python3 git_session_analyzer.py --commit abc1234         # Single commit
  python3 git_session_analyzer.py --gap-hours 6            # Custom session gap (default: 4h)

Session Duration Heuristics (from cost-estimate config):
  1-2 commits in a session  ->  ~1 hour
  3-5 commits               ->  ~2 hours
  6-10 commits              ->  ~3 hours
  10+ commits               ->  ~4 hours

  NOTE: These are starting estimates. The agent should review and adjust upward
  for large-scope commits (e.g. a single commit adding 5000+ lines likely took
  2-4 hours, not 1 hour). Use `git show <hash> --stat` to check scope.

Session Clustering:
  Commits within a 4-hour window are grouped into one session.
  A gap of >4 hours between consecutive commits starts a new session.

Output JSON structure:
  {
    "scope": "full" | "branch:<name>" | "commit:<hash>",
    "first_commit": "2026-02-22T06:21:33+04:00",
    "last_commit": "2026-03-07T11:59:59+04:00",
    "total_calendar_days": int,
    "total_commits": int,
    "total_sessions": int,
    "estimated_active_hours": float,    # Sum of all session estimates
    "sessions": [
      {
        "date": "2026-02-22",
        "start": "06:21",
        "end": "07:24",
        "commits": int,
        "estimated_hours": float,
        "subjects": ["commit msg 1", "commit msg 2", ...]
      }
    ]
  }
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timedelta


def run(cmd: list[str]) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout.strip()


def get_commits(branch: str | None = None) -> list[dict]:
    """Get all commits with timestamps and subjects."""
    cmd = ["git", "log", "--format=%H|%ai|%s"]
    if branch:
        cmd.append(branch)
    output = run(cmd)
    if not output:
        return []

    commits = []
    for line in output.splitlines():
        parts = line.split("|", 2)
        if len(parts) == 3:
            hash_val, timestamp_str, subject = parts
            # Parse git date format: "2026-02-22 06:21:33 +0400"
            try:
                dt = datetime.strptime(timestamp_str.strip(), "%Y-%m-%d %H:%M:%S %z")
            except ValueError:
                continue
            commits.append({
                "hash": hash_val[:8],
                "timestamp": dt,
                "subject": subject.strip(),
            })

    # Sort chronologically
    commits.sort(key=lambda c: c["timestamp"])
    return commits


def cluster_into_sessions(commits: list[dict], gap_hours: float = 4.0) -> list[dict]:
    """Group commits into sessions based on time gaps."""
    if not commits:
        return []

    sessions = []
    current_session = [commits[0]]

    for i in range(1, len(commits)):
        gap = (commits[i]["timestamp"] - commits[i - 1]["timestamp"]).total_seconds() / 3600
        if gap > gap_hours:
            sessions.append(current_session)
            current_session = [commits[i]]
        else:
            current_session.append(commits[i])

    sessions.append(current_session)
    return sessions


def estimate_session_hours(commit_count: int) -> float:
    """Estimate active hours from commit density.

    Heuristics from cost-estimate agent config:
    - 1-2 commits -> ~1 hour
    - 3-5 commits -> ~2 hours
    - 6-10 commits -> ~3 hours
    - 10+ commits -> ~4 hours
    """
    if commit_count <= 2:
        return 1.0
    elif commit_count <= 5:
        return 2.0
    elif commit_count <= 10:
        return 3.0
    else:
        return 4.0


def main():
    parser = argparse.ArgumentParser(description="Analyze git history for development sessions")
    parser.add_argument("--branch", help="Analyze specific branch")
    parser.add_argument("--commit", help="Analyze single commit")
    parser.add_argument("--gap-hours", type=float, default=4.0,
                        help="Hours between commits to start new session (default: 4)")
    args = parser.parse_args()

    if args.commit:
        # Single commit mode
        output = run(["git", "show", args.commit, "--format=%H|%ai|%s", "--no-patch"])
        parts = output.split("|", 2)
        if len(parts) != 3:
            print(json.dumps({"error": f"Could not parse commit {args.commit}"}))
            sys.exit(1)

        dt = datetime.strptime(parts[1].strip(), "%Y-%m-%d %H:%M:%S %z")
        result = {
            "scope": f"commit:{args.commit}",
            "first_commit": dt.isoformat(),
            "last_commit": dt.isoformat(),
            "total_calendar_days": 1,
            "total_commits": 1,
            "total_sessions": 1,
            "estimated_active_hours": 1.0,
            "sessions": [{
                "date": dt.strftime("%Y-%m-%d"),
                "start": dt.strftime("%H:%M"),
                "end": dt.strftime("%H:%M"),
                "commits": 1,
                "estimated_hours": 1.0,
                "subjects": [parts[2].strip()],
            }],
        }
        print(json.dumps(result, indent=2))
        return

    commits = get_commits(args.branch)
    if not commits:
        print(json.dumps({"error": "No commits found"}))
        sys.exit(1)

    sessions = cluster_into_sessions(commits, args.gap_hours)

    first_commit = commits[0]["timestamp"]
    last_commit = commits[-1]["timestamp"]
    calendar_days = max(1, (last_commit - first_commit).days + 1)

    session_details = []
    total_active_hours = 0.0

    for session_commits in sessions:
        start = session_commits[0]["timestamp"]
        end = session_commits[-1]["timestamp"]
        count = len(session_commits)
        hours = estimate_session_hours(count)
        total_active_hours += hours

        subjects = [c["subject"] for c in session_commits]

        session_details.append({
            "date": start.strftime("%Y-%m-%d"),
            "start": start.strftime("%H:%M"),
            "end": end.strftime("%H:%M"),
            "commits": count,
            "estimated_hours": hours,
            "subjects": subjects,
        })

    result = {
        "scope": f"branch:{args.branch}" if args.branch else "full",
        "first_commit": first_commit.isoformat(),
        "last_commit": last_commit.isoformat(),
        "total_calendar_days": calendar_days,
        "total_commits": len(commits),
        "total_sessions": len(sessions),
        "estimated_active_hours": total_active_hours,
        "sessions": session_details,
    }

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
