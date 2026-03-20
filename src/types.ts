export type Message = {
  id: string;
  sender: 'user' | 'philosopher';
  philosopherId?: string; // ID of the philosopher who sent the message
  senderName?: string; // Display name for the speaker
  text: string;
  timestamp: Date;
  isStreaming?: boolean;
  isError?: boolean;
};

export type Group = {
  id: string;
  name: string;
  memberIds: string[];
};

export type ChatHistory = Record<string, Message[]>;
