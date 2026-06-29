import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import jsonpeek  # noqa: E402

SAMPLE = {
    "name": "felix",
    "count": 3,
    "users": [{"name": "ann"}, {"name": "bob"}],
    "nested": {"deep": {"value": 42}},
}


class ParsePathTest(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(jsonpeek.parse_path(""), [])

    def test_mixed(self):
        self.assertEqual(jsonpeek.parse_path("users.0.name"), ["users", 0, "name"])

    def test_negative_index(self):
        self.assertEqual(jsonpeek.parse_path("a.-1"), ["a", -1])


class ResolvePathTest(unittest.TestCase):
    def test_root(self):
        self.assertEqual(jsonpeek.resolve_path(SAMPLE, []), SAMPLE)

    def test_dict_key(self):
        self.assertEqual(jsonpeek.resolve_path(SAMPLE, ["name"]), "felix")

    def test_list_index(self):
        self.assertEqual(jsonpeek.resolve_path(SAMPLE, ["users", 1, "name"]), "bob")

    def test_deep(self):
        self.assertEqual(jsonpeek.resolve_path(SAMPLE, ["nested", "deep", "value"]), 42)

    def test_missing_key(self):
        with self.assertRaises(jsonpeek.PathError):
            jsonpeek.resolve_path(SAMPLE, ["nope"])

    def test_index_out_of_range(self):
        with self.assertRaises(jsonpeek.PathError):
            jsonpeek.resolve_path(SAMPLE, ["users", 9])

    def test_index_on_non_list(self):
        with self.assertRaises(jsonpeek.PathError):
            jsonpeek.resolve_path(SAMPLE, ["name", 0])

    def test_key_on_non_dict(self):
        with self.assertRaises(jsonpeek.PathError):
            jsonpeek.resolve_path(SAMPLE, ["count", "x"])


class FormatValueTest(unittest.TestCase):
    def test_string_raw(self):
        self.assertEqual(jsonpeek.format_value("hi"), "hi")

    def test_number(self):
        self.assertEqual(jsonpeek.format_value(42), "42")

    def test_object_pretty(self):
        out = jsonpeek.format_value({"a": 1})
        self.assertIn('"a": 1', out)


class MainTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        )
        json.dump(SAMPLE, self.tmp)
        self.tmp.close()
        self.path = self.tmp.name

    def tearDown(self):
        os.unlink(self.path)

    def _run(self, argv):
        buf = io.StringIO()
        with mock.patch("sys.stdout", buf):
            rc = jsonpeek.main(argv)
        return rc, buf.getvalue()

    def test_whole_file(self):
        rc, out = self._run([self.path])
        self.assertEqual(rc, 0)
        self.assertIn("felix", out)

    def test_query_path(self):
        rc, out = self._run([self.path, "users.1.name"])
        self.assertEqual(rc, 0)
        self.assertEqual(out.strip(), "bob")

    def test_keys(self):
        rc, out = self._run([self.path, "--keys"])
        self.assertEqual(rc, 0)
        self.assertIn("users", out.split())

    def test_missing_file(self):
        rc, _ = self._run(["/no/such/file.json"])
        self.assertEqual(rc, 1)

    def test_bad_path(self):
        rc, _ = self._run([self.path, "does.not.exist"])
        self.assertEqual(rc, 1)

    def test_invalid_json(self):
        bad = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        )
        bad.write("{not valid")
        bad.close()
        try:
            rc, _ = self._run([bad.name])
            self.assertEqual(rc, 1)
        finally:
            os.unlink(bad.name)


if __name__ == "__main__":
    unittest.main()
