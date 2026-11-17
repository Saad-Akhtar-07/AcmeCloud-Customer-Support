import { appConfig } from './config';
import type { SupportResponse } from '../types';

export class SupportApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SupportApiError';
  }
}

export async function sendSupportMessage(input: {
  accessToken: string;
  conversationId: string;
  message: string;
}): Promise<SupportResponse> {
  if (!appConfig.webhookUrl) {
    throw new SupportApiError('The support endpoint is not configured.', 500);
  }

  const response = await fetch(appConfig.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + input.accessToken,
    },
    body: JSON.stringify({
      conversation_id: input.conversationId,
      message: input.message,
      channel: 'web_chat',
    }),
  });

  let payload: Partial<SupportResponse> & { message?: string; error?: string } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // A useful fallback is returned below when n8n sends a non-JSON response.
  }

  if (!response.ok) {
    const message =
      payload.reply ||
      payload.message ||
      payload.error ||
      (response.status === 401
        ? 'Your session could not be verified. Please sign in again.'
        : 'Support is temporarily unavailable. Please try again.');
    throw new SupportApiError(message, response.status);
  }

  if (typeof payload.reply !== 'string' || typeof payload.success !== 'boolean') {
    throw new SupportApiError('Support returned an unexpected response.', 502);
  }

  return payload as SupportResponse;
}
