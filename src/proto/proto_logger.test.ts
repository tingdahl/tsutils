import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupProtoLogging, resetProtoLoggingForTest, isLong, formatLong, formatForLogging } from './proto_logger.js';

describe('proto_logger', () => {
    beforeEach(() => {
        resetProtoLoggingForTest();
        vi.restoreAllMocks();
    });

    it('wraps encode and decode on message classes within a namespace tree', () => {
        const consoleGroupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
        const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const consoleEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
        vi.spyOn(console, 'trace').mockImplementation(() => {});

        // Mock protobuf message class
        class MockMessage {
            data: string;
            constructor(data: string) {
                this.data = data;
            }

            static decode(reader: any) {
                return new MockMessage('decoded-data');
            }

            static encode(msg: MockMessage) {
                return {
                    finish() {
                        return new Uint8Array([1, 2, 3]);
                    }
                };
            }
        }

        const mockProtoRoot = {
            services: {
                v1: {
                    MockMessage
                }
            }
        };

        const enabled = setupProtoLogging(mockProtoRoot, { forceEnable: true });
        expect(enabled).toBe(true);

        // Test decode interception
        const decoded = MockMessage.decode(new Uint8Array([1, 2, 3]));
        expect(decoded.data).toBe('decoded-data');
        expect(consoleGroupSpy).toHaveBeenCalledWith(
            expect.stringContaining('[Proto Decode] %cservices.v1.MockMessage'),
            expect.any(String),
            expect.any(String),
            expect.any(String)
        );

        // Test encode interception
        const writer = MockMessage.encode(new MockMessage('test'));
        const bytes = writer.finish();
        expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
        expect(consoleGroupSpy).toHaveBeenCalledWith(
            expect.stringContaining('[Proto Encode] %cservices.v1.MockMessage'),
            expect.any(String),
            expect.any(String),
            expect.any(String)
        );
    });

    it('formats int64 Long objects into a single numeric value in console logs', () => {
        const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
        vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

        const fakeLong = {
            low: 12345,
            high: 0,
            unsigned: false,
            toNumber() { return 12345; },
            toString() { return '12345'; }
        };

        expect(isLong(fakeLong)).toBe(true);
        expect(formatLong(fakeLong)).toBe(12345);

        class MessageWithLong {
            id: any;
            items: any[];
            constructor() {
                this.id = fakeLong;
                this.items = [{ subId: fakeLong }];
            }
            static decode() {
                return new MessageWithLong();
            }
            static encode(msg: any) {
                return { finish() { return new Uint8Array([1]); } };
            }
        }

        setupProtoLogging({ test: { MessageWithLong } }, { forceEnable: true });
        const decoded = MessageWithLong.decode();

        // The returned instance should preserve the original Long for application code
        expect(decoded.id).toBe(fakeLong);

        // But the logged object should format the Long as a single numeric value
        expect(consoleLogSpy).toHaveBeenCalledWith(
            'Decoded Message Object:',
            expect.objectContaining({
                id: 12345,
                items: [{ subId: 12345 }]
            })
        );
    });
});
