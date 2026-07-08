export const shadowRootHosts: Element[] = [];

const nodes: Node[] = [];
const iterationLimit = 100;

const styledShadowRoots = new WeakSet<ShadowRoot>();

// Document stylesheets do not cross shadow boundaries, so an asbplayer overlay placed inside a
// player's shadow-DOM modal dialog never receives its .asbplayer-* rules from video.css and renders
// at the default size. Adopt that stylesheet into the shadow root so overlays are styled there too.
// No-op when the element is not inside a shadow root, which is every normal site.
export const adoptVideoCssIntoShadowRoot = (element: Element) => {
    const root = element.getRootNode();

    if (!(root instanceof ShadowRoot) || styledShadowRoots.has(root)) {
        return;
    }

    styledShadowRoots.add(root);
    const sheet = new CSSStyleSheet();
    fetch(browser.runtime.getURL('/content-scripts/video.css'))
        .then((response) => response.text())
        .then((css) => {
            sheet.replaceSync(css);
            root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
        })
        .catch((e) => console.error('[asbplayer] Failed to adopt overlay styles into shadow root', e));
};

const garbageCollect = () => {
    let i = 0;

    while (i < shadowRootHosts.length) {
        const host = shadowRootHosts[i];

        // isConnected rather than document.contains: contains() does not cross shadow
        // boundaries, so it would evict hosts nested inside other shadow roots
        if (!host.isConnected || !host.shadowRoot) {
            shadowRootHosts.splice(i, 1);
        } else {
            ++i;
        }
    }
};

export const incrementallyFindShadowRoots = () => {
    garbageCollect();

    if (nodes.length === 0) {
        // Re-scan continuously: a host nested inside another shadow root can appear after the
        // outer host was already found (e.g. a player mounted in a modal's shadow root).
        nodes.push(document);
    }

    let iteration = 0;

    while (nodes.length > 0 && ++iteration < iterationLimit) {
        const node = nodes.pop();

        if (!node) {
            continue;
        }

        const shadowRoot = (node as Element).shadowRoot;

        if (shadowRoot) {
            if (!shadowRootHosts.includes(node as Element)) {
                shadowRootHosts.push(node as Element);
            }

            nodes.push(shadowRoot);
        }

        for (const child of node.childNodes) {
            nodes.push(child);
        }
    }
};
