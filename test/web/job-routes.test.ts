import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(pathFromRoot: string): string {
  return readFileSync(resolve(process.cwd(), pathFromRoot), 'utf8');
}

describe('job detail route contract', () => {
  it('splits /jobs/$jobId into layout route plus index detail route', () => {
    const layoutRoute = read('web/src/routes/jobs.$jobId.tsx');
    const indexRoute = read('web/src/routes/jobs.$jobId.index.tsx');

    // Route structure
    expect(layoutRoute).toContain("createFileRoute('/jobs/$jobId')");
    expect(layoutRoute).toContain('component: JobLayout');
    expect(layoutRoute).toContain('<Outlet />');
    expect(layoutRoute).not.toContain('<JobDetail snapshot={snapshot} />');

    expect(indexRoute).toContain("createFileRoute('/jobs/$jobId/')");
    expect(indexRoute).toContain('component: JobDetailIndexPage');
    expect(indexRoute).toContain('<SplitPaneDetail');

    // Regression: live-status must use reactive snapshot, not stale loader
    expect(layoutRoute).not.toContain("loaderData?.job.status === 'running'");
    expect(layoutRoute).toContain('refetchInterval: (query)');

    expect(indexRoute).not.toContain("layoutLoaderData?.job.status === 'running'");
    expect(indexRoute).toContain("snapshot?.job.status === 'running'");
    expect(indexRoute).toContain('refetchInterval: (query)');
  });

  it('keeps generated route tree aligned with layout/index/session topology', () => {
    const routeTree = read('web/src/routeTree.gen.ts');

    expect(routeTree).toContain("import { Route as JobsJobIdIndexRouteImport } from './routes/jobs.$jobId.index'");
    expect(routeTree).toContain("'/jobs/$jobId/': typeof JobsJobIdIndexRoute");
    expect(routeTree).toContain("path: '/sessions/$sessionId'");
    expect(routeTree).toContain('parentRoute: typeof JobsJobIdRoute');
    expect(routeTree).toContain('JobsJobIdIndexRoute: typeof JobsJobIdIndexRoute');
    expect(routeTree).toContain('JobsJobIdSessionsSessionIdRoute: typeof JobsJobIdSessionsSessionIdRoute');
  });

  it('preserves child-page breadcrumb context and session reset invariants', () => {
    const childRoute = read('web/src/routes/jobs.$jobId.sessions.$sessionId.tsx');

    expect(childRoute).toContain('Back to Job');
    expect(childRoute).toContain('Sub-Agent Session');
    expect(childRoute).toContain('to="/jobs/$jobId"');
    expect(childRoute).toContain('key={sessionId}');
  });
});
