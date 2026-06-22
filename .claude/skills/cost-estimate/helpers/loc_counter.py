#!/usr/bin/env python3
"""
LOC Counter — Count lines of code in any git repository.

Part of the cost-estimate agent toolchain. Respects .gitignore via `git ls-files`.
Outputs structured JSON for downstream classification and cost calculation.

Usage:
  python3 loc_counter.py                                    # Full repo
  python3 loc_counter.py --branch feat/foo                  # Branch diff (added lines only)
  python3 loc_counter.py --branch feat/foo --base develop   # Diff against specific base
  python3 loc_counter.py --commit abc1234                   # Single commit diff
  python3 loc_counter.py --exclude "vendor/*"               # Exclude patterns

Output JSON structure:
  {
    "scope": "full" | "branch:<name>" | "commit:<hash>",
    "totals": {
      "lines": int,           # Total lines counted
      "files": int,           # Total files counted
      "source_lines": int,    # Lines excluding tests, docs, config
      "test_lines": int,      # Lines in test files
      "doc_lines": int,       # Lines in documentation files
      "config_lines": int     # Lines in config/build files
    },
    "by_language": {           # Grouped by detected language
      "Swift": {"lines": int, "files": int},
      ...
    },
    "by_directory": {          # Grouped by top-level directory
      "src/components": {"lines": int, "files": int},
      ...
    },
    "top_files": [...],        # Top 50 files by line count
    "all_files": [             # Every file with metadata
      {
        "path": str,
        "lines": int,
        "category": str,       # Detected language/type
        "directory": str,
        "is_test": bool,
        "is_doc": bool,
        "is_config": bool
      }
    ]
  }

File classification heuristics:
  - Tests:  files in tests/test/__tests__/spec dirs, or *_test.*, *.test.*, *.spec.*
  - Docs:   .md, .rst, .adoc, .txt files
  - Config: .plist, .entitlements, .yml in config dirs, package.json, Makefile, etc.
  - Binary files and common non-source extensions (.png, .mp3, .zip, etc.) are skipped
"""

import argparse
import json
import os
import subprocess
import sys
from collections import defaultdict
from pathlib import Path


def run(cmd: list[str], cwd: str | None = None) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    return result.stdout.strip()


def get_git_root() -> str:
    root = run(["git", "rev-parse", "--show-toplevel"])
    if not root:
        print("Error: not a git repository", file=sys.stderr)
        sys.exit(1)
    return root


def get_tracked_files(git_root: str) -> list[str]:
    output = run(["git", "ls-files"], cwd=git_root)
    return [f for f in output.splitlines() if f]


def count_lines(filepath: str) -> int:
    try:
        with open(filepath, "r", errors="replace") as f:
            return sum(1 for _ in f)
    except (OSError, UnicodeDecodeError):
        return 0


def is_binary(filepath: str) -> bool:
    try:
        with open(filepath, "rb") as f:
            chunk = f.read(8192)
            return b"\x00" in chunk
    except OSError:
        return True


def get_branch_diff_files(branch: str, base: str, git_root: str) -> dict[str, int]:
    """Get added lines per file for a branch diff."""
    output = run(
        ["git", "diff", f"{base}...{branch}", "--numstat"], cwd=git_root
    )
    result = {}
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            added, _, filepath = parts
            if added != "-":  # skip binary
                result[filepath] = int(added)
    return result


def get_commit_diff_files(commit: str, git_root: str) -> dict[str, int]:
    """Get added lines per file for a single commit."""
    output = run(["git", "show", commit, "--numstat", "--format="], cwd=git_root)
    result = {}
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            added, _, filepath = parts
            if added != "-":
                result[filepath] = int(added)
    return result


# Common non-source extensions to skip
SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".bmp", ".tiff",
    ".mp3", ".mp4", ".wav", ".m4a", ".aac", ".ogg", ".mov", ".avi",
    ".zip", ".tar", ".gz", ".bz2", ".xz", ".rar", ".7z",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".pyc", ".pyo", ".class", ".o", ".a", ".dylib", ".so", ".dll",
    ".DS_Store", ".lock",
    ".pbxproj",  # Xcode project files (generated)
}

# File extensions grouped by category
EXTENSION_CATEGORIES = {
    # Languages
    ".swift": "Swift",
    ".m": "Objective-C",
    ".mm": "Objective-C++",
    ".h": "C/ObjC Header",
    ".c": "C",
    ".cpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    ".rs": "Rust",
    ".go": "Go",
    ".java": "Java",
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".scala": "Scala",
    ".py": "Python",
    ".rb": "Ruby",
    ".php": "PHP",
    ".js": "JavaScript",
    ".jsx": "JavaScript (JSX)",
    ".ts": "TypeScript",
    ".tsx": "TypeScript (TSX)",
    ".vue": "Vue",
    ".svelte": "Svelte",
    ".dart": "Dart",
    ".lua": "Lua",
    ".r": "R",
    ".ex": "Elixir",
    ".exs": "Elixir",
    ".erl": "Erlang",
    ".hs": "Haskell",
    ".ml": "OCaml",
    ".cs": "C#",
    ".fs": "F#",
    ".clj": "Clojure",
    ".zig": "Zig",
    ".nim": "Nim",
    ".metal": "Metal (GPU)",
    ".glsl": "GLSL (GPU)",
    ".hlsl": "HLSL (GPU)",
    ".wgsl": "WGSL (GPU)",
    ".cu": "CUDA",
    # Markup & styles
    ".html": "HTML",
    ".htm": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".sass": "Sass",
    ".less": "Less",
    # Data & config
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
    ".xml": "XML",
    ".plist": "Property List",
    ".entitlements": "Entitlements",
    ".xcconfig": "Xcode Config",
    ".storyboard": "Storyboard",
    ".xib": "XIB",
    # Build & CI
    ".gradle": "Gradle",
    ".cmake": "CMake",
    ".makefile": "Makefile",
    ".dockerfile": "Dockerfile",
    ".tf": "Terraform",
    ".hcl": "HCL",
    # Docs
    ".md": "Markdown",
    ".rst": "reStructuredText",
    ".txt": "Text",
    ".adoc": "AsciiDoc",
    # Shell
    ".sh": "Shell",
    ".bash": "Shell",
    ".zsh": "Shell",
    ".fish": "Fish",
    ".ps1": "PowerShell",
    # SQL
    ".sql": "SQL",
}


def categorize_file(filepath: str) -> str:
    """Determine category from file extension."""
    name = os.path.basename(filepath).lower()

    # Special filenames
    if name in ("makefile", "gnumakefile"):
        return "Makefile"
    if name in ("dockerfile", "containerfile"):
        return "Dockerfile"
    if name in ("package.swift",):
        return "Swift Package Manifest"
    if name in ("project.yml", "project.yaml"):
        return "XcodeGen Config"
    if name in ("podfile",):
        return "CocoaPods"
    if name in ("gemfile",):
        return "Ruby (Gemfile)"
    if name in ("cargo.toml",):
        return "Cargo Config"

    ext = Path(filepath).suffix.lower()
    return EXTENSION_CATEGORIES.get(ext, f"Other ({ext})" if ext else "Other")


def should_skip(filepath: str, exclude_patterns: list[str]) -> bool:
    ext = Path(filepath).suffix.lower()
    if ext in SKIP_EXTENSIONS:
        return True
    name = os.path.basename(filepath)
    if name in (".DS_Store", "Thumbs.db"):
        return True
    for pattern in exclude_patterns:
        if pattern.startswith("*.") and filepath.endswith(pattern[1:]):
            return True
        if "/" in pattern and pattern.rstrip("*") in filepath:
            return True
    return False


def detect_test_file(filepath: str) -> bool:
    parts = filepath.lower().split("/")
    name = os.path.basename(filepath).lower()
    # Directory-based
    if any(p in ("tests", "test", "__tests__", "spec", "specs", "testing") for p in parts):
        return True
    # Name-based
    if any(name.endswith(s) for s in ("test.swift", "tests.swift", "_test.go",
                                       "_test.py", ".test.ts", ".test.js",
                                       ".spec.ts", ".spec.js", "_spec.rb")):
        return True
    if name.startswith("test_") or name.startswith("test."):
        return True
    return False


def detect_doc_file(filepath: str) -> bool:
    ext = Path(filepath).suffix.lower()
    if ext in (".md", ".rst", ".adoc", ".txt"):
        name = os.path.basename(filepath).lower()
        # Docs but not changelogs or licenses which are boilerplate
        return True
    return False


def detect_config_file(filepath: str) -> bool:
    ext = Path(filepath).suffix.lower()
    name = os.path.basename(filepath).lower()
    config_exts = {".plist", ".entitlements", ".xcconfig", ".yml", ".yaml",
                   ".toml", ".json", ".xml"}
    config_names = {"package.swift", "project.yml", "project.yaml",
                    "podfile", "gemfile", "cargo.toml", "tsconfig.json",
                    "package.json", ".eslintrc", ".prettierrc",
                    "dockerfile", "docker-compose.yml", ".env.example",
                    "makefile", ".gitignore", ".editorconfig"}
    if name in config_names:
        return True
    if ext in config_exts:
        # Only if it looks like a config, not app data
        parts = filepath.lower().split("/")
        if any(p in ("config", "configs", "configuration", ".github", ".circleci") for p in parts):
            return True
        if name.endswith("config.json") or name.endswith("rc.json"):
            return True
    return False


def main():
    parser = argparse.ArgumentParser(description="Count lines of code in a repository")
    parser.add_argument("--branch", help="Count only added lines in branch diff")
    parser.add_argument("--base", default="main", help="Base branch for diff (default: main)")
    parser.add_argument("--commit", help="Count only added lines in a single commit")
    parser.add_argument("--exclude", action="append", default=[], help="Glob patterns to exclude")
    parser.add_argument("--top-dirs", type=int, default=3, help="Depth for directory grouping")
    args = parser.parse_args()

    git_root = get_git_root()
    scope = "full"
    diff_lines: dict[str, int] = {}

    if args.branch:
        scope = f"branch:{args.branch}"
        diff_lines = get_branch_diff_files(args.branch, args.base, git_root)
    elif args.commit:
        scope = f"commit:{args.commit}"
        diff_lines = get_commit_diff_files(args.commit, git_root)

    files = get_tracked_files(git_root)

    # Per-directory stats
    dir_stats: dict[str, dict] = defaultdict(lambda: {"lines": 0, "files": 0, "extensions": defaultdict(int)})
    # Per-extension stats
    ext_stats: dict[str, dict] = defaultdict(lambda: {"lines": 0, "files": 0})
    # Per-file detail
    file_details: list[dict] = []
    # Totals
    total_lines = 0
    total_files = 0
    test_lines = 0
    test_files = 0
    doc_lines = 0
    doc_files = 0
    config_lines = 0
    config_files = 0

    for rel_path in files:
        if should_skip(rel_path, args.exclude):
            continue

        full_path = os.path.join(git_root, rel_path)

        if scope == "full":
            if not os.path.isfile(full_path):
                continue
            if is_binary(full_path):
                continue
            lines = count_lines(full_path)
        else:
            if rel_path not in diff_lines:
                continue
            lines = diff_lines[rel_path]

        if lines == 0:
            continue

        category = categorize_file(rel_path)
        is_test = detect_test_file(rel_path)
        is_doc = detect_doc_file(rel_path)
        is_config = detect_config_file(rel_path)

        # Directory grouping (top N levels)
        parts = rel_path.split("/")
        dir_key = "/".join(parts[:min(args.top_dirs, len(parts) - 1)]) or "."

        dir_stats[dir_key]["lines"] += lines
        dir_stats[dir_key]["files"] += 1
        ext = Path(rel_path).suffix.lower() or os.path.basename(rel_path)
        dir_stats[dir_key]["extensions"][ext] += lines

        ext_stats[category]["lines"] += lines
        ext_stats[category]["files"] += 1

        total_lines += lines
        total_files += 1

        if is_test:
            test_lines += lines
            test_files += 1
        if is_doc:
            doc_lines += lines
            doc_files += 1
        if is_config:
            config_lines += lines
            config_files += 1

        file_details.append({
            "path": rel_path,
            "lines": lines,
            "category": category,
            "directory": dir_key,
            "is_test": is_test,
            "is_doc": is_doc,
            "is_config": is_config,
        })

    # Sort file details by lines descending
    file_details.sort(key=lambda x: x["lines"], reverse=True)

    # Build output
    output = {
        "scope": scope,
        "git_root": git_root,
        "totals": {
            "lines": total_lines,
            "files": total_files,
            "test_lines": test_lines,
            "test_files": test_files,
            "doc_lines": doc_lines,
            "doc_files": doc_files,
            "config_lines": config_lines,
            "config_files": config_files,
            "source_lines": total_lines - test_lines - doc_lines - config_lines,
        },
        "by_language": {
            k: v for k, v in sorted(ext_stats.items(), key=lambda x: x[1]["lines"], reverse=True)
        },
        "by_directory": {
            k: {"lines": v["lines"], "files": v["files"]}
            for k, v in sorted(dir_stats.items(), key=lambda x: x[1]["lines"], reverse=True)
        },
        "top_files": file_details[:50],
        "all_files": file_details,
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
