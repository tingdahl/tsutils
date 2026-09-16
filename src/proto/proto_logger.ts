export interface ProtoLoggingOptions {
    paramName?: string;
    localStorageKey?: string;
    enableGlobalHelpers?: boolean;
    forceEnable?: boolean;
}

let loggingInitialized = false;

/**
 * Checks if a value is a 64-bit integer Long instance (e.g. from long.js/protobufjs).
 */
export function isLong(val: any): boolean {
    return Boolean(
        val &&
        typeof val === 'object' &&
        (val.__isLong__ === true ||
            (typeof val.low === 'number' && typeof val.high === 'number' && typeof val.unsigned === 'boolean'))
    );
}

/**
 * Converts a 64-bit integer Long instance to a single numeric value.
 */
export function formatLong(val: any): number {
    if (typeof val.toNumber === 'function') {
        return val.toNumber();
    }
    return Number(val.toString ? val.toString() : val);
}

/**
 * Formats a protobuf message or object for console logging, converting
 * multi-part int64 Long instances into single numeric values.
 */
export function formatForLogging(val: any, seen: WeakSet<object> = new WeakSet()): any {
    if (val === null || val === undefined) return val;
    if (isLong(val)) return formatLong(val);
    if (typeof val !== 'object') return val;
    if (val instanceof Uint8Array || ArrayBuffer.isView(val) || val instanceof ArrayBuffer) return val;

    if (seen.has(val)) return '[Circular]';
    seen.add(val);

    if (Array.isArray(val)) {
        return val.map((item) => formatForLogging(item, seen));
    }

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(val)) {
        result[key] = formatForLogging(value, seen);
    }
    return result;
}

/**
 * Traverses a protobuf namespace or object tree and attaches decode/encode interceptors
 * that log formatted messages to the browser console.
 */
export function setupProtoLogging(protoRoot: any, options?: ProtoLoggingOptions): boolean {
    if (loggingInitialized) return true;

    const paramName = options?.paramName || 'proto_debug';
    const storageKey = options?.localStorageKey || 'proto_debug';

    let isDebugEnabled = Boolean(options?.forceEnable);

    if (!isDebugEnabled && typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search || '');
        const debugParam = urlParams.get(paramName);
        const localStorageDebug = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;

        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        isDebugEnabled = debugParam === 'true' || debugParam === '1' || localStorageDebug === 'true' || (debugParam !== 'false' && isLocalhost);

        if (options?.enableGlobalHelpers !== false) {
            (window as any).enableProtoDebug = (enable: boolean = true) => {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(storageKey, enable ? 'true' : 'false');
                }
                console.log(`Proto debug ${enable ? 'enabled' : 'disabled'} in localStorage. Please reload the page to apply.`);
            };
            (window as any).disableProtoDebug = () => {
                (window as any).enableProtoDebug(false);
            };
        }
    }

    if (!isDebugEnabled) {
        return false;
    }

    loggingInitialized = true;
    console.log(
        "%c🛠️ Protobuf Logging Interceptor Enabled!",
        "color: #10b981; font-weight: bold; font-size: 1.1em;"
    );

    wrapNamespace(protoRoot, "");
    return true;
}

/**
 * Helper to wrap a single protobuf message class's decode and encode methods.
 */
export function wrapMessageClass(className: string, messageClass: any): void {
    if (!messageClass || typeof messageClass !== 'function') return;

    // Wrap decode
    if (typeof messageClass.decode === 'function' && !messageClass.decode.__wrapped) {
        const originalDecode = messageClass.decode;
        const newDecode = function (reader: any, length?: number, error?: any) {
            const decoded = originalDecode.call(messageClass, reader, length, error);

            // Try to get buffer size
            let size = 0;
            if (reader) {
                if (reader.buf) {
                    size = reader.buf.byteLength || reader.buf.length || 0;
                } else if (reader.byteLength || reader.length) {
                    size = reader.byteLength || reader.length || 0;
                } else if (reader instanceof Uint8Array || ArrayBuffer.isView(reader) || reader instanceof ArrayBuffer) {
                    size = reader.byteLength || (reader as any).length || 0;
                }
            }

            console.groupCollapsed(
                `%c📥 [Proto Decode] %c${className} %c(${size ? size + ' bytes' : 'unknown size'})`,
                "color: #3b82f6; font-weight: bold;",
                "color: #1e293b; font-weight: bold;",
                "color: #64748b; font-weight: normal; font-style: italic;"
            );
            console.log("Decoded Message Object:", formatForLogging(decoded));
            if (typeof console.trace === 'function') {
                console.trace("Decode Stack Trace");
            }
            console.groupEnd();

            return decoded;
        };
        (newDecode as any).__wrapped = true;
        messageClass.decode = newDecode;
    }

    // Wrap encode
    if (typeof messageClass.encode === 'function' && !messageClass.encode.__wrapped) {
        const originalEncode = messageClass.encode;
        const newEncode = function (message: any, writer?: any) {
            const writerResult = originalEncode.call(messageClass, message, writer);

            // Wrap finish to capture final encoded bytes
            if (writerResult && typeof writerResult.finish === 'function' && !writerResult.finish.__wrapped) {
                const originalFinish = writerResult.finish;
                const newFinish = function () {
                    const bytes = originalFinish.call(writerResult);

                    console.groupCollapsed(
                        `%c📤 [Proto Encode] %c${className} %c(${bytes.length} bytes)`,
                        "color: #10b981; font-weight: bold;",
                        "color: #1e293b; font-weight: bold;",
                        "color: #64748b; font-weight: normal; font-style: italic;"
                    );
                    console.log("Message to Encode:", formatForLogging(message));
                    if (typeof console.trace === 'function') {
                        console.trace("Encode Stack Trace");
                    }
                    console.groupEnd();

                    return bytes;
                };
                (newFinish as any).__wrapped = true;
                writerResult.finish = newFinish;
            }

            return writerResult;
        };
        (newEncode as any).__wrapped = true;
        messageClass.encode = newEncode;
    }
}

/**
 * Recursively traverses namespaces and objects to wrap all message classes.
 */
export function wrapNamespace(obj: any, currentPath: string = ""): void {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
        const path = currentPath ? `${currentPath}.${key}` : key;
        if (typeof value === 'function' && value.prototype) {
            wrapMessageClass(path, value);
        } else if (value && typeof value === 'object') {
            wrapNamespace(value, path);
        }
    }
}

/**
 * Resets the logging initialization guard (primarily for testing).
 */
export function resetProtoLoggingForTest(): void {
    loggingInitialized = false;
}
