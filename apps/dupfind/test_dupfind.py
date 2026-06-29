import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import dupfind  # noqa: E402


class HumanSizeTest(unittest.TestCase):
    def test_bytes(self):
        self.assertEqual(dupfind.human_size(0), "0 B")

    def test_kb(self):
        self.assertEqual(dupfind.human_size(2048), "2.0 KB")


class DuplicateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def _write(self, rel, content):
        path = os.path.join(self.root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(rel) else None
        with open(path, "wb") as f:
            f.write(content)
        return path

    def test_finds_identical(self):
        self._write("a.txt", b"hello world")
        self._write("b.txt", b"hello world")
        groups = dupfind.find_duplicates(self.root)
        self.assertEqual(len(groups), 1)
        self.assertEqual(len(groups[0]), 2)

    def test_ignores_unique(self):
        self._write("a.txt", b"one")
        self._write("b.txt", b"two different length")
        groups = dupfind.find_duplicates(self.root)
        self.assertEqual(groups, [])

    def test_same_size_different_content(self):
        # Gleiche Größe, anderer Inhalt -> kein Duplikat.
        self._write("a.txt", b"AAAA")
        self._write("b.txt", b"BBBB")
        groups = dupfind.find_duplicates(self.root)
        self.assertEqual(groups, [])

    def test_three_copies(self):
        for name in ("a", "b", "c"):
            self._write(f"{name}.txt", b"same content here")
        groups = dupfind.find_duplicates(self.root)
        self.assertEqual(len(groups), 1)
        self.assertEqual(len(groups[0]), 3)

    def test_nested_dirs(self):
        self._write("top.txt", b"dup")
        sub = os.path.join(self.root, "sub")
        os.makedirs(sub)
        with open(os.path.join(sub, "deep.txt"), "wb") as f:
            f.write(b"dup")
        groups = dupfind.find_duplicates(self.root)
        self.assertEqual(len(groups), 1)
        self.assertEqual(len(groups[0]), 2)

    def test_min_size_filter(self):
        self._write("a.txt", b"xy")
        self._write("b.txt", b"xy")
        self.assertEqual(dupfind.find_duplicates(self.root, min_size=100), [])
        self.assertEqual(len(dupfind.find_duplicates(self.root, min_size=1)), 1)

    def test_wasted_bytes(self):
        self._write("a.txt", b"0123456789")  # 10 Bytes
        self._write("b.txt", b"0123456789")
        groups = dupfind.find_duplicates(self.root)
        self.assertEqual(dupfind.wasted_bytes(groups), 10)

    def test_hash_file(self):
        path = self._write("h.txt", b"abc")
        import hashlib

        self.assertEqual(dupfind.hash_file(path), hashlib.sha256(b"abc").hexdigest())


class MainTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_no_dups(self):
        self.assertEqual(dupfind.main([self.root]), 0)

    def test_bad_path(self):
        self.assertEqual(dupfind.main([os.path.join(self.root, "nope")]), 1)

    def test_json_mode(self):
        self.assertEqual(dupfind.main([self.root, "--json"]), 0)


if __name__ == "__main__":
    unittest.main()
