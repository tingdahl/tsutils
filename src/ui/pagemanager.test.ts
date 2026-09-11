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
        const panel2 = new PanelHandler('panel-2');
        pm.addPanel(panel1);
        pm.addPanel(panel2);

        await pm.init();
        expect(initCalled).toBe(true);

        await pm.showPanel('panel-1');
        expect(refreshCalled).toBe(true);
        expect(pm.getActivePanelId()).toBe('panel-1');

        const el1 = document.getElementById('panel-1')!;
        const el2 = document.getElementById('panel-2')!;
        expect(el1.style.display).toBe('block');
        expect(el1.hidden).toBe(false);
        expect(el2.style.display).toBe('none');
        expect(el2.hidden).toBe(true);

        // Switch to panel-2
        await pm.showPanel('panel-2');
        expect(pm.getActivePanelId()).toBe('panel-2');
        expect(el1.style.display).toBe('none');
        expect(el1.hidden).toBe(true);
        expect(el2.style.display).toBe('block');
        expect(el2.hidden).toBe(false);
    });

    it('lazily loads and initializes panels via loader', async () => {
        const pm = new PageManager('app-container');
        let loaderCalled = false;

        pm.addPanel(new PanelHandler('panel-1'));
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
        expect(el1.hidden).toBe(true);
        expect(el2.style.display).toBe('block');
        expect(el2.hidden).toBe(false);
    });

    it('triggers onPanelShown callback when panel is shown', async () => {
        const pm = new PageManager('app-container');
        const shownSpy = vi.fn();
        pm.onPanelShown = shownSpy;

        pm.addPanel(new PanelHandler('panel-1'));
        await pm.showPanel('panel-1');

        expect(shownSpy).toHaveBeenCalledWith('panel-1');
    });

    it('ignores unregistered sibling elements in the parent container', async () => {
        document.body.innerHTML = `
            <div id="app-container">
                <div id="panel-1">Panel 1</div>
                <div id="overlay-dialog" style="display: flex;">Modal</div>
            </div>
        `;

        const pm = new PageManager('app-container');
        pm.addPanel(new PanelHandler('panel-1'));

        await pm.showPanel('panel-1');

        const panel1 = document.getElementById('panel-1')!;
        const overlay = document.getElementById('overlay-dialog')!;

        expect(panel1.style.display).toBe('block');
        expect(panel1.hidden).toBe(false);
        // Sibling overlay element remains untouched
        expect(overlay.style.display).toBe('flex');
        expect(overlay.hidden).toBe(false);
    });
});
