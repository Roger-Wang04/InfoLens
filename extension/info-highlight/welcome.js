(() => {
  const buttons = document.querySelectorAll('[data-close]');
  if (!buttons.length) throw new Error('welcome page missing required elements');

  const name = chrome.runtime.getManifest().name;
  if (!name) throw new Error('manifest name missing');
  document.title = name;

  for (const btn of buttons) btn.addEventListener('click', () => window.close());

  if (!globalThis.IH_i18n.zh) return;
  const en = document.querySelector('[data-ih-lang="en"]');
  const zhMain = document.querySelector('[data-ih-lang="zh"]');
  if (!en || !zhMain) throw new Error('welcome page missing language blocks');
  document.documentElement.lang = 'zh-CN';
  en.hidden = true;
  zhMain.hidden = false;
})();
