export function getAssistantTransportCapabilities(windowRef, isAndroidRuntimeFn) {
    const canUseBridgeStream =
        typeof windowRef?.appBridge?.chatStream === 'function'
        && typeof windowRef?.appBridge?.onAssistantChunk === 'function';

    const canUseBridgeChat = typeof windowRef?.appBridge?.chat === 'function';
    const canUseAndroidNativeChat = !canUseBridgeStream && !canUseBridgeChat && !!isAndroidRuntimeFn?.();

    return { canUseBridgeStream, canUseBridgeChat, canUseAndroidNativeChat };
}

export function resolveAssistantTransportMode(capabilities, canPromptAndroidManualApiKey = false) {
    if (capabilities?.canUseBridgeStream) return 'bridge-stream';
    if (capabilities?.canUseBridgeChat) return 'bridge-chat';
    if (capabilities?.canUseAndroidNativeChat && canPromptAndroidManualApiKey) return 'android-legacy';
    if (capabilities?.canUseAndroidNativeChat) return 'bridge-unavailable';
    return 'unavailable';
}