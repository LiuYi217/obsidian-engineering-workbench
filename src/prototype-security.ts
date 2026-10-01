import { Inflate } from 'fflate';

/** Intake only: these helpers never execute, render, fetch, or write prototype content. */
export interface PrototypeFile { path: string; bytes: Uint8Array }
export interface PrototypeImportPlan {
  files: PrototypeFile[];
  /** Includes explicitly archived empty directories and implicit parent directories. */
  directories: string[];
  entryCandidates: string[];
  warnings: string[];
  totalBytes: number;
}
export type PrototypePlan = PrototypeImportPlan;
export const PROTOTYPE_LIMITS = Object.freeze({
  maxArchiveBytes: 20 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxFileBytes: 10 * 1024 * 1024,
  maxFiles: 500,
  maxPathBytes: 1024,
  maxDepth: 32,
  maxCompressionRatio: 200,
});

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const unsafeControls = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/;
const htmlEntry = /\.html?$/i;
function fail(message: string): never { throw new Error(`原型导入：${message}`); }
// Conservatively reject portable case/compatibility aliases without renaming the originals.
const keyOf = (path: string): string => path.normalize('NFKC').toUpperCase().toLowerCase();

function checkPathShape(path: string): void {
  if (!path || path.startsWith('/') || /[\\:*?"<>|]/.test(path) || unsafeControls.test(path)) {
    fail('路径必须是安全的相对路径，不能包含绝对路径、Windows 路径或控制字符');
  }
  const parts = path.split('/');
  if (parts.length > PROTOTYPE_LIMITS.maxDepth) fail('路径层级过深');
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || /[. ]$/.test(part) || /^\s|\s$/.test(part)) {
      fail('路径含空段、目录穿越或不明确的末尾字符');
    }
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) fail('路径含 Windows 保留名称');
    if (encoder.encode(part).length > 255) fail('单个文件名过长');
  }
}

/** Preserve names exactly so relative asset links continue to work; reject ambiguous aliases. */
export function validateRelativePath(value: string): string {
  if (typeof value !== 'string' || encoder.encode(value).length > PROTOTYPE_LIMITS.maxPathBytes) fail('路径无效或过长');
  if (decoder.decode(encoder.encode(value)) !== value) fail('路径含无效 Unicode 字符');
  let decoded = value;
  for (let depth = 0; depth < 8; depth++) {
    checkPathShape(decoded);
    checkPathShape(decoded.normalize('NFKC'));
    if (!decoded.includes('%')) return value;
    if (depth === 0 && /%(?![\da-f]{2})/i.test(decoded)) fail('路径含无效的百分号编码');
    if (!/%[\da-f]{2}/i.test(decoded)) return value;
    // Encoded separators may be interpreted differently by browsers and filesystems.
    if (/%(?:2f|5c)/i.test(decoded)) fail('路径不能包含编码后的路径分隔符');
    try { decoded = decoded.replace(/(?:%[\da-f]{2})+/ig, encoded => decodeURIComponent(encoded)); } catch { fail('路径含无效的百分号编码'); }
  }
  fail('路径编码嵌套过深');
}

/** Only normal HTTP(S) browser navigation is allowed. No request is made here. */
export function validateExternalUrl(value: string): string {
  if (typeof value !== 'string' || !value || value.length > 4096 || /\s/.test(value) || unsafeControls.test(value)) fail('在线地址无效或含空白/控制字符');
  if (decoder.decode(encoder.encode(value)) !== value) fail('在线地址含无效 Unicode 字符');
  if (!/^https?:\/\//i.test(value)) fail('在线地址只允许 http:// 或 https://');
  const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/, 1)[0];
  if (!authority) fail('在线地址必须包含主机名');
  if (authority.includes('@')) fail('在线地址不能包含账号或密码');
  let decoded = value;
  let stable = false;
  for (let depth = 0; depth < 8; depth++) {
    if (unsafeControls.test(decoded) || decoded.includes('\\')) fail('在线地址含不安全的字符');
    const path = decoded.slice(decoded.indexOf('://') + 3).replace(/^[^/]*/, '').split(/[?#]/, 1)[0];
    if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(path.normalize('NFKC'))) fail('在线地址含目录穿越');
    if (!decoded.includes('%')) { stable = true; break; }
    if (depth === 0 && /%(?![\da-f]{2})/i.test(decoded)) fail('在线地址含无效的百分号编码');
    if (!/%[\da-f]{2}/i.test(decoded)) { stable = true; break; }
    let next: string;
    try { next = decoded.replace(/(?:%[\da-f]{2})+/ig, encoded => decodeURIComponent(encoded)); } catch { fail('在线地址含无效的百分号编码'); }
    if (next === decoded) { stable = true; break; }
    decoded = next;
  }
  if (!stable) fail('在线地址编码嵌套过深');
  let url: URL;
  try { url = new URL(value); } catch { fail('在线地址无法解析'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) fail('在线地址必须为不含登录凭据的 HTTP(S) 地址');
  return url.href;
}

function checkedPaths(paths: { path: string; directory: boolean }[]): string[] {
  const names = new Map<string, boolean>();
  const directories = new Map<string, string>();
  for (const item of paths) {
    validateRelativePath(item.path);
    const key = keyOf(item.path);
    if (names.has(key)) fail(`存在重复或大小写/Unicode 等价路径：${item.path}`);
    names.set(key, item.directory);
  }
  for (const item of paths) {
    const segments = item.path.split('/');
    for (let index = 1; index < segments.length; index++) {
      const parent = segments.slice(0, index).join('/');
      const key = keyOf(parent);
      if (names.get(key) === false) fail(`文件与目录路径冲突：${parent}`);
      const previous = directories.get(key);
      if (previous && previous !== parent) fail(`目录含大小写/Unicode 等价别名：${parent}`);
      directories.set(key, parent);
    }
    if (item.directory) {
      const previous = directories.get(keyOf(item.path));
      if (previous && previous !== item.path) fail(`目录含大小写/Unicode 等价别名：${item.path}`);
      directories.set(keyOf(item.path), item.path);
    }
  }
  return [...directories.values()].sort();
}

function planFor(files: readonly PrototypeFile[], explicitDirectories: readonly string[] = []): PrototypeImportPlan {
  if (!Array.isArray(files) || !files.length) fail('请选择至少一个文件');
  if (files.length + explicitDirectories.length > PROTOTYPE_LIMITS.maxFiles) fail('文件/目录数量超过 500');
  let totalBytes = 0;
  for (const file of files) {
    if (!file || !(file.bytes instanceof Uint8Array)) fail('文件内容必须为二进制字节');
    if (file.bytes.byteLength > PROTOTYPE_LIMITS.maxFileBytes) fail(`单个文件超过 10 MiB：${file.path}`);
    totalBytes += file.bytes.byteLength;
    if (totalBytes > PROTOTYPE_LIMITS.maxTotalBytes) fail('文件总大小超过 50 MiB');
  }
  const directories = checkedPaths([
    ...files.map(file => ({ path: file.path, directory: false })),
    ...explicitDirectories.map(path => ({ path, directory: true })),
  ]);
  if (files.length + directories.length > PROTOTYPE_LIMITS.maxFiles) fail('文件及父目录数量超过 500');
  const entryCandidates = files.map(file => file.path).filter(path => htmlEntry.test(path)).sort((a, b) => {
    const rank = (path: string) => /(?:^|\/)index\.html?$/i.test(path) ? 0 : 1;
    return rank(a) - rank(b) || a.split('/').length - b.split('/').length || a.localeCompare(b);
  });
  const warnings = [
    '只检查导入边界与文件完整性；未执行原型、验证页面或检查代码安全性。',
    '网络、登录与运行环境要求默认未知；请人工确认。外部浏览器打开后，页面脚本可能执行或联网。',
  ];
  if (!entryCandidates.length) warnings.push('未找到 HTML 入口；可保留资料，但不能作为本地 HTML 原型打开。');
  if (entryCandidates.length > 1) warnings.push('发现多个 HTML 文件，请明确选择入口；不会自动执行任何文件。');
  return {
    files: files.map(file => ({ path: file.path, bytes: new Uint8Array(file.bytes) })),
    directories, entryCandidates, warnings, totalBytes,
  };
}

/** Single HTML and folder FileList intake use the same binary-safe review boundary. */
export function inspectPrototypeFiles(files: readonly PrototypeFile[], directories: readonly string[] = []): PrototypeImportPlan {
  return planFor(files, directories);
}

/** The user must explicitly select a real HTML file from the validated plan. */
export function validateEntry(plan: PrototypeImportPlan, entry: string): string {
  validateRelativePath(entry);
  if (!htmlEntry.test(entry)) fail('入口必须是 .html 或 .htm 文件');
  if (!plan.files.some(file => file.path === entry)) fail('入口不在此次导入的文件列表中');
  return entry;
}

interface ZipEntry {
  path: string; directory: boolean; rawName: Uint8Array;
  flags: number; method: number; crc: number;
  compressedSize: number; size: number; offset: number; start: number;
}
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, index) => value === b[index]);
const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

/**
 * ZIP32 only, stored/DEFLATE only. Validate the complete index before allocating output.
 * Streaming 1 KiB compressed chunks bounds inflate's temporary output even when declared
 * sizes are dishonest; fixed-buffer inflateSync would silently truncate such an attack.
 */
export function previewPrototypeZip(bytes: Uint8Array): PrototypeImportPlan {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22) fail('ZIP 文件不完整');
  if (bytes.length > PROTOTYPE_LIMITS.maxArchiveBytes) fail('ZIP 大小超过 20 MiB');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bounds = (offset: number, size: number) => {
    if (!Number.isSafeInteger(offset) || offset < 0 || size < 0 || offset + size > bytes.length) fail('ZIP 记录越界或已截断');
  };
  const u16 = (offset: number) => { bounds(offset, 2); return view.getUint16(offset, true); };
  const u32 = (offset: number) => { bounds(offset, 4); return view.getUint32(offset, true); };
  const checkExtra = (offset: number, length: number) => {
    bounds(offset, length);
    const end = offset + length;
    const seen = new Set<number>();
    while (offset < end) {
      if (offset + 4 > end) fail('ZIP 扩展字段不完整');
      const id = u16(offset), size = u16(offset + 2);
      if (offset + 4 + size > end) fail('ZIP 扩展字段越界');
      if (id === 0x0001) fail('不支持 ZIP64，请使用普通 ZIP');
      if (id === 0x7075) fail('ZIP 含第二套 Unicode 路径，请重新导出为 UTF-8 ZIP');
      if (seen.has(id)) fail('ZIP 扩展字段重复');
      seen.add(id); offset += 4 + size;
    }
  };
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (u32(at) === 0x06054b50 && at + 22 + u16(at + 20) === bytes.length) { end = at; break; }
  }
  if (end < 0) fail('找不到完整 ZIP 目录');
  const count = u16(end + 10), centralSize = u32(end + 12), centralStart = u32(end + 16);
  if (u16(end + 4) !== 0 || u16(end + 6) !== 0 || u16(end + 8) !== count) fail('不支持分卷 ZIP');
  if (count === 0xffff || centralSize === 0xffffffff || centralStart === 0xffffffff) fail('不支持 ZIP64');
  if (!count || count > PROTOTYPE_LIMITS.maxFiles) fail('ZIP 文件/目录数量必须为 1–500');
  if (centralStart + centralSize !== end) fail('ZIP 目录位置不一致或含未支持的附加记录');
  bounds(centralStart, centralSize);
  const entries: ZipEntry[] = [];
  let cursor = centralStart, totalBytes = 0, totalCompressed = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) fail('ZIP 中央目录损坏');
    const flags = u16(cursor + 8), method = u16(cursor + 10), crc = u32(cursor + 16);
    const compressedSize = u32(cursor + 20), size = u32(cursor + 24);
    const nameSize = u16(cursor + 28), extraSize = u16(cursor + 30), commentSize = u16(cursor + 32);
    const attributes = u32(cursor + 38), offset = u32(cursor + 42);
    const next = cursor + 46 + nameSize + extraSize + commentSize;
    if (next > end || !nameSize) fail('ZIP 文件名或目录记录损坏');
    if (u16(cursor + 34) !== 0) fail('不支持分卷 ZIP');
    if (u16(cursor + 6) > 20) fail('ZIP 需要未支持的解压功能');
    if (flags & ~0x080e) fail('不支持加密或特殊 ZIP 标志');
    if (method !== 0 && method !== 8) fail('ZIP 只支持存储或 DEFLATE 压缩');
    if (method === 0 && (flags & 6)) fail('ZIP 存储条目的压缩标志无效');
    if ([compressedSize, size, offset].includes(0xffffffff)) fail('不支持 ZIP64');
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameSize);
    let name: string;
    if (!(flags & 0x800) && rawName.some(byte => byte > 127)) fail('非 ASCII 文件名需使用 UTF-8 ZIP 编码');
    try { name = decoder.decode(rawName); } catch { fail('ZIP 文件名不是有效 UTF-8'); }
    const directory = name.endsWith('/'), path = directory ? name.slice(0, -1) : name;
    validateRelativePath(path);
    const unixType = (attributes >>> 16) & 0xf000;
    if (unixType && unixType !== 0x8000 && unixType !== 0x4000) fail('ZIP 不能包含符号链接、设备或特殊文件');
    if ((unixType === 0x4000 || (attributes & 0x10) !== 0) && !directory) fail('ZIP 目录属性与路径不一致');
    if (directory && (unixType === 0x8000 || size !== 0)) fail('ZIP 目录不能包含文件内容');
    if (size > PROTOTYPE_LIMITS.maxFileBytes) fail('ZIP 单个文件超过 10 MiB');
    if (method === 8 && compressedSize < 2) fail('ZIP DEFLATE 内容不完整');
    if (method === 0 && size !== compressedSize) fail('ZIP 存储条目大小不一致');
    if (size > Math.max(1024, compressedSize * PROTOTYPE_LIMITS.maxCompressionRatio)) fail('ZIP 压缩倍率过高，可能是解压炸弹');
    totalBytes += size; totalCompressed += compressedSize;
    if (totalBytes > PROTOTYPE_LIMITS.maxTotalBytes || totalCompressed > PROTOTYPE_LIMITS.maxArchiveBytes) fail('ZIP 解压总大小超过限制');
    checkExtra(cursor + 46 + nameSize, extraSize);
    entries.push({ path, directory, rawName, flags, method, crc, compressedSize, size, offset, start: 0 });
    cursor = next;
  }
  if (cursor !== end) fail('ZIP 目录条目数量或大小不一致');
  checkedPaths(entries);
  const ordered = [...entries].sort((a, b) => a.offset - b.offset);
  let expectedOffset = 0;
  for (let index = 0; index < ordered.length; index++) {
    const entry = ordered[index], at = entry.offset;
    const nextOffset = ordered[index + 1]?.offset ?? centralStart;
    if (at !== expectedOffset || at + 30 > nextOffset || u32(at) !== 0x04034b50) fail('ZIP 本地记录重叠、缺失或包含隐藏记录');
    const nameSize = u16(at + 26), extraSize = u16(at + 28);
    const start = at + 30 + nameSize + extraSize;
    const payloadEnd = start + entry.compressedSize;
    if (payloadEnd > nextOffset || u16(at + 4) > 20 || u16(at + 6) !== entry.flags || u16(at + 8) !== entry.method) fail('ZIP 本地记录与目录不一致');
    if (!sameBytes(bytes.subarray(at + 30, at + 30 + nameSize), entry.rawName)) fail('ZIP 本地文件名与目录不一致');
    checkExtra(at + 30 + nameSize, extraSize);
    const descriptor = (entry.flags & 8) !== 0;
    for (const [local, actual] of [[u32(at + 14), entry.crc], [u32(at + 18), entry.compressedSize], [u32(at + 22), entry.size]]) {
      if (local !== actual && !(descriptor && local === 0)) fail('ZIP 本地校验值/大小与目录不一致');
    }
    if (descriptor) {
      const descriptorSize = nextOffset - payloadEnd;
      const descriptorStart = descriptorSize === 16 && u32(payloadEnd) === 0x08074b50 ? payloadEnd + 4 : payloadEnd;
      if (![12, 16].includes(descriptorSize) || descriptorStart + 12 !== nextOffset || u32(descriptorStart) !== entry.crc || u32(descriptorStart + 4) !== entry.compressedSize || u32(descriptorStart + 8) !== entry.size) fail('ZIP 数据描述符无效');
    } else if (payloadEnd !== nextOffset) fail('ZIP 条目含额外或隐藏数据');
    entry.start = start; expectedOffset = nextOffset;
  }
  const files: PrototypeFile[] = [];
  for (const entry of entries) {
    const input = bytes.subarray(entry.start, entry.start + entry.compressedSize);
    let output: Uint8Array;
    if (entry.method === 0) output = input;
    else {
      output = new Uint8Array(entry.size);
      let written = 0, finished = false;
      const inflate = new Inflate((chunk, final) => {
        if (written + chunk.length > entry.size) fail('ZIP 实际解压大小超过声明值');
        output.set(chunk, written); written += chunk.length;
        if (final) finished = true;
      });
      try {
        if (!input.length) inflate.push(input, true);
        for (let at = 0; at < input.length; at += 1024) inflate.push(input.subarray(at, Math.min(at + 1024, input.length)), at + 1024 >= input.length);
      } catch (error) {
        fail(`ZIP 解压失败：${error instanceof Error ? error.message : '无效压缩内容'}`);
      }
      if (!finished || written !== entry.size) fail('ZIP 实际解压大小与声明值不一致');
    }
    if (crc32(output) !== entry.crc) fail(`ZIP 内容校验失败：${entry.path}`);
    if (!entry.directory) files.push({ path: entry.path, bytes: output });
  }
  return planFor(files, entries.filter(entry => entry.directory).map(entry => entry.path));
}
