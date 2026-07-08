import { incrementallyFindShadowRoots, shadowRootHosts } from './shadow-roots';

// Drive the incremental walk to completion, bounded so a bug can't hang the test.
const findAllShadowRoots = () => {
    for (let i = 0; i < 50; ++i) {
        incrementallyFindShadowRoots();
    }
};

describe('incrementallyFindShadowRoots', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        shadowRootHosts.length = 0;
    });

    it('finds a top-level shadow host', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.attachShadow({ mode: 'open' });

        findAllShadowRoots();

        expect(shadowRootHosts).toContain(host);
    });

    it('finds a shadow host nested inside another shadow root', () => {
        const outer = document.createElement('div');
        document.body.appendChild(outer);
        const outerRoot = outer.attachShadow({ mode: 'open' });

        const inner = document.createElement('div');
        outerRoot.appendChild(inner);
        inner.attachShadow({ mode: 'open' });

        findAllShadowRoots();

        expect(shadowRootHosts).toContain(outer);
        expect(shadowRootHosts).toContain(inner);
    });

    it('discovers a nested host that appears after the outer host was already found', () => {
        const outer = document.createElement('div');
        document.body.appendChild(outer);
        const outerRoot = outer.attachShadow({ mode: 'open' });

        findAllShadowRoots();
        expect(shadowRootHosts).toContain(outer);

        const inner = document.createElement('div');
        outerRoot.appendChild(inner);
        inner.attachShadow({ mode: 'open' });

        findAllShadowRoots();

        expect(shadowRootHosts).toContain(inner);
    });

    it('keeps a nested host across ticks when the DOM is too large for a single-tick pass', () => {
        const outer = document.createElement('div');
        document.body.appendChild(outer);
        const outerRoot = outer.attachShadow({ mode: 'open' });

        // Filler so one tick's iteration budget cannot complete a full pass; eviction of the
        // nested host would otherwise be hidden by same-tick rediscovery
        for (let i = 0; i < 300; ++i) {
            document.body.appendChild(document.createElement('div'));
        }

        const inner = document.createElement('div');
        outerRoot.appendChild(inner);
        inner.attachShadow({ mode: 'open' });

        findAllShadowRoots();
        expect(shadowRootHosts).toContain(inner);

        incrementallyFindShadowRoots();

        expect(shadowRootHosts).toContain(inner);
    });

    it('does not record the same host twice across repeated scans', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.attachShadow({ mode: 'open' });

        findAllShadowRoots();
        findAllShadowRoots();

        expect(shadowRootHosts.filter((h) => h === host)).toHaveLength(1);
    });

    it('drops hosts that leave the document', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.attachShadow({ mode: 'open' });

        findAllShadowRoots();
        expect(shadowRootHosts).toContain(host);

        host.remove();
        findAllShadowRoots();

        expect(shadowRootHosts).not.toContain(host);
    });
});
