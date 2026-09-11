export interface CacheInvalidationMetadata<TEntityType extends string = string> {
    entityType?: TEntityType | string;
    entityId?: number | string;
    extra?: Record<string, any>;
}

export interface CacheInvalidationPayload<TDomain extends string = string, TEntityType extends string = string> {
    domain: TDomain;
    scopeId?: string;
    companyId?: string;
    entityType?: TEntityType | string;
    entityId?: number | string;
    senderTabId: string;
    timestamp: number;
    extra?: Record<string, any>;
}

export type InvalidationListener<TDomain extends string = string, TEntityType extends string = string> =
    (payload: CacheInvalidationPayload<TDomain, TEntityType>) => void;

export interface CacheSyncOptions {
    channelName?: string;
}

export class CacheSyncService<TDomain extends string = string, TEntityType extends string = string> {
    private channel: BroadcastChannel | null = null;
    private tabId: string;
    private listeners: Set<InvalidationListener<TDomain, TEntityType>> = new Set();
    private channelName: string;

    constructor(options?: CacheSyncOptions) {
        this.channelName = options?.channelName || 'app_cache_sync';
        this.tabId = Math.random().toString(36).substring(2) + Date.now().toString(36);

        if (typeof BroadcastChannel !== 'undefined') {
            try {
                this.channel = new BroadcastChannel(this.channelName);
                this.channel.onmessage = (event: MessageEvent<CacheInvalidationPayload<TDomain, TEntityType>>) => {
                    if (event.data && event.data.senderTabId !== this.tabId) {
                        this.notifyListeners(event.data);
                    }
                };
            } catch (e) {
                console.warn(`BroadcastChannel not supported or failed to initialize for channel "${this.channelName}":`, e);
            }
        }
    }

    public broadcastInvalidation(
        domain: TDomain,
        scopeId?: string | number | any,
        metadata?: CacheInvalidationMetadata<TEntityType>
    ): void {
        const idStr = scopeId != null ? String(scopeId) : undefined;
        const payload: CacheInvalidationPayload<TDomain, TEntityType> = {
            domain,
            scopeId: idStr,
            companyId: idStr,
            entityType: metadata?.entityType,
            entityId: metadata?.entityId,
            senderTabId: this.tabId,
            timestamp: Date.now(),
            extra: metadata?.extra,
        };

        if (this.channel) {
            try {
                this.channel.postMessage(payload);
            } catch (e) {
                console.warn(`Failed to broadcast cache invalidation on channel "${this.channelName}":`, e);
            }
        }
        this.notifyListeners(payload);
    }

    public onInvalidate(listener: InvalidationListener<TDomain, TEntityType>): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(payload: CacheInvalidationPayload<TDomain, TEntityType>): void {
        this.listeners.forEach(listener => {
            try {
                listener(payload);
            } catch (e) {
                console.error('Error in cache invalidation listener:', e);
            }
        });
    }

    public getTabId(): string {
        return this.tabId;
    }

    public getChannelName(): string {
        return this.channelName;
    }

    public close(): void {
        if (this.channel) {
            this.channel.close();
            this.channel = null;
        }
        this.listeners.clear();
    }
}
