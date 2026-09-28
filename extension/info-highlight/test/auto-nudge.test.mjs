/**
 * 自动分析引导的计数。运行：node --test extension/info-highlight/test/auto-nudge.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';

const dir = dirname(fileURLToPath(import.meta.url));
runInThisContext(readFileSync(join(dir, '../auto-nudge.js'), 'utf8'), {
  filename: 'auto-nudge.js',
});
const N = globalThis.IH_autoNudge;

function paint(state, url, flags) {
  const host = new URL(url).hostname;
  return N.note(state, host, N.pageKey(url), flags);
}

test('pageKey 去掉 hash，非 http(s) 不计', () => {
  assert.equal(N.pageKey('https://Example.com/a?b=1#x'), 'https://example.com/a?b=1');
  assert.equal(N.pageKey('https://example.com/a'), 'https://example.com/a');
  assert.equal(N.pageKey('file:///tmp/a.pdf'), '');
  assert.equal(N.pageKey('not a url'), '');
});

test('同一页反复点只计一次', () => {
  let state = N.empty();
  state = paint(state, 'https://example.com/a').state;
  const again = paint(state, 'https://example.com/a#section');
  assert.equal(again.changed, false);
  assert.equal(again.state.total, 1);
  assert.equal(again.state.hosts['example.com'], 1);
});

test('该站满 2 且总共满 5 才问刚才这个站', () => {
  let state = N.empty();
  const pages = [
    'https://a.example/1',
    'https://a.example/2',
    'https://b.example/1',
    'https://c.example/1',
    'https://d.example/1',
  ];
  let prompted = null;
  for (const url of pages) {
    const out = paint(state, url);
    state = out.state;
    if (out.prompt) prompted = new URL(url).hostname;
  }
  assert.equal(prompted, null);
  assert.equal(state.total, 5);
  assert.equal(state.hosts['a.example'], 2);
  const next = paint(state, 'https://a.example/3');
  assert.equal(next.prompt, true);
  assert.equal(next.state.hosts['a.example'], 3);
});

test('第 5 次落在没满 2 的站上不问', () => {
  let state = N.empty();
  for (const url of [
    'https://a.example/1',
    'https://b.example/1',
    'https://c.example/1',
    'https://d.example/1',
    'https://e.example/1',
  ]) {
    const out = paint(state, url);
    state = out.state;
    assert.equal(out.prompt, false);
  }
});

test('已自动分析的站不再问，另一个够次数的站照问', () => {
  let state = N.empty();
  for (let i = 0; i < 4; i++) state = paint(state, `https://a.example/${i}`).state;
  state = paint(state, 'https://b.example/1').state;
  const covered = paint(state, 'https://a.example/9', { covered: true });
  assert.equal(covered.prompt, false);
  assert.equal(covered.changed, true);
  const other = paint(covered.state, 'https://b.example/2');
  assert.equal(other.prompt, true);
});

test('晚点再说再满 2 页才问，次数本身不动', () => {
  let state = N.empty();
  for (let i = 0; i < 5; i++) state = paint(state, `https://a.example/${i}`).state;
  assert.equal(state.total, 5);
  const gate = N.later(N.emptyGate(), 'a.example', state.hosts['a.example']);
  assert.equal(gate.ask['a.example'], 7);
  assert.equal(state.total, 5);
  const one = paint(state, 'https://a.example/new-1', { askAt: gate.ask['a.example'] });
  assert.equal(one.prompt, false);
  const two = paint(one.state, 'https://a.example/new-2', { askAt: gate.ask['a.example'] });
  assert.equal(two.prompt, true);
  assert.equal(two.state.hosts['a.example'], 7);
});

test('不再问只写在门槛上，不改次数', () => {
  const gate = N.mute({ mute: false, ask: { 'a.example': 4 } });
  assert.equal(gate.mute, true);
  assert.equal(gate.ask['a.example'], 4);
});

test('坏存储归一成空，不把次数读歪', () => {
  const state = N.normalize({ total: -3, pages: [1, 'https://a.example/'], hosts: { 'a.example': 'no' } });
  assert.deepEqual(state, { total: 0, hosts: {}, pages: ['https://a.example/'] });
  assert.deepEqual(N.normalizeGate({ mute: 1, ask: { 'a.example': 0, 'b.example': 4 } }), {
    mute: false,
    ask: { 'b.example': 4 },
  });
});
