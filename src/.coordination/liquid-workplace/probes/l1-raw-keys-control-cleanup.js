/** Removes every node planted by `l1-raw-keys-control.js` and proves the count went to 0. */
(() => {
  const nodes = [...document.querySelectorAll('[data-l1-control]')];
  const kinds = nodes.map((n) => n.getAttribute('data-l1-control'));
  for (const n of nodes) n.remove();
  return JSON.stringify({
    removed: nodes.length,
    kinds,
    remaining: document.querySelectorAll('[data-l1-control]').length,
  });
})()
