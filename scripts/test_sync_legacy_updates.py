import json
import tempfile
import unittest
from pathlib import Path
from sync_legacy_updates import manifest, select, update

class LegacyBridgeTest(unittest.TestCase):
    def release(self, tag, code=None, pre=False):
        return {'draft':False,'prerelease':pre,'tag_name':tag,
                'body':f'Version code: {code}' if code else '',
                'assets':[{'name':'a.apk','browser_download_url':f'https://github.com/N2K02/BCam/releases/download/{tag}/a.apk',
                           'digest':'sha256:'+'a'*64,'size':12}]}
    def test_stable_requires_actual_code_and_signed_asset(self):
        self.assertIsNone(manifest('BCam', self.release('v1.0'), 'stable'))
        r = self.release('v1.0', 100123)
        self.assertEqual(100123, manifest('BCam', r, 'stable')['versionCode'])
        r['assets'][0]['digest'] = None
        self.assertIsNone(manifest('BCam', r, 'stable'))
    def test_experimental_fallback_and_latest(self):
        old = self.release('experimental-pr-2-run-3', pre=True)
        new = self.release('experimental-pr-2-run-5', pre=True)
        self.assertEqual(100005, select('BCam', [old,new], 'experimental')['versionCode'])
        self.assertIsNone(manifest('BCam', new, 'stable'))
    def test_reject_wrong_repo_and_regression(self):
        r = self.release('v1.0', 100123)
        self.assertIsNone(manifest('Other', r, 'stable'))
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'stable.json'; p.write_text(json.dumps({'versionCode':100124}))
            self.assertFalse(update(p, manifest('BCam', r, 'stable')))
            self.assertEqual(100124, json.loads(p.read_text())['versionCode'])
    def test_safe_write_and_equal_code(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'updates'/'stable.json'; value = manifest('BCam', self.release('v1.0', 100123), 'stable')
            self.assertTrue(update(p, value)); self.assertFalse(update(p, value))
            self.assertEqual('a'*64, json.loads(p.read_text())['sha256'])

if __name__ == '__main__': unittest.main()
