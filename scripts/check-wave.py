"""Scan the staged Git snapshot for indicators from the Wave maintainer advisory."""

import json
import os
import posixpath
import re
import shlex
import subprocess
import sys


# Split literals so the scanner and its tests are covered by the same rules.
MARKERS = ["rmcej" "%otb%", "Cot%" "3T=sthP", "_$" "__1e42"]
FONTS = {"fa-solid-500.woff2", "fa-solid-600.eot", "fa-solid.lik", "fa-solid-300.ttf"}
CONFIG = re.compile(r"(postcss|tailwind|eslint|next|jest|vite)\.config(?:\.(?:[cm]?[jt]s|json))?$")
WHITESPACE = re.compile(rb"\s+")
CONFIG_EXECUTION = re.compile(
    rb"""\b(?:eval|Function)\s*\(|\b(?:from\s*|import\s*|(?:require|import)\s*\(\s*)["'](?:node:)?child_process["']"""
)
STRING = r'"(?:[^"\\]|\\.)*"'
COMMENTS = re.compile(STRING + r"|//[^\n]*|/\*.*?\*/", re.DOTALL)
TRAILING_COMMA = re.compile(STRING + r"|,\s*(?=[}\]])", re.DOTALL)


def padded_code(raw):
    for gap in WHITESPACE.finditer(raw):
        if gap.end() < len(raw):
            padding = gap[0]
            if b" " * 40 in padding or b"\t" * 8 in padding or padding.count(b"\n") >= 10:
                return True
    return False


def jsonc(raw):
    text = raw.decode("utf-8-sig")
    text = COMMENTS.sub(lambda m: " " if m[0].startswith("/") else m[0], text)
    text = TRAILING_COMMA.sub(lambda m: "" if m[0].startswith(",") else m[0], text)
    return json.loads(text)


def folder_open(value):
    if isinstance(value, list):
        return any(folder_open(item) for item in value)
    if isinstance(value, dict):
        return value.get("runOn") == "folderOpen" or any(folder_open(v) for v in value.values())
    return False


def script_targets(command):
    # Shell punctuation separates commands even when operators have no surrounding spaces.
    lexer = shlex.shlex(command, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    return [posixpath.normpath(token) for token in lexer]


def scan():
    entries = subprocess.check_output(["git", "ls-files", "--stage", "-z"]).split(b"\0")
    files = {}
    for entry in filter(None, entries):
        metadata, name = entry.split(b"\t", 1)
        mode, oid, _stage = metadata.split()
        files[os.fsdecode(name)] = (mode, oid)

    args = ["git", "grep", "--cached", "--no-textconv", "-aFlz"]
    for marker in MARKERS:
        args.extend(["-e", marker])
    matches = subprocess.run(args + ["--"], stdout=subprocess.PIPE)
    if matches.returncode not in (0, 1):
        matches.check_returncode()
    for path in filter(None, matches.stdout.split(b"\0")):
        yield os.fsdecode(path), "known Wave marker"

    for path, (mode, oid) in files.items():
        name = posixpath.basename(path)
        if name in FONTS or path.endswith("/dist/setup.js") or path == "dist/setup.js":
            yield path, "reported Wave filename"

        editor = "/.vscode/" + name
        vscode = ("/" + path).endswith(editor) and name in {"tasks.json", "settings.json"}
        if not (vscode or name == "package.json" or CONFIG.fullmatch(name)):
            continue
        if not mode.startswith(b"100"):
            yield path, "cannot inspect a non-regular configuration file"
            continue
        raw = subprocess.check_output(["git", "cat-file", "blob", oid])
        try:
            if vscode:
                config = jsonc(raw)
                if name == "tasks.json" and folder_open(config):
                    yield path, "VS Code runs a task when the folder opens"
                if name == "settings.json" and config.get("task.allowAutomaticTasks") == "on":
                    yield path, "VS Code automatic tasks enabled"
            elif name == "package.json":
                scripts = json.loads(raw).get("scripts", {})
                for hook in ("preinstall", "start", "dev"):
                    tokens = script_targets(scripts.get(hook, ""))
                    if hook == "preinstall" and any(t.endswith("/dist/setup.js") or t == "dist/setup.js" for t in tokens):
                        yield path, "preinstall references dist/setup.js"
                    if hook in ("start", "dev") and any(
                        posixpath.basename(t) == "api.js"
                        and posixpath.normpath(posixpath.join(posixpath.dirname(path), t)) in files
                        for t in tokens
                    ):
                        yield path, f"{hook} references a tracked api.js"
            elif CONFIG_EXECUTION.search(raw):
                yield path, "configuration references dynamic evaluation or child process execution"
            elif padded_code(raw):
                yield path, "configuration contains code after unusually long whitespace"
        except (ValueError, AttributeError, TypeError) as error:
            yield path, f"cannot inspect configuration ({type(error).__name__})"


if __name__ == "__main__":
    findings = list(scan())
    for path, reason in findings:
        print(f"{ascii(path)}: {reason}", file=sys.stderr)
    if findings:
        sys.exit("Wave indicators require maintainer review.")
    print("Wave indicator scan passed.")
