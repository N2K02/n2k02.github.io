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

    def test_legacy_adb_endpoints_ignore_other_architectures_and_bad_name(self):
        def variant(track, code, experimental=False):
            tag = f'experimental-{track}-pr-4-run-12' if experimental else f'{track}-v1.0'
            release = self.release(tag, code, experimental)
            suffix = '-experimental.1' if experimental else ''
            name = f'VREC-{track.upper()}-1.0{suffix}.apk'
            release['assets'][0].update(
                name=name,
                browser_download_url=f'https://github.com/N2K02/VREC/releases/download/{tag}/{name}',
            )
            return release

        for channel in ('stable', 'experimental'):
            experimental = channel == 'experimental'
            adb = variant('adb', 100122, experimental)
            shizuku = variant('shizuku', 100123, experimental)
            self.assertEqual(100122, select('VREC', [shizuku, adb], channel)['versionCode'])
            self.assertIsNone(select('VREC', [shizuku], channel))
            adb['assets'][0]['name'] += '.apk'
            self.assertIsNone(select('VREC', [adb], channel))

    def test_fix_wrong_track_even_when_adb_download_has_lower_code(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'experimental.json'
            p.write_text(json.dumps({'tag': 'experimental-shizuku-pr-4-run-12', 'versionCode': 100124}))
            adb = {'tag': 'experimental-adb-pr-5-run-11', 'versionCode': 100123}
            self.assertTrue(update(p, adb, adb_bridge=True))
            self.assertEqual(adb, json.loads(p.read_text()))
            self.assertFalse(update(p, dict(adb, versionCode=100122), adb_bridge=True))

if __name__ == '__main__': unittest.main()
