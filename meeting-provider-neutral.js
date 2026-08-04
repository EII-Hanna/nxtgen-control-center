(() => {
  const replacements = [
    [/Fireflies\.ai/gi, 'Zoom'],
    [/Fireflies/gi, 'Meeting-Transkript'],
    [/fireflies/gi, 'meeting'],
    [/Notetaker/gi, 'Meeting-Aufzeichnung']
  ];

  const rewrite = root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      let value = node.nodeValue || '';
      replacements.forEach(([pattern, next]) => { value = value.replace(pattern, next); });
      node.nodeValue = value;
    });
  };

  const run = () => rewrite(document.body);
  window.addEventListener('nxtgen:ready', () => setTimeout(run, 50));
  new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) rewrite(node);
      if (node.nodeType === Node.TEXT_NODE && node.parentElement) rewrite(node.parentElement);
    }));
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
