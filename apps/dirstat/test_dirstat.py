import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import dirstat  # noqa: E402


class HumanSizeTest(unittest.TestCase):
    def test_bytes(self):
        self.assertEqual(dirstat.human_size(0), "0 B")
        self.assertEqual(dirstat.human_size(512), "512 B")

    def test_kilobytes(self):
        self.assertEqual(dirstat.human_size(1024), "1.0 KB")

    def test_megabytes(self):
        self.assertEqual(dirstat.human_size(1024 * 1024 * 3), "3.0 MB")


class FileScanTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self._write("small.txt", 10)
        self._write("big.txt", 5000)
        sub = os.path.join(self.root, "sub")
        os.makedirs(sub)
        self._write(os.path.join("sub", "medium.txt"), 1000)

    def tearDown(self):
        self.tmp.cleanup()

    def _write(self, rel, size):
        with open(os.path.join(self.root, rel), "wb") as f:
            f.write(b"x" * size)

    def test_largest_files_order(self):
        result = dirstat.largest_files(self.root, 10)
        sizes = [size for _p, size in result]
        self.assertEqual(sizes, [5000, 1000, 10])

    def test_largest_files_limit(self):
        result = dirstat.largest_files(self.root, 1)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0][1], 5000)

    def test_dir_sizes(self):
        sizes = dirstat.dir_sizes(self.root)
        sub = os.path.join(self.root, "sub")
        self.assertEqual(sizes[sub], 1000)

    def test_main_runs(self):
        rc = dirstat.main([self.root, "-n", "2"])
        self.assertEqual(rc, 0)

    def test_main_bad_path(self):
        rc = dirstat.main([os.path.join(self.root, "nope")])
        self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main()
