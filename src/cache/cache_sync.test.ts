import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacheSyncService, CacheInvalidationPayload } from './cache_sync.js';

describe('CacheSyncService', () => {
    let originalBroadcastChannel: any;
    let mockChannels: Map<string, any[]>;

    beforeEach(() => {
        originalBroadcastChannel = globalThis.BroadcastChannel;
        mockChannels = new Map();

        // Polyfill BroadcastChannel for isolated test environment
        class MockBroadcastChannel {
            name: string;
            onmessage: ((event: any) => void) | null = null;

            constructor(name: string) {
                this.name = name;
                if (!mockChannels.has(name)) {
                    mockChannels.set(name, []);
                }
                mockChannels.get(name)!.push(this);
            }

            postMessage(data: any) {
                const peers = mockChannels.get(this.name) || [];
                for (const peer of peers) {
                    if (peer !== this && peer.onmessage) {
                        peer.onmessage({ data });
                    }
                }
            }

            close() {
                const peers = mockChannels.get(this.name) || [];
                const idx = peers.indexOf(this);
                if (idx !== -1) {
                    peers.splice(idx, 1);
                }
            }
        }

        globalThis.BroadcastChannel = MockBroadcastChannel as any;
    });

    afterEach(() => {
        globalThis.BroadcastChannel = originalBroadcastChannel;
    });

    it('notifies local listeners when invalidation is broadcast', () => {
        const service = new CacheSyncService({ channelName: 'test_channel' });
        const received: CacheInvalidationPayload[] = [];

        service.onInvalidate((payload) => {
            received.push(payload);
        });

        service.broadcastInvalidation('domain1', 'scope-123', { entityType: 'item', entityId: 42 });

        expect(received).toHaveLength(1);
        expect(received[0].domain).toBe('domain1');
        expect(received[0].scopeId).toBe('scope-123');
        expect(received[0].companyId).toBe('scope-123');
        expect(received[0].entityType).toBe('item');
        expect(received[0].entityId).toBe(42);
        expect(received[0].senderTabId).toBe(service.getTabId());

        service.close();
    });

    it('broadcasts across simulated tabs with BroadcastChannel', () => {
        const tab1 = new CacheSyncService({ channelName: 'shared_channel' });
        const tab2 = new CacheSyncService({ channelName: 'shared_channel' });

        const receivedInTab2: CacheInvalidationPayload[] = [];
        tab2.onInvalidate((payload) => {
            receivedInTab2.push(payload);
        });

        tab1.broadcastInvalidation('users', 'company-99', { entityType: 'user' });

        expect(receivedInTab2).toHaveLength(1);
        expect(receivedInTab2[0].domain).toBe('users');
        expect(receivedInTab2[0].companyId).toBe('company-99');
        expect(receivedInTab2[0].senderTabId).toBe(tab1.getTabId());

        tab1.close();
        tab2.close();
    });

    it('unsubscribes listeners correctly', () => {
        const service = new CacheSyncService();
        const listener = vi.fn();

        const unsubscribe = service.onInvalidate(listener);
        service.broadcastInvalidation('test');
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        service.broadcastInvalidation('test');
        expect(listener).toHaveBeenCalledTimes(1);

        service.close();
    });
});
