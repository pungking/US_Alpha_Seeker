interface AiStudioBridge {
  hasSelectedApiKey?: () => boolean | Promise<boolean>;
}

interface Window {
  aistudio?: AiStudioBridge;
}
