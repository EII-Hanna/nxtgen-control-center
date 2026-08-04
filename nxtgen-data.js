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

  loadAsset('style', './ui-reset.css?v=20260804-2204');
  loadAsset('style', './automation-hub.css?v=20260804-2204');
  loadAsset('style', './sales-conversation-record.css?v=20260804-2204');
  loadAsset('script', './ui-reset.js?v=20260804-2204');
  loadAsset('script', './meeting-provider-neutral.js?v=20260804-2204');
  loadAsset('script', './automation-hub.js?v=20260804-2204');
  loadAsset('script', './sales-conversation-record.js?v=20260804-2204');
})();