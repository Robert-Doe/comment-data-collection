import { useEffect, useMemo, useRef } from 'react';

const LEGACY_PAGES = {
  '/': {
    legacyPath: '/legacy/index.html',
    title: 'UGC Scanner',
  },
  '/index.html': {
    legacyPath: '/legacy/index.html',
    title: 'UGC Scanner',
  },
  '/modeling': {
    legacyPath: '/legacy/modeling.html',
    title: 'UGC Scanner Model Lab',
  },
  '/modeling.html': {
    legacyPath: '/legacy/modeling.html',
    title: 'UGC Scanner Model Lab',
  },
  '/feature-docs': {
    legacyPath: '/legacy/feature-docs.html',
    title: 'UGC Scanner Feature Docs',
  },
  '/feature-docs.html': {
    legacyPath: '/legacy/feature-docs.html',
    title: 'UGC Scanner Feature Docs',
  },
  '/demo': {
    legacyPath: '/legacy/demo.html',
    title: 'UGC Scanner - Model Lab Demo Tour',
  },
  '/demo.html': {
    legacyPath: '/legacy/demo.html',
    title: 'UGC Scanner - Model Lab Demo Tour',
  },
};

const LEGACY_ROUTE_ALIASES = {
  '/legacy': '/',
  '/legacy/': '/',
  '/legacy/index.html': '/',
  '/legacy/modeling.html': '/modeling',
  '/legacy/feature-docs.html': '/feature-docs',
  '/legacy/demo.html': '/demo',
};

function normalizePathname(pathname) {
  if (!pathname) {
    return '/';
  }
  if (LEGACY_ROUTE_ALIASES[pathname]) {
    return LEGACY_ROUTE_ALIASES[pathname];
  }
  return LEGACY_PAGES[pathname] ? pathname : '/';
}

function resolveApiBaseFromEnv() {
  const value = String(process.env.REACT_APP_API_BASE_URL || '').trim();
  return value.replace(/\/+$/g, '');
}

function buildIframeSrc(legacyPath) {
  const params = new URLSearchParams(window.location.search);
  const apiBaseUrl = resolveApiBaseFromEnv();

  if (apiBaseUrl && !params.get('apiBaseUrl')) {
    params.set('apiBaseUrl', apiBaseUrl);
  }

  const query = params.toString();
  return query ? `${legacyPath}?${query}` : legacyPath;
}

function outerPathFromLegacy(pathname) {
  return LEGACY_ROUTE_ALIASES[pathname] || null;
}

function App() {
  const iframeRef = useRef(null);
  const currentPath = normalizePathname(window.location.pathname);
  const page = LEGACY_PAGES[currentPath] || LEGACY_PAGES['/'];
  const iframeSrc = useMemo(() => buildIframeSrc(page.legacyPath), [page.legacyPath]);

  useEffect(() => {
    document.title = page.title;
  }, [page.title]);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) {
      return undefined;
    }

    const syncOuterLocation = () => {
      try {
        const { location } = frame.contentWindow;
        const outerPath = outerPathFromLegacy(location.pathname);
        if (!outerPath) {
          return;
        }

        const nextPath = `${outerPath}${location.search || ''}`;
        const currentFullPath = `${window.location.pathname}${window.location.search}`;
        if (currentFullPath !== nextPath) {
          window.history.replaceState({}, '', nextPath);
        }

        const iframeTitle = frame.contentDocument && frame.contentDocument.title;
        if (iframeTitle && document.title !== iframeTitle) {
          document.title = iframeTitle;
        }
      } catch (_) {
        // The iframe is same-origin, but ignore transient access errors during loads.
      }
    };

    const interval = window.setInterval(syncOuterLocation, 1000);
    frame.addEventListener('load', syncOuterLocation);
    syncOuterLocation();

    return () => {
      window.clearInterval(interval);
      frame.removeEventListener('load', syncOuterLocation);
    };
  }, [iframeSrc]);

  return (
    <iframe
      ref={iframeRef}
      className="legacy-frame"
      title={page.title}
      src={iframeSrc}
    />
  );
}

export default App;
