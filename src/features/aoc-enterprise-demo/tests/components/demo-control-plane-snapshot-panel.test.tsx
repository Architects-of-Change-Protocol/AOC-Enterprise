import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DemoControlPlaneSnapshotPanel } from '../../components/DemoControlPlaneSnapshotPanel.js';
import { createEnterpriseDemoSuite } from '../../services/index.js';
import type { DemoControlPlaneSnapshot } from '../../domain/demo-control-plane-snapshot.js';

describe('DemoControlPlaneSnapshotPanel', () => {
  let snapshot: DemoControlPlaneSnapshot;

  before(async () => {
    const suite = createEnterpriseDemoSuite();
    snapshot = (await suite.runner.runScenario('internal-agent-allowed')).controlPlaneSnapshot!;
  });

  it('renders highlighted panels', () => {
    const html = renderToStaticMarkup(<DemoControlPlaneSnapshotPanel snapshot={snapshot} />);
    for (const panel of snapshot.visiblePanelIds) {
      assert.ok(html.includes(panel), `expected panel "${panel}"`);
    }
  });

  it('renders highlighted rows', () => {
    const html = renderToStaticMarkup(<DemoControlPlaneSnapshotPanel snapshot={snapshot} />);
    for (const row of snapshot.highlightedRows) {
      assert.ok(html.includes(row.rowId));
      assert.ok(html.includes(row.panel));
    }
  });

  it('renders timeline item ids', () => {
    const html = renderToStaticMarkup(<DemoControlPlaneSnapshotPanel snapshot={snapshot} />);
    for (const id of snapshot.timelineItemIds) {
      assert.ok(html.includes(id));
    }
  });

  it('renders an empty state with no snapshot', () => {
    const html = renderToStaticMarkup(<DemoControlPlaneSnapshotPanel />);
    assert.ok(html.includes('No Control Plane snapshot has been captured'));
  });
});
