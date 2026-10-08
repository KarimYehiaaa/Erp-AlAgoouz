import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');
const readBytes = (relativePath) => readFile(path.join(root, relativePath));

const cleartextHosts = (xml) =>
  [
    ...xml.matchAll(
      /<domain-config\b[^>]*cleartextTrafficPermitted="true"[^>]*>([\s\S]*?)<\/domain-config>/g,
    ),
  ]
    .flatMap(([, config]) => [...config.matchAll(/<domain>\s*([^<]+?)\s*<\/domain>/g)])
    .map(([, host]) => host);

test('Android Release denies cleartext and Debug allows only the emulator gateway', async () => {
  const [manifest, releaseConfig, debugConfig, capacitorConfig, buildGradle, debugStrings] =
    await Promise.all([
      read('frontend/android/app/src/main/AndroidManifest.xml'),
      read('frontend/android/app/src/main/res/xml/network_security_config.xml'),
      read('frontend/android/app/src/debug/res/xml/network_security_config.xml'),
      read('frontend/capacitor.config.ts'),
      read('frontend/android/app/build.gradle'),
      read('frontend/android/app/src/debug/res/values/strings.xml'),
    ]);

  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:networkSecurityConfig="@xml\/network_security_config"/);
  assert.match(releaseConfig, /<base-config\s+cleartextTrafficPermitted="false"/);
  assert.deepEqual(cleartextHosts(releaseConfig), []);
  assert.match(capacitorConfig, /cleartext:\s*false/);

  assert.match(debugConfig, /<base-config\s+cleartextTrafficPermitted="false"/);
  assert.deepEqual(cleartextHosts(debugConfig), ['10.0.2.2']);
  assert.doesNotMatch(debugConfig, /192\.168\.1\.14/);
  assert.match(buildGradle, /applicationIdSuffix\s+'\.debug'/);
  assert.match(debugStrings, /بن العجوز — اختبار/);
});

test('pins the official Gradle distribution and wrapper JAR checksums', async () => {
  const [wrapperProperties, wrapperJar] = await Promise.all([
    read('frontend/android/gradle/wrapper/gradle-wrapper.properties'),
    readBytes('frontend/android/gradle/wrapper/gradle-wrapper.jar'),
  ]);

  assert.match(
    wrapperProperties,
    /^distributionUrl=https\\:\/\/services\.gradle\.org\/distributions\/gradle-8\.11\.1-bin\.zip$/m,
  );
  assert.match(
    wrapperProperties,
    /^distributionSha256Sum=f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6$/m,
  );
  assert.equal(
    createHash('sha256').update(wrapperJar).digest('hex'),
    '2db75c40782f5e8ba1fc278a5574bab070adccb2d21ca5a6e5ed840888448046',
  );
});
