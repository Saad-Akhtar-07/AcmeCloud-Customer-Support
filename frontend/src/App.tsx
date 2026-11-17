import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { appConfig } from './lib/config';
import { sendSupportMessage, SupportApiError } from './lib/support-api';
import { supabase } from './lib/supabase';
import type { ChatMessage, StoredConversation, SupportResponse } from './types';

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Hi! How can we help today? Describe what happened and include any error message you saw.',
  createdAt: new Date().toISOString(),
};

function createConversationId() {
  return 'chat_' + crypto.randomUUID().replaceAll('-', '_');
}

function storageKey(userId: string) {
  return 'acmecloud-support-conversation:' + userId;
}

function loadConversation(userId: string): StoredConversation {
  const fallback = {
    conversationId: createConversationId(),
    messages: [welcomeMessage],
  };

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return fallback;
    const stored = JSON.parse(raw) as StoredConversation;
    if (!stored.conversationId || !Array.isArray(stored.messages)) return fallback;
    return stored;
  } catch {
    return fallback;
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function statusTone(status?: string) {
  if (!status) return 'neutral';
  if (status === 'Completed') return 'success';
  if (status === 'Waiting for Approval' || status === 'Escalated') return 'warning';
  if (status === 'Failed' || status === 'Customer Not Found') return 'danger';
  return 'info';
}

function statusLabel(status?: string) {
  if (!status) return '';
  const labels: Record<string, string> = {
    'Not Started': 'Received',
    Investigating: 'In progress',
    'Waiting for Tool': 'In progress',
    'Waiting for Customer': 'Waiting for your reply',
    'Waiting for Approval': 'Under review',
    Completed: 'Resolved',
    Failed: 'Needs attention',
    Escalated: 'Specialist review',
    'Customer Not Found': 'Account not found',
  };
  return labels[status] || status;
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M9.1 23.5h14.3a5.1 5.1 0 0 0 .9-10.1A8.5 8.5 0 0 0 8.2 11a6.3 6.3 0 0 0 .9 12.5Z"
          fill="currentColor"
          opacity=".16"
        />
        <path
          d="M8.7 23h14.7a4.7 4.7 0 0 0 .4-9.4A8 8 0 0 0 8.4 11a5.9 5.9 0 0 0 .3 12Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M12 18h8M16 14v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.8 2.9 8 7 10 4.1-2 7-5.2 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m9.2 12 1.8 1.8 3.9-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m4 4 17 8-17 8 3-8-3-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConfigScreen() {
  return (
    <main className="center-page">
      <section className="setup-card">
        <BrandMark />
        <p className="eyebrow">Configuration needed</p>
        <h1>Connect the support portal</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env.local</code> and provide the
          Supabase project URL, anon key, and n8n support webhook.
        </p>
        <div className="missing-list">
          {appConfig.missing.map((key) => (
            <code key={key}>{key}</code>
          ))}
        </div>
      </section>
    </main>
  );
}

function LoginScreen({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    setSubmitting(false);
    if (authError || !data.session) {
      setError('Email or password is incorrect. Please try again.');
      return;
    }
    onSignedIn(data.session);
  }

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="brand brand-light">
          <BrandMark />
          <span>AcmeCloud</span>
        </div>
        <div className="intro-copy">
          <span className="secure-pill"><ShieldIcon /> AcmeCloud Support</span>
          <h1>Get help with your AcmeCloud account.</h1>
          <p>
            Sign in to start a support conversation or continue where you left off.
          </p>
        </div>
        <p className="intro-footnote">Never share your password or verification codes in a support message.</p>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="mobile-brand brand">
            <BrandMark />
            <span>AcmeCloud</span>
          </div>
          <p className="eyebrow">Customer portal</p>
          <h2>Welcome back</h2>
          <p className="form-subtitle">Use the email address connected to your AcmeCloud account.</p>

          <label>
            <span>Email address</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? <><span className="spinner" /> Signing in…</> : 'Sign in'}
          </button>

          <p className="account-note">
            Don’t have access? Contact your AcmeCloud administrator.
          </p>
        </form>
      </section>
    </main>
  );
}

function TicketSummary({ result }: { result: SupportResponse }) {
  if (!result.ticket_id) return null;
  return (
    <div className="ticket-card">
      <div className="ticket-topline">
        <span>Support case</span>
        <span className={'status-badge ' + statusTone(result.status)}>{statusLabel(result.status)}</span>
      </div>
      <strong>Ticket #{result.ticket_id}</strong>
      <div className="ticket-meta">
        {result.issue_category && <span>{result.issue_category}</span>}
        {result.issue_severity && <span>Priority: {result.issue_severity}</span>}
        {result.requires_human_approval && <span>Specialist review required</span>}
      </div>
    </div>
  );
}

function SupportPortal({ session }: { session: Session }) {
  const userId = session.user.id;
  const displayName =
    String(session.user.user_metadata.full_name || '').trim() ||
    session.user.email?.split('@')[0] ||
    'Customer';
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = loadConversation(userId);
    setConversationId(stored.conversationId);
    setMessages(stored.messages.length ? stored.messages : [welcomeMessage]);
    setHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (!hydrated || !conversationId) return;
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify({ conversationId, messages } satisfies StoredConversation),
    );
  }, [conversationId, hydrated, messages, userId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const latestResult = useMemo(
    () => [...messages].reverse().find((message) => message.result)?.result,
    [messages],
  );

  function startNewConversation() {
    setConversationId(createConversationId());
    setMessages([{ ...welcomeMessage, id: crypto.randomUUID(), createdAt: new Date().toISOString() }]);
    setDraft('');
  }

  async function handleSend() {
    const message = draft.trim();
    if (!message || sending || !supabase) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setSending(true);

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        throw new SupportApiError('Your session expired. Please sign in again.', 401);
      }

      const result = await sendSupportMessage({
        accessToken: data.session.access_token,
        conversationId,
        message,
      });

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.reply,
          createdAt: new Date().toISOString(),
          result,
        },
      ]);
    } catch (error) {
      const apiError = error instanceof SupportApiError ? error : null;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: apiError?.message || 'I could not reach support. Please try again in a moment.',
          createdAt: new Date().toISOString(),
          failed: true,
        },
      ]);
      if (apiError?.status === 401) await supabase.auth.signOut();
    } finally {
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <div className="brand">
          <BrandMark />
          <span>AcmeCloud</span>
          <span className="brand-divider" />
          <span className="brand-section">Support</span>
        </div>
        <div className="header-actions">
          <div className="header-identity">
            <span className="avatar">{initials(displayName) || 'AC'}</span>
            <span>
              <strong>{displayName}</strong>
              <small>{session.user.email}</small>
            </span>
          </div>
          <button className="icon-button" onClick={signOut} title="Sign out" aria-label="Sign out">
            <LogoutIcon />
          </button>
        </div>
      </header>

      <div className="portal-body">
        <aside className="support-sidebar">
          <div>
            <p className="eyebrow">Customer support</p>
            <h2>What can we help with?</h2>
            <p className="sidebar-copy">
              Tell us what happened and what you expected. Include any error message you saw.
            </p>
          </div>

          <button className="new-chat-button" onClick={startNewConversation}>
            <PlusIcon />
            New conversation
          </button>

          <div className="sidebar-panel">
            <span className="panel-icon"><ShieldIcon /></span>
            <div>
              <strong>Protect your account</strong>
              <p>Never share passwords, one-time codes, card numbers, API keys, or recovery codes.</p>
            </div>
          </div>
        </aside>

        <section className="chat-card">
          <header className="chat-header">
            <div className="agent-identity">
              <div className="agent-avatar"><BrandMark /></div>
              <div>
                <h1>AcmeCloud Support</h1>
                <p><span className="presence-dot" /> Online</p>
              </div>
            </div>
            {latestResult && (
              <span className={'status-badge ' + statusTone(latestResult.status)}>
                {statusLabel(latestResult.status)}
              </span>
            )}
          </header>

          <div className="message-list" aria-live="polite">
            {messages.map((message) => (
              <article className={'message-row ' + message.role} key={message.id}>
                {message.role === 'assistant' && (
                  <div className="message-avatar"><BrandMark /></div>
                )}
                <div className="message-stack">
                  <div className={'message-bubble' + (message.failed ? ' failed' : '')}>
                    <p>{message.content}</p>
                  </div>
                  <span className="message-time">
                    {message.role === 'assistant' ? 'AcmeCloud Support' : 'You'} · {formatTime(message.createdAt)}
                  </span>
                  {(message.result?.missing_information?.length ?? 0) > 0 && !message.result?.ready_for_ticket && (
                    <div className="missing-details">
                      {message.result?.missing_information?.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  )}
                  {message.result && <TicketSummary result={message.result} />}
                </div>
              </article>
            ))}

            {sending && (
              <article className="message-row assistant">
                <div className="message-avatar"><BrandMark /></div>
                <div className="message-stack">
                  <div className="message-bubble typing">
                    <span /><span /><span />
                    <em>Reviewing your request…</em>
                  </div>
                </div>
              </article>
            )}
            <div ref={messageEndRef} />
          </div>

          <footer className="composer-area">
            <div className="composer">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 4000))}
                onKeyDown={handleComposerKeyDown}
                placeholder="Type your message…"
                rows={1}
                disabled={sending}
                aria-label="Support message"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!draft.trim() || sending}
                aria-label="Send message"
              >
                <SendIcon />
              </button>
            </div>
            <div className="composer-note">
              <span>Enter to send · Shift + Enter for a new line</span>
              <span>{draft.length}/4000</span>
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!appConfig.isReady) return <ConfigScreen />;

  if (loading) {
    return (
      <main className="center-page">
        <div className="loading-mark"><BrandMark /><span className="spinner" /></div>
      </main>
    );
  }

  if (!session) return <LoginScreen onSignedIn={setSession} />;
  return <SupportPortal session={session} />;
}
