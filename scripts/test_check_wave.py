"""Exercise the scanner through its CI entry point against staged Git blobs."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCANNER = Path(__file__).with_name("check-wave.py").resolve()


class WaveCheck(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)

    def put(self, name, content):
        path = self.root / name
        path.parent.mkdir(exist_ok=True, parents=True)
        path.write_bytes(content if isinstance(content, bytes) else content.encode())

    def scan(self):
        subprocess.run(["git", "add", "-f", "."], cwd=self.root, check=True)
        return subprocess.run([sys.executable, "-I", SCANNER], cwd=self.root, text=True, capture_output=True)

    def test_indicators(self):
        cases = {
            "nested/.vscode/tasks.json": '{"tasks":[{ /*comment*/ "runOptions":{"runOn":"folderOpen",},},]}',
            ".vscode/settings.json": '{"task.allowAutomaticTasks":"on"}',
            "project/dist/setup.js": "",
            "nested/package.json": json.dumps({"scripts": {"start": 'node "./api.js"', "dev": "bun api.js"}}),
            "nested/api.js": "",
            "package.json": '{"scripts":{"preinstall":"node ./dist/setup.js"}}',
        }
        for name in ("fa-solid-500.woff2", "fa-solid-600.eot", "fa-solid.lik", "fa-solid-300.ttf"):
            cases["assets/" + name] = b""
        for i, marker in enumerate((b"rmcej" b"%otb%", b"Cot%" b"3T=sthP", b"_$" b"__1e42")):
            cases[f"binary{i}"] = b"\0" + marker
        for tool in ("postcss", "tailwind", "eslint", "next", "jest", "vite"):
            cases[tool + ".config.mjs"] = "export default {}" + "\n" * 12 + "example()"
        cases["jest.config.json"] = "{" + " " * 80 + "}"
        for name, content in cases.items():
            self.put(name, content)
        result = self.scan()
        self.assertEqual(result.returncode, 1, result.stderr)
        for path in cases.keys() - {"nested/api.js"}:
            self.assertIn(repr(path), result.stderr)
        for hook in ("start", "dev"):
            self.assertIn(hook + " references", result.stderr)

    def test_unpadded_high_risk_config(self):
        self.put("next.config.ts", "export default {};\n" + "eval" + "('1 + 1')")
        self.put("vite.config.js", "import { spawn } from 'node:child_process'")
        result = self.scan()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("'next.config.ts'", result.stderr)
        self.assertIn("'vite.config.js'", result.stderr)

    def test_clean_snapshot(self):
        self.put(".vscode/tasks.json", '{"tasks":[], /* "runOn":"folderOpen" */ "url":"https://example.org",}')
        self.put(".vscode/settings.json", '{"task.allowAutomaticTasks":"off"}')
        self.put("package.json", '{"scripts":{"dev":"node api.js"}}')
        self.put("other/api.js", "")
        self.put("vite.config.ts", "export default {}" + "\n" * 20)
        self.put("scanner.py", SCANNER.read_bytes())
        self.put("tests.py", Path(__file__).read_bytes())
        result = self.scan()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_invalid_manifest_and_linked_config_fail_closed(self):
        self.put("package.json", "{")
        (self.root / "next.config.js").symlink_to("/does/not/exist")
        result = self.scan()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("cannot inspect a non-regular", result.stderr)
        self.assertIn("JSONDecodeError", result.stderr)


if __name__ == "__main__":
    unittest.main()
