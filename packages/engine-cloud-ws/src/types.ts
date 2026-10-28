export interface FunctionResponse {
  id?: string;
  name?: string;
  response?: Record<string, unknown>;
}

export interface ToolCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

export type EnginePart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

export interface LiveServerMessage {
  setupComplete?: Record<string, unknown>;
  serverContent?: {
    modelTurn?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          data?: string;
          mimeType?: string;
        };
      }>;
    };
    interrupted?: boolean;
    turnComplete?: boolean;
    generationComplete?: boolean;
    inputTranscription?: {
      text?: string;
    };
    outputTranscription?: {
      text?: string;
    };
  };
  toolCall?: {
    functionCalls?: ToolCall[];
  };
  toolCallCancellation?: {
    ids?: string[];
  };
  sessionResumptionUpdate?: {
    newHandle?: string;
    resumable?: boolean;
  };
  goAway?: {
    timeLeft?: string;
  };
  usageMetadata?: Record<string, unknown>;
}
