export type SupportStatus =
  | 'Waiting for Customer'
  | 'Investigating'
  | 'Waiting for Approval'
  | 'Completed'
  | 'Failed'
  | 'Escalated'
  | 'Customer Not Found'
  | string;

export interface SupportResponse {
  success: boolean;
  conversation_id: string;
  request_id: string | null;
  status: SupportStatus;
  ready_for_ticket: boolean;
  reply: string;
  missing_information: string[];
  requires_human_approval: boolean;
  ticket_id: string | null;
  issue_category?: string;
  issue_severity?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  result?: SupportResponse;
  failed?: boolean;
}

export interface StoredConversation {
  conversationId: string;
  messages: ChatMessage[];
}
