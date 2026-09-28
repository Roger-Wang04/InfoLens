/**
 * 手动分析一开始就计一次。够次数就请后台开窗。
 * 窗打开之后自己把该站下次门槛抬到当前次数 + AGAIN；没打开就不抬。
 * 晚点再说和关掉窗口不再写。询问窗另外只写「不再问」或加入自动分析。
 * 次数与门槛分两份存储。同一页（去掉 hash）只计一次。该站满 SITE_NEED 且总共满 TOTAL_NEED 才问。
 * 另一个站也够次数，就再问那一个。
 */
globalThis.IH_autoNudge ||= (function () {
  const KEY = 'ih_auto_nudge';
  const GATE_KEY = 'ih_auto_nudge_gate';
  const SITE_NEED = 2;
  const TOTAL_NEED = 5;
  const AGAIN = 2;
  /** 去重表有上限；挤掉的旧页若再分析会再计一次。 */
  const MAX_PAGES = 300;

  function empty() {
    return { total: 0, hosts: {}, pages: [] };
  }

  function emptyGate() {
    return { mute: false, ask: {} };
  }

  function pageKey(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return '';
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    u.hash = '';
    return u.href;
  }

  function hostCount(row) {
    const n = Math.floor(Number(row));
    return n > 0 ? n : 0;
  }

  function normalize(raw) {
    const state = empty();
    if (!raw || typeof raw !== 'object') return state;
    const total = Math.floor(Number(raw.total));
    state.total = total > 0 ? total : 0;
    if (Array.isArray(raw.pages)) {
      state.pages = raw.pages.filter((p) => typeof p === 'string' && p).slice(-MAX_PAGES);
    }
    if (raw.hosts && typeof raw.hosts === 'object' && !Array.isArray(raw.hosts)) {
      for (const [host, row] of Object.entries(raw.hosts)) {
        const n = hostCount(row);
        if (host && n > 0) state.hosts[host] = n;
      }
    }
    return state;
  }

  function normalizeGate(raw) {
    const gate = emptyGate();
    if (!raw || typeof raw !== 'object') return gate;
    gate.mute = raw.mute === true;
    if (raw.ask && typeof raw.ask === 'object' && !Array.isArray(raw.ask)) {
      for (const [host, ask] of Object.entries(raw.ask)) {
        const n = Math.floor(Number(ask));
        if (host && n > 0) gate.ask[host] = n;
      }
    }
    return gate;
  }

  /**
   * 记一次刚开始的手动分析。
   * covered：该站已在自动分析名单。
   * askAt：该站下次要问时的次数，缺省 SITE_NEED。
   * @returns {{ state: ReturnType<typeof empty>, prompt: boolean, changed: boolean }}
   */
  function note(state, host, page, { covered = false, askAt = SITE_NEED } = {}) {
    const base = normalize(state);
    if (!host || !page || base.pages.includes(page)) {
      return { state: base, prompt: false, changed: false };
    }
    const n = (base.hosts[host] || 0) + 1;
    const next = {
      total: base.total + 1,
      hosts: { ...base.hosts, [host]: n },
      pages: base.pages.concat(page).slice(-MAX_PAGES),
    };
    const need = Math.floor(Number(askAt)) > 0 ? Math.floor(Number(askAt)) : SITE_NEED;
    const prompt = !covered && n >= need && next.total >= TOTAL_NEED;
    return { state: next, prompt, changed: true };
  }

  /** 该站下次要问的次数抬到 n + AGAIN。n 是此刻已记下的次数。 */
  function later(gate, host, n) {
    const next = normalizeGate(gate);
    const at = hostCount(n) + AGAIN;
    next.ask = { ...next.ask, [host]: at };
    return next;
  }

  function mute(gate) {
    const next = normalizeGate(gate);
    next.mute = true;
    return next;
  }

  async function loadCounts() {
    const res = await chrome.storage.local.get({ [KEY]: null });
    return normalize(res[KEY]);
  }

  async function saveCounts(state) {
    await chrome.storage.local.set({ [KEY]: state });
  }

  async function loadGate() {
    const res = await chrome.storage.local.get({ [GATE_KEY]: null });
    return normalizeGate(res[GATE_KEY]);
  }

  async function saveGate(gate) {
    await chrome.storage.local.set({ [GATE_KEY]: gate });
  }

  /**
   * 手动分析刚开始时调用。够次数就请后台打开询问窗。门槛由窗打开之后自己写。
   * @param {string} href
   */
  async function offer(href) {
    if (!globalThis.IH_autoSites) throw new Error('IH_autoSites missing');
    const page = pageKey(href);
    const host = globalThis.IH_autoSites.hostOf(href);
    if (!page || !host) return;
    const [counts, gate, covered] = await Promise.all([
      loadCounts(),
      loadGate(),
      globalThis.IH_autoSites.has(host),
    ]);
    if (gate.mute) return;
    const out = note(counts, host, page, { covered, askAt: gate.ask[host] });
    if (out.changed) await saveCounts(out.state);
    if (!out.prompt) return;
    chrome.runtime.sendMessage({ type: 'ih-open-auto-nudge', host });
  }

  return {
    KEY,
    GATE_KEY,
    SITE_NEED,
    TOTAL_NEED,
    AGAIN,
    MAX_PAGES,
    empty,
    emptyGate,
    pageKey,
    normalize,
    normalizeGate,
    note,
    later,
    mute,
    loadCounts,
    saveCounts,
    loadGate,
    saveGate,
    offer,
  };
})();
