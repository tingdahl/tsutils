import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PageManager, PanelHandler } from './pagemanager.js';

describe('PageManager & PanelHandler', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="app-container">
                <div id="panel-1" style="display: none;">Panel 1</div>
                <div id="panel-2" style="display: none;">Panel 2</div>
            </div>
        `;
    });

    it('registers, initializes, and displays pre-instantiated panels', async () => {
        const pm = new PageManager('app-container');
        let initCalled = false;
        let refreshCalled = false;

        class TestPanel extends PanelHandler {
            override async init() {
                initCalled = true;
            }
            override async refresh() {
                refreshCalled = true;
            }
        }

        const panel1 = new TestPanel('panel-1');
        pm.addPanel(panel1);

        await pm.init();
        expect(initCalled).toBe(true);

        await pm.showPanel('panel-1');
        expect(refreshCalled).toBe(true);
        expect(pm.getActivePanelId()).toBe('panel-1');

        const el1 = document.getElementById('panel-1')!;
        const el2 = document.getElementById('panel-2')!;
        expect(el1.style.display).toBe('block');
        expect(el2.style.display).toBe('none');
    });

    it('lazily loads and initializes panels via loader', async () => {
        const pm = new PageManager('app-container');
        let loaderCalled = false;

        pm.registerPage('panel-2', async () => {
            loaderCalled = true;
            return new PanelHandler('panel-2');
        });

        expect(loaderCalled).toBe(false);

        await pm.showPanel('panel-2');
        expect(loaderCalled).toBe(true);
        expect(pm.getActivePanelId()).toBe('panel-2');

        const el1 = document.getElementById('panel-1')!;
        const el2 = document.getElementById('panel-2')!;
        expect(el1.style.display).toBe('none');
        expect(el2.style.display).toBe('block');
    });

    it('triggers onPanelShown callback when panel is shown', async () => {
        const pm = new PageManager('app-container');
        const shownSpy = vi.fn();
        pm.onPanelShown = shownSpy;

        pm.addPanel(new PanelHandler('panel-1'));
        await pm.showPanel('panel-1');

        expect(shownSpy).toHaveBeenCalledWith('panel-1');
    });
});
