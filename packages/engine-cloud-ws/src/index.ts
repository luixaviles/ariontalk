export { WsClient, WsHandshakeError, type WsClientOptions } from './ws-client.js';
export {
  LIVE_API_VERSION,
  buildLiveUrl,
  buildSetupFrame,
  isSetupComplete,
  encodeAudioChunk,
  encodeText,
  encodeClientContent,
  encodeToolResponse,
} from './gemini-protocol.js';
export type {
  FunctionResponse,
  ToolCall,
  EnginePart,
  LiveServerMessage,
} from './types.js';
