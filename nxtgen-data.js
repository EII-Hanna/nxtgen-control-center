(() => {
  function loadAsset(type, path) {
    if (type === 'style') {
      if (document.querySelector(`link[href="${path}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = path;
      document.head.appendChild(link);
      return;
    }
    if (document.querySelector(`script[src="${path}"]`)) return;
    const script = document.createElement('script');
    script.src = path;
    script.defer = true;
    document.body.appendChild(script);
  }

  const v = '20260804-2212';
  loadAsset('style', `./ui-reset.css?v=${v}`);
  loadAsset('style', `./automation-hub.css?v=${v}`);
  loadAsset('style', `./sales-reference-view.css?v=${v}`);
  loadAsset('style', `./sales-conversation-record.css?v=${v}`);
  loadAsset('script', `./ui-reset.js?v=${v}`);
  loadAsset('script', `./meeting-provider-neutral.js?v=${v}`);
  loadAsset('script', `./automation-hub.js?v=${v}`);
  loadAsset('script', `./sales-reference-view.js?v=${v}`);
  loadAsset('script', `./sales-conversation-record.js?v=${v}`);
})();