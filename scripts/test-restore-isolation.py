"""Exercise the restoration drill using fake tools, never real containers/data."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class RestoreIsolationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="isms-restore-isolation-")
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        (self.root / "bin").mkdir()
        source = Path(__file__).parent / "test-restore-functional.sh"
        shutil.copyfile(source, self.root / "scripts/drill.sh")
        self.log = self.root / "calls.log"
        self.env = {**os.environ, "PATH": f"{self.root / 'bin'}:{os.environ['PATH']}",
                    "TEST_LOG": str(self.log), "FAIL_RESTORE": "0"}
        for name in ("docker", "jq", "curl"):
            self.write_script(self.root / "bin" / name, 'echo "tool:$0:$*:$COMPOSE_PROJECT_NAME:$COMPOSE_FILE" >> "$TEST_LOG"\n')
        common = '''case "$COMPOSE_PROJECT_NAME:$COMPOSE_FILE" in
  isms-restore-test-*:*deploy/compose/verify.yml) ;;
  *) exit 97 ;;
esac
echo "nested:$0:$COMPOSE_PROJECT_NAME:$COMPOSE_FILE" >> "$TEST_LOG"
'''
        self.write_script(self.root / "scripts/provision-runtime-credentials.sh", common + "touch .env.app .env.redis\n")
        (self.root / "scripts/provision-runtime-credentials.sh").chmod(0o600)
        self.write_script(self.root / "scripts/backup.sh", common + 'mkdir -p "$1"\n')
        self.write_script(self.root / "scripts/restore.sh", common + '[ "$FAIL_RESTORE" = 0 ] || exit 42\n')

    def tearDown(self):
        self.temp.cleanup()

    def write_script(self, path, body):
        path.write_text("#!/bin/sh\nset -eu\n" + body)
        path.chmod(0o700)

    def run_drill(self):
        return subprocess.run(["sh", "scripts/drill.sh"], cwd=self.root,
                              env=self.env, capture_output=True, timeout=15)

    def test_all_nested_commands_inherit_the_isolated_project_and_files(self):
        result = self.run_drill()
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        lines = self.log.read_text().splitlines()
        self.assertTrue(any("scripts/restore.sh:" in line for line in lines))
        self.assertTrue(all("isms-restore-test-" in line and "deploy/compose/verify.yml" in line for line in lines))
        self.assertFalse((self.root / ".env.app").exists())

    def test_existing_runtime_credentials_are_preserved_and_no_docker_runs(self):
        credentials = self.root / ".env.app"
        credentials.write_text("existing-test-credentials")
        self.assertNotEqual(self.run_drill().returncode, 0)
        self.assertEqual(credentials.read_text(), "existing-test-credentials")
        self.assertFalse(self.log.exists())

    def test_failure_status_survives_cleanup(self):
        self.env["FAIL_RESTORE"] = "1"
        self.assertEqual(self.run_drill().returncode, 42)
        self.assertFalse((self.root / ".env.redis").exists())
        self.assertIn("down -v", self.log.read_text())


if __name__ == "__main__":
    unittest.main()
