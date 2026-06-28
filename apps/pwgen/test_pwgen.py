import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import pwgen  # noqa: E402


class CharsetTest(unittest.TestCase):
    def test_all_classes(self):
        cs = pwgen.build_charset(True, True, True, True)
        self.assertTrue(set(pwgen.LOWER) <= set(cs))
        self.assertTrue(set(pwgen.SYMBOLS) <= set(cs))

    def test_only_digits(self):
        cs = pwgen.build_charset(False, False, True, False)
        self.assertEqual(set(cs), set(pwgen.DIGITS))

    def test_empty(self):
        self.assertEqual(pwgen.build_charset(False, False, False, False), "")


class GeneratePasswordTest(unittest.TestCase):
    def test_length(self):
        pw = pwgen.generate_password(20, pwgen.LOWER)
        self.assertEqual(len(pw), 20)

    def test_charset_respected(self):
        pw = pwgen.generate_password(50, pwgen.DIGITS)
        self.assertTrue(all(c in pwgen.DIGITS for c in pw))

    def test_zero_length_raises(self):
        with self.assertRaises(ValueError):
            pwgen.generate_password(0, pwgen.LOWER)

    def test_empty_charset_raises(self):
        with self.assertRaises(ValueError):
            pwgen.generate_password(5, "")

    def test_randomish(self):
        # Zwei Passwörter sollten praktisch nie identisch sein.
        a = pwgen.generate_password(32, pwgen.build_charset(True, True, True, True))
        b = pwgen.generate_password(32, pwgen.build_charset(True, True, True, True))
        self.assertNotEqual(a, b)


class PassphraseTest(unittest.TestCase):
    def test_word_count(self):
        phrase = pwgen.generate_passphrase(4)
        self.assertEqual(len(phrase.split("-")), 4)

    def test_words_from_list(self):
        phrase = pwgen.generate_passphrase(6)
        for word in phrase.split("-"):
            self.assertIn(word, pwgen.WORDS)

    def test_zero_words_raises(self):
        with self.assertRaises(ValueError):
            pwgen.generate_passphrase(0)


class EntropyTest(unittest.TestCase):
    def test_bits_increase_with_length(self):
        self.assertLess(pwgen.estimate_bits(8, 26), pwgen.estimate_bits(16, 26))

    def test_degenerate(self):
        self.assertEqual(pwgen.estimate_bits(0, 26), 0.0)
        self.assertEqual(pwgen.estimate_bits(10, 1), 0.0)


class MainTest(unittest.TestCase):
    def test_default_ok(self):
        self.assertEqual(pwgen.main(["-l", "12"]), 0)

    def test_all_disabled(self):
        rc = pwgen.main(["--no-lower", "--no-upper", "--no-digits", "--no-symbols"])
        self.assertEqual(rc, 1)

    def test_passphrase_mode(self):
        self.assertEqual(pwgen.main(["--words", "3"]), 0)

    def test_bad_count(self):
        self.assertEqual(pwgen.main(["-c", "0"]), 1)


if __name__ == "__main__":
    unittest.main()
