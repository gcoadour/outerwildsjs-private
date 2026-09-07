// Analyseur XML minimal, suffisant pour les arbres de dialogue du jeu.
//
// DOMParser existe dans un Worker mais pas sous Node, et les tests tournent
// sous Node. Plutot qu'un chemin different de chaque cote — donc non teste d'un
// cote — le pipeline utilise le meme analyseur partout. Le schema a couvrir est
// etroit : elements, attributs, texte, commentaires et CDATA.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X"
        ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] !== undefined ? ENTITIES[e] : m;
  });
}

/**
 * @returns {{tag:string, attrs:object, children:Array, text:string}|null}
 */
export function parseXML(src) {
  let i = 0;
  const root = { tag: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];

  const skipTo = (needle) => {
    const at = src.indexOf(needle, i);
    i = at === -1 ? src.length : at + needle.length;
  };

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) break;
    if (lt > i) {
      const txt = src.slice(i, lt);
      if (txt.trim()) stack[stack.length - 1].text += decodeEntities(txt);
    }
    i = lt;

    if (src.startsWith("<!--", i)) { skipTo("-->"); continue; }
    if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i);
      const body = src.slice(i + 9, end === -1 ? src.length : end);
      stack[stack.length - 1].text += body;
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<?", i)) { skipTo("?>"); continue; }
    if (src.startsWith("<!", i)) { skipTo(">"); continue; }

    const gt = src.indexOf(">", i);
    if (gt === -1) break;
    const inner = src.slice(i + 1, gt);
    i = gt + 1;

    if (inner[0] === "/") {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const selfClosing = inner.endsWith("/");
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const m = /^([^\s/>]+)([\s\S]*)$/.exec(body);
    if (!m) continue;

    const node = { tag: m[1], attrs: {}, children: [], text: "" };
    const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = attrRe.exec(m[2]))) {
      node.attrs[a[1]] = decodeEntities(a[3] !== undefined ? a[3] : a[4]);
    }
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }

  return root.children.length ? root.children[0] : null;
}
