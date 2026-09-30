/**
 * Firefox 构建专用，必须是 background.scripts 的第一项。
 * 1. Firefox MV3 后台是带 DOM 的 event page，没有 importScripts：脚本由 manifest 顺序加载，这里置空。
 * 2. 没有 chrome.offscreen：用后台页里的隐藏 iframe 承载 local/offscreen.html，接口与 offscreen 对齐。
 */
globalThis.importScripts = function () {};

(function () {
  if (chrome.offscreen) return;
  let frame = null;
  let loading = null;

  function createDocument({ url }) {
    if (frame) return Promise.reject(new Error('Only a single offscreen document may be created: already exists'));
    frame = document.createElement('iframe');
    frame.style.display = 'none';
    loading = new Promise((resolve, reject) => {
      frame.addEventListener('load', () => resolve(), { once: true });
      frame.addEventListener('error', () => reject(new Error('offscreen frame failed to load')), { once: true });
    });
    frame.src = chrome.runtime.getURL(url);
    document.documentElement.appendChild(frame);
    return loading;
  }

  chrome.offscreen = {
    hasDocument: () => Promise.resolve(!!frame),
    createDocument,
    closeDocument() {
      if (frame) frame.remove();
      frame = null;
      loading = null;
      return Promise.resolve();
    },
  };
})();
