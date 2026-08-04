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

  // UI architecture reset: only the five daily operating areas are loaded.
  loadAsset('style', './ui-reset.css?v=20260804-2122');
  loadAsset('script', './ui-reset.js?v=20260804-2122');
  loadAsset('script', './meeting-provider-neutral.js?v=20260804-2122');
})();
