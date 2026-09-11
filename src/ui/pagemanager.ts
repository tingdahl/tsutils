export class PanelHandler {
    id: string;

    async refresh(): Promise<void> {
    }

    constructor(id: string) {
        this.id = id;
    }

    async init(): Promise<void> {
        return Promise.resolve();
    }
}

export type PanelLoader = () => Promise<PanelHandler>;

interface PanelEntry {
    loader?: PanelLoader;
    instance?: PanelHandler;
    isInitialized: boolean;
    loadPromise?: Promise<PanelHandler>;
}

export class PageManager {
    parentElementId: string;
    private panels: Map<string, PanelEntry>;
    private activePanelId: string | null = null;
    public onPanelShown?: (id: string) => void;

    constructor(parentElementId: string) {
        this.parentElementId = parentElementId;
        this.panels = new Map();
    }

    /**
     * Registers a pre-instantiated panel handler.
     */
    addPanel(panel: PanelHandler): void {
        this.panels.set(panel.id, {
            instance: panel,
            isInitialized: false,
        });
    }

    /**
     * Registers a lazily loaded panel with a loader function that imports and instantiates the panel.
     */
    registerPage(id: string, loader: PanelLoader): void {
        this.panels.set(id, {
            loader,
            isInitialized: false,
        });
    }

    /**
     * Initializes any pre-instantiated panels that have been added via addPanel.
     * Lazy panels will be initialized on first demand in showPanel.
     */
    async init(): Promise<void> {
        const initPromises: Promise<void>[] = [];
        for (const entry of this.panels.values()) {
            if (entry.instance && !entry.isInitialized) {
                entry.isInitialized = true;
                initPromises.push(entry.instance.init());
            }
        }
        await Promise.all(initPromises);
    }

    /**
     * Shows the specified panel by ID, loading and initializing its module if needed.
     */
    async showPanel(id: string): Promise<void> {
        this.activePanelId = id;
        const entry = this.panels.get(id);

        if (!entry) {
            console.warn(`PageManager: No panel registered with ID "${id}"`);
            this.updateDomVisibility(id);
            if (this.onPanelShown) {
                this.onPanelShown(id);
            }
            return;
        }

        try {
            // Load instance if not yet instantiated
            if (!entry.instance) {
                if (!entry.loader) {
                    throw new Error(`PageManager: Panel "${id}" has neither an instance nor a loader`);
                }
                if (!entry.loadPromise) {
                    entry.loadPromise = entry.loader();
                }
                entry.instance = await entry.loadPromise;
            }

            // Initialize once if not already initialized
            if (!entry.isInitialized) {
                entry.isInitialized = true;
                await entry.instance.init();
            }

            // Refresh panel data/UI
            await entry.instance.refresh();

            // Guard against race conditions (user clicked another tab while loading)
            if (this.activePanelId === id) {
                this.updateDomVisibility(id);
                if (this.onPanelShown) {
                    this.onPanelShown(id);
                }
            }
        } catch (error) {
            console.error(`PageManager: Failed to show panel "${id}":`, error);
        }
    }

    getActivePanelId(): string | null {
        return this.activePanelId;
    }

    async refreshActivePanel(): Promise<void> {
        if (!this.activePanelId) return;
        const entry = this.panels.get(this.activePanelId);
        if (entry?.instance && entry.isInitialized) {
            try {
                await entry.instance.refresh();
            } catch (error) {
                console.error(`PageManager: Failed to refresh active panel "${this.activePanelId}":`, error);
            }
        }
    }

    private updateDomVisibility(id: string): void {
        if (typeof document === 'undefined') return;
        const parentElement = document.getElementById(this.parentElementId);
        if (parentElement) {
            for (const child of Array.from(parentElement.children)) {
                const htmlChild = child as HTMLElement;
                if (!this.panels.has(htmlChild.id) && htmlChild.id !== id) {
                    continue;
                }
                const isCurrent = htmlChild.id === id;
                htmlChild.hidden = !isCurrent;
                htmlChild.style.display = isCurrent ? 'block' : 'none';
            }
        } else {
            console.error(`PageManager: Could not find parent element with ID ${this.parentElementId}`);
        }
    }
}
