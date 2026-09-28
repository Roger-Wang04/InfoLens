/**
 * 界面文案以英文原文为 key：中文界面查 zh.js，查不到用英文。
 * 带 data-ih-i18n 的扩展页面，按元素里原有英文替换 data-i18n / data-i18n-html / data-i18n-attr；
 * 普通网页不带这个标记，注入时不会改到别人的 data-i18n。
 */
globalThis.IH_i18n ||= (function () {
  const ZH = globalThis.IH_zh;
  if (!ZH) throw new Error('IH_zh missing — inject zh.js before i18n.js');

  const ui = (globalThis.chrome?.i18n?.getUILanguage?.() || '').toLowerCase().replaceAll('_', '-');
  const zh = /^zh/.test(ui);

  /** @param {string} en @param {Record<string, string | number>} [vars] */
  function tr(en, vars) {
    const s = zh ? (ZH[en] ?? en) : en;
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, (_, k) => {
      if (!(k in vars)) throw new Error(`i18n: missing {${k}} for "${en}"`);
      return String(vars[k]);
    });
  }

  function apply(root) {
    root.documentElement.lang = 'zh-CN';
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = tr(el.textContent.trim());
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = tr(el.innerHTML.trim());
    });
    root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      for (const name of el.getAttribute('data-i18n-attr').split(',')) {
        el.setAttribute(name, tr(el.getAttribute(name)));
      }
    });
  }

  // 页面把脚本放在 body 末尾，这里 DOM 已解析完
  if (zh && globalThis.document?.documentElement?.dataset.ihI18n === '1') apply(document);

  return { zh, tr };
})();
