import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, zipSync } from 'fflate';
import {
  inspectPrototypeFiles, previewPrototypeZip, PROTOTYPE_LIMITS,
  validateEntry, validateExternalUrl, validateRelativePath,
} from '../src/prototype-security';

const text = (value: string) => new TextEncoder().encode(value);
const html = text('<!doctype html><title>Synthetic prototype</title><img src="assets/pixel.bin">');
function crc(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c ^= byte;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
interface FixtureEntry {
  path: string; bytes?: Uint8Array; compressed?: Uint8Array; size?: number; checksum?: number;
  method?: number; flags?: number; attributes?: number; localName?: string;
  descriptor?: boolean; unsignedDescriptor?: boolean; extra?: Uint8Array;
}
/** Build binary records explicitly so adversarial names never pass through a ZIP library map. */
function archive(entries: FixtureEntry[]): Uint8Array {
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const payload = entry.bytes ?? html;
    const method = entry.method ?? 0;
    const data = entry.compressed ?? (method === 8 ? deflateSync(payload) : payload);
    const name = text(entry.path), localName = text(entry.localName ?? entry.path), extra = entry.extra ?? new Uint8Array();
    const flags = (entry.flags ?? 0x800) | (entry.descriptor ? 8 : 0);
    const checksum = entry.checksum ?? crc(payload), size = entry.size ?? payload.length;
    const record = new Uint8Array(30 + localName.length + extra.length + data.length);
    const v = new DataView(record.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true);
    v.setUint16(6, flags, true); v.setUint16(8, method, true);
    if (!entry.descriptor) {
      v.setUint32(14, checksum, true); v.setUint32(18, data.length, true); v.setUint32(22, size, true);
    }
    v.setUint16(26, localName.length, true); v.setUint16(28, extra.length, true);
    record.set(localName, 30); record.set(extra, 30 + localName.length); record.set(data, 30 + localName.length + extra.length);
    local.push(record);
    let descriptorSize = 0;
    if (entry.descriptor) {
      descriptorSize = entry.unsignedDescriptor ? 12 : 16;
      const descriptor = new Uint8Array(descriptorSize), d = new DataView(descriptor.buffer);
      const start = entry.unsignedDescriptor ? 0 : 4;
      if (start) d.setUint32(0, 0x08074b50, true);
      d.setUint32(start, checksum, true); d.setUint32(start + 4, data.length, true); d.setUint32(start + 8, size, true);
      local.push(descriptor);
    }
    const header = new Uint8Array(46 + name.length + extra.length), h = new DataView(header.buffer);
    h.setUint32(0, 0x02014b50, true); h.setUint16(4, 0x0314, true); h.setUint16(6, 20, true);
    h.setUint16(8, flags, true); h.setUint16(10, method, true); h.setUint32(16, checksum, true);
    h.setUint32(20, data.length, true); h.setUint32(24, size, true);
    h.setUint16(28, name.length, true); h.setUint16(30, extra.length, true);
    h.setUint32(38, entry.attributes ?? 0, true); h.setUint32(42, offset, true);
    header.set(name, 46); header.set(extra, 46 + name.length); central.push(header);
    offset += record.length + descriptorSize;
  }
  const centralSize = central.reduce((sum, bytes) => sum + bytes.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const bytes of [...local, ...central, end]) { result.set(bytes, at); at += bytes.length; }
  return result;
}
function mutate(bytes: Uint8Array, action: (view: DataView, central: number) => void): Uint8Array {
  const copy = new Uint8Array(bytes), view = new DataView(copy.buffer);
  action(view, view.getUint32(copy.length - 6, true));
  return copy;
}

test('single HTML and folders preserve file bytes and exact relative hierarchy without execution', () => {
  const source = new Uint8Array([0, 255, 1, 2]);
  const plan = inspectPrototypeFiles([
    { path: '演示/site/index.html', bytes: html }, { path: '演示/site/assets/pixel.bin', bytes: source },
    { path: '演示/site/README.md', bytes: text('Offline instructions only') },
  ]);
  assert.deepEqual(plan.entryCandidates, ['演示/site/index.html']);
  assert.deepEqual(plan.directories, ['演示', '演示/site', '演示/site/assets']);
  assert.equal(validateEntry(plan, '演示/site/index.html'), '演示/site/index.html');
  assert.deepEqual(plan.files[1].bytes, source);
  source[0] = 55; assert.equal(plan.files[1].bytes[0], 0);
  assert.equal(plan.totalBytes, html.length + 4 + text('Offline instructions only').length);
  assert(plan.warnings.some(warning => warning.includes('未知')));
  assert(plan.warnings.some(warning => warning.includes('未执行')));
});

test('entry selection is explicit, exact, and HTML-only; ordinary documents still import', () => {
  const plan = inspectPrototypeFiles([{ path: 'a.html', bytes: html }, { path: 'index.htm', bytes: html }, { path: 'assets/a.js', bytes: text('alert(1)') }]);
  assert.deepEqual(plan.entryCandidates, ['index.htm', 'a.html']);
  assert.throws(() => validateEntry(plan, 'A.html'));
  assert.throws(() => validateEntry(plan, 'missing.html'));
  assert.throws(() => validateEntry(plan, 'assets/a.js'));
  assert.throws(() => validateEntry(plan, '../a.html'));
  assert.deepEqual(inspectPrototypeFiles([{ path: 'requirements.pdf', bytes: text('synthetic') }]).entryCandidates, []);
});

test('relative paths reject absolute, Windows, traversal, encoded, reserved, and ambiguous names', () => {
  for (const path of [
    '', '/', '/index.html', '//server/share.html', 'C:/index.html', 'C:\\index.html', 'a\\index.html',
    '../index.html', 'a/../index.html', './index.html', 'a//index.html', 'a/',
    '%2e%2e/index.html', '%252e%252e/index.html', 'a%2f..%2findex.html', '%5cindex.html',
    'a/．．/index.html', 'a/．/index.html', 'a\u0000.html', 'a\n.html', 'a\u202e.html',
    'CON.html', 'aux', 'a/LPT9.txt', 'a/com1/data.html', 'a/NUL.txt', 'a/COM¹.html',
    'a./index.html', 'a /index.html', ' a/index.html', 'foo:bar.html', 'a?.html', 'a*.html',
    'a/%00index.html', '%E0%A4%A', 'a%'.repeat(2), '\ud800.html', '\ufeffindex.html',
  ]) assert.throws(() => validateRelativePath(path), path);
  for (const path of ['index.html', 'folder/a b.html', '中文/原型.htm', '.well-known/config.json', 'assets/foo%20bar.png', 'assets/100%25_done.png']) assert.equal(validateRelativePath(path), path);
  assert.throws(() => validateRelativePath('a/'.repeat(33) + 'index.html'));
  assert.throws(() => validateRelativePath('a'.repeat(256) + '.html'));
  assert.throws(() => validateRelativePath(('long'.repeat(50) + '/').repeat(6) + 'index.html'));
});

test('duplicate case/Unicode names and file/directory collisions cannot silently overwrite', () => {
  for (const paths of [
    ['index.html', 'index.html'], ['index.html', 'INDEX.HTML'], ['é.html', 'e\u0301.html'],
    ['assets', 'assets/a.js'], ['Assets/a.js', 'assets/b.js'], ['É/a.js', 'E\u0301/b.js'],
    ['ａ.html', 'a.html'], ['ς.html', 'Σ.html'],
  ]) assert.throws(() => inspectPrototypeFiles(paths.map(path => ({ path, bytes: html }))));
});

test('file intake enforces count, binary, individual and total size limits before copying', () => {
  assert.throws(() => inspectPrototypeFiles([]));
  assert.throws(() => inspectPrototypeFiles([{ path: 'a', bytes: 'bad' as unknown as Uint8Array }]));
  assert.throws(() => inspectPrototypeFiles(Array.from({ length: 501 }, (_, index) => ({ path: `a${index}`, bytes: new Uint8Array() }))));
  assert.throws(() => inspectPrototypeFiles(Array.from({ length: 251 }, (_, index) => ({ path: `dir${index}/file.html`, bytes: new Uint8Array() }))));
  assert.throws(() => inspectPrototypeFiles([{ path: 'a', bytes: new Uint8Array(PROTOTYPE_LIMITS.maxFileBytes + 1) }]));
  const maximum = new Uint8Array(PROTOTYPE_LIMITS.maxFileBytes);
  assert.throws(() => inspectPrototypeFiles(Array.from({ length: 6 }, (_, index) => ({ path: `a${index}`, bytes: maximum }))));
});

test('HTTP(S) normalization is inert and does not permit credentials or alternate schemes', () => {
  assert.equal(validateExternalUrl('HTTPS://Example.COM:443/demo?q=1#view'), 'https://example.com/demo?q=1#view');
  assert.equal(validateExternalUrl('http://localhost:3000/demo'), 'http://localhost:3000/demo');
  assert.equal(validateExternalUrl('https://example.com/hello%20world'), 'https://example.com/hello%20world');
  assert.equal(validateExternalUrl('https://example.com/?progress=100%25'), 'https://example.com/?progress=100%25');
  for (const url of [
    '', 'https:', 'https:///path', 'example.com', '//example.com', 'file:///tmp/a.html',
    'javascript:alert(1)', 'data:text/html,hi', 'obsidian://open', 'https://u:p@example.com', 'https://@example.com',
    'https://example.com/../admin', 'https://example.com/./admin', 'https://example.com/%2e%2e/admin',
    'https://example.com/%252e%252e/admin', 'https://example.com/%2e%2e%2fadmin',
    'https://example.com\\@evil.test', 'https://example.com/%5cfoo', 'https://example.com/%0Afoo',
    'https://example.com/\nfoo', ' https://example.com', 'https://example.com/hello world', 'https://example.com/%GG',
  ]) assert.throws(() => validateExternalUrl(url), url);
});

test('stored and DEFLATE ZIPs preserve nested HTML, binary assets, and UTF-8 paths', () => {
  const input = { '演示/index.html': html, '演示/assets/pixel.bin': new Uint8Array([0, 255, 1, 2]) };
  for (const level of [0, 6] as const) {
    const plan = previewPrototypeZip(zipSync(input, { level }));
    assert.deepEqual(plan.entryCandidates, ['演示/index.html']);
    for (const file of plan.files) assert.deepEqual(file.bytes, input[file.path as keyof typeof input]);
  }
});

test('ZIP directories including empty folders preserve hierarchy without becoming files', () => {
  const plan = previewPrototypeZip(archive([
    { path: 'site/', bytes: new Uint8Array(), attributes: 0x41ed0010 },
    { path: 'site/empty/', bytes: new Uint8Array(), attributes: 0x41ed0010 },
    { path: 'site/index.html' },
  ]));
  assert.deepEqual(plan.directories, ['site', 'site/empty']);
  assert.deepEqual(plan.files.map(file => file.path), ['site/index.html']);
  assert.deepEqual(inspectPrototypeFiles(plan.files, plan.directories).directories, plan.directories);
});

test('signed and unsigned ZIP data descriptors are checked and supported', () => {
  for (const unsignedDescriptor of [true, false]) {
    const bytes = archive([{ path: 'index.html', method: 8, descriptor: true, unsignedDescriptor }]);
    assert.deepEqual(previewPrototypeZip(bytes).files[0].bytes, html);
    assert.throws(() => previewPrototypeZip(mutate(bytes, (view, central) => view.setUint32(central - 4, 999, true))));
  }
});

test('ZIP unsafe paths and duplicate normalized names are rejected before extraction', () => {
  for (const path of ['../index.html', '/index.html', 'C:/index.html', 'x\\index.html', '%252e%252e/index.html', 'a%2findex.html']) assert.throws(() => previewPrototypeZip(archive([{ path }])));
  for (const paths of [['index.html', 'INDEX.HTML'], ['é.html', 'e\u0301.html'], ['assets', 'assets/x'], ['Assets/a.js', 'assets/b.js']]) {
    assert.throws(() => previewPrototypeZip(archive(paths.map(path => ({ path })))));
  }
});

test('ZIP symlinks and special Unix file modes cannot enter the vault', () => {
  for (const mode of [0xa1ff, 0x21ff, 0x61ff, 0x11ff, 0xc1ff]) {
    assert.throws(() => previewPrototypeZip(archive([{ path: 'index.html', attributes: (mode << 16) >>> 0 }])));
  }
  assert.doesNotThrow(() => previewPrototypeZip(archive([{ path: 'index.html', attributes: 0x81a40000 }])));
  assert.throws(() => previewPrototypeZip(archive([{ path: 'index.html', attributes: 0x41ed0010 }])));
  assert.throws(() => previewPrototypeZip(archive([{ path: 'folder/', attributes: 0x81a40000 }])));
});

test('ZIP encryption, unsupported methods, ZIP64, split archives, and alternate names fail closed', () => {
  for (const flags of [1, 0x40, 0x2000, 0x10, 0x20]) assert.throws(() => previewPrototypeZip(archive([{ path: 'index.html', flags }])));
  assert.throws(() => previewPrototypeZip(archive([{ path: 'index.html', method: 12 }])));
  assert.throws(() => previewPrototypeZip(archive([{ path: '中文.html', flags: 0 }])));
  for (const id of [0x0001, 0x7075]) {
    const extra = new Uint8Array(4); new DataView(extra.buffer).setUint16(0, id, true);
    assert.throws(() => previewPrototypeZip(archive([{ path: 'index.html', extra }])));
  }
  const bytes = archive([{ path: 'index.html' }]);
  assert.throws(() => previewPrototypeZip(mutate(bytes, view => view.setUint16(bytes.length - 18, 1, true))));
  assert.throws(() => previewPrototypeZip(mutate(bytes, (view, central) => view.setUint32(central + 24, 0xffffffff, true))));
  assert.throws(() => previewPrototypeZip(mutate(bytes, (view, central) => view.setUint16(central + 6, 45, true))));
});

test('ZIP local/central names, methods, sizes and CRC must agree', () => {
  assert.throws(() => previewPrototypeZip(archive([{ path: 'index.html', localName: '../bad.htm' }])));
  const bytes = archive([{ path: 'index.html' }]);
  for (const action of [
    (view: DataView) => view.setUint16(8, 8, true),
    (view: DataView) => view.setUint32(18, html.length + 1, true),
    (view: DataView) => view.setUint32(14, 7, true),
    (view: DataView) => view.setUint8(30 + 'index.html'.length, 0),
  ]) assert.throws(() => previewPrototypeZip(mutate(bytes, action)));
  assert.throws(() => previewPrototypeZip(archive([{ path: 'index.html', checksum: 7 }])));
});

test('ZIP overlapping offsets, prefix/trailing junk, truncated records and malformed extras fail', () => {
  const bytes = archive([{ path: 'index.html' }, { path: 'a.js', bytes: text('a') }]);
  assert.throws(() => previewPrototypeZip(mutate(bytes, (view, central) => view.setUint32(central + 46 + 'index.html'.length + 42, 0, true))));
  assert.throws(() => previewPrototypeZip(mutate(bytes, (view, central) => view.setUint32(central + 42, 1, true))));
  assert.throws(() => previewPrototypeZip(new Uint8Array([...bytes, 0])));
  assert.throws(() => previewPrototypeZip(bytes.subarray(0, bytes.length - 1)));
  assert.throws(() => previewPrototypeZip(new Uint8Array(22)));
  assert.throws(() => previewPrototypeZip(archive([{ path: 'index.html', extra: new Uint8Array([1, 2, 3]) }])));
});

test('ZIP bombs, oversized metadata, huge archives, and too many records are rejected', () => {
  assert.throws(() => previewPrototypeZip(archive([{ path: 'index.html', bytes: new Uint8Array(1024 * 1024), method: 8 }])), /倍率/);
  assert.throws(() => previewPrototypeZip(archive([{ path: 'index.html', size: PROTOTYPE_LIMITS.maxFileBytes + 1 }])), /10 MiB/);
  assert.throws(() => previewPrototypeZip(new Uint8Array(PROTOTYPE_LIMITS.maxArchiveBytes + 1)), /20 MiB/);
  assert.throws(() => previewPrototypeZip(archive(Array.from({ length: 501 }, (_, index) => ({ path: `${index}.txt`, bytes: new Uint8Array() })))), /1–500/);
});

test('dishonest DEFLATE size cannot exploit fixed-output truncation or pass a forged prefix CRC', () => {
  const payload = new Uint8Array(4096).fill(65);
  assert.throws(() => previewPrototypeZip(archive([{
    path: 'index.html', bytes: payload, method: 8, size: 16, checksum: crc(payload.subarray(0, 16)),
  }])), /实际解压大小/);
  assert.throws(() => previewPrototypeZip(archive([{ path: 'index.html', bytes: html, method: 8, size: html.length + 3 }])), /实际解压大小/);
  assert.throws(() => previewPrototypeZip(archive([{ path: 'index.html', method: 8, compressed: new Uint8Array([255, 255]) }])), /解压失败/);
});

test('ZIP Uint8Array slices respect byteOffset and do not read outside the provided view', () => {
  const bytes = archive([{ path: 'index.html' }]);
  const backing = new Uint8Array(bytes.length + 20); backing.set(bytes, 10);
  assert.deepEqual(previewPrototypeZip(backing.subarray(10, 10 + bytes.length)).files[0].bytes, html);
});
