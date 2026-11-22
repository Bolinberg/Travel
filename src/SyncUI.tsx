import { useState } from 'react';
import type { Store } from './storage';
import type { SyncState } from './useSync';
import { createSpace, defaultServer, getSpace, inviteLink, normalizeServer, parseInvite, rotateKey, type SyncConfig } from './sync';

export { defaultServer };


/** 邀请链接指向的 App 地址：网页打开时用当前地址；本地文件打开时用服务器地址（服务器也托管 App） */
function appUrl(server: string): string {
  if (typeof location !== 'undefined' && location.protocol.startsWith('http')) return location.origin + location.pathname;
  return normalizeServer(server) + '/';
}

export function SyncBadge({ state, onClick }: { state: SyncState; onClick: () => void }) {
  if (state.kind === 'off') return null;
  const text =
    state.kind === 'syncing'
      ? '同步中…'
      : state.kind === 'ok'
        ? '已同步'
        : state.kind === 'offline'
          ? '离线'
          : '同步出错';
  return (
    <button className={`sync-badge s-${state.kind}`} onClick={onClick} title={'message' in state ? state.message : ''}>
      ☁️ {text}
    </button>
  );
}

const newCfg = (server: string, key: string, spaceId: string, spaceName: string, member: string): SyncConfig => ({
  server: normalizeServer(server),
  key,
  spaceId,
  spaceName,
  member,
  cursor: 0,
  meta: {},
});

/** 「设置」里的家庭同步卡片 */
export function SyncCard({
  cfg,
  state,
  setCfg,
  run,
  store,
}: {
  cfg: SyncConfig | null;
  state: SyncState;
  setCfg: (c: SyncConfig | null, initialMode?: 'merge' | 'replace') => void;
  run: (mode?: 'merge' | 'replace') => void;
  store: Store;
}) {
  const [server, setServer] = useState(cfg?.server ?? defaultServer());
  const [member, setMember] = useState(cfg?.member ?? '');
  const [spaceName, setSpaceName] = useState('我们家');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    if (!server.trim()) return alert('请先填写同步服务器地址');
    if (!member.trim()) return alert('请填写你的称呼，方便家人知道是谁改的');
    setBusy(true);
    try {
      const s = await createSpace(server, spaceName.trim() || '我们家');
      setCfg(newCfg(server, s.key, s.spaceId, s.name, member.trim()));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    const inv = parseInvite(invite.trim());
    if (!inv) return alert('邀请链接不完整，请复制完整的链接');
    if (!member.trim()) return alert('请填写你的称呼');
    await joinSpace(inv, member.trim(), store, setCfg, setBusy);
  };

  if (!cfg) {
    return (
      <section className="card form">
        <h2>邀请家人一起编辑</h2>
        <p className="muted small">
          创建一个家庭空间，把邀请链接发给家人。之后大家在各自的手机、电脑上看到和编辑的是同一份行程，几秒内同步，不用注册账号。
        </p>
        {defaultServer() ? (
          <details className="advanced">
            <summary className="muted small">高级：同步服务器</summary>
            <Field label="同步服务器地址">
              <input placeholder="https://你的服务器地址" value={server} onChange={(e) => setServer(e.target.value)} />
            </Field>
          </details>
        ) : (
          <Field label="同步服务器地址（需要先部署同步服务）">
            <input placeholder="https://你的服务器地址" value={server} onChange={(e) => setServer(e.target.value)} />
          </Field>
        )}
        <Field label="你的称呼">
          <input placeholder="如：爸爸 / 妈妈 / 小明" value={member} onChange={(e) => setMember(e.target.value)} />
        </Field>
        <div className="grid2">
          <Field label="家庭空间名称">
            <input value={spaceName} onChange={(e) => setSpaceName(e.target.value)} />
          </Field>
          <div className="field">
            <span className="muted small">&nbsp;</span>
            <button className="primary" disabled={busy} onClick={create}>
              {busy ? '创建中…' : '创建家庭空间'}
            </button>
          </div>
        </div>
        <p className="muted small">本机现有的 {store.trips.length} 个行程会上传到新空间。</p>
        <hr />
        <Field label="已有邀请链接？粘贴到这里加入">
          <input placeholder="https://…#join=…" value={invite} onChange={(e) => setInvite(e.target.value)} />
        </Field>
        <button disabled={busy || !invite.trim()} onClick={join}>加入家庭空间</button>
      </section>
    );
  }

  const link = inviteLink(appUrl(cfg.server), cfg);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('复制这个链接发给家人', link);
    }
  };

  return (
    <section className="card form">
      <h2>☁️ 家庭同步</h2>
      <p>
        已加入 <b>{cfg.spaceName}</b>，我是 <b>{cfg.member || '（未命名）'}</b>
      </p>
      <p className="muted small">
        服务器：{cfg.server}
        <br />
        状态：
        {state.kind === 'syncing'
          ? '同步中…'
          : state.kind === 'ok'
            ? state.at
              ? `已同步（${new Date(state.at).toLocaleTimeString()}）`
              : '等待同步'
            : 'message' in state
              ? state.message
              : ''}
        {state.kind === 'ok' && state.note && (
          <>
            <br />
            {state.note}
          </>
        )}
      </p>
      <Field label="邀请家人：把这个链接发给他们，在手机或电脑上打开即可加入">
        <input readOnly value={link} onFocus={(e) => e.target.select()} />
      </Field>
      <p className="muted small">⚠️ 拿到这个链接的人都能查看和修改你们的行程，只发给家人。如果不小心发错了，点「更换密钥」让旧链接失效。</p>
      <div className="row wrap">
        <button className="primary" onClick={copy}>{copied ? '已复制 ✓' : '复制邀请链接'}</button>
        <button onClick={() => run()}>立即同步</button>
        <button
          onClick={async () => {
            if (!confirm('更换密钥后，旧的邀请链接和其他已加入的设备都会失效，需要重新发链接给家人。继续？')) return;
            try {
              const key = await rotateKey(cfg);
              setCfg({ ...cfg, key });
            } catch (e) {
              alert(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          更换密钥
        </button>
        <button
          className="danger"
          onClick={() => confirm('退出家庭空间？本机的行程会保留，但不再与家人同步。') && setCfg(null)}
        >
          退出
        </button>
      </div>
    </section>
  );
}

async function joinSpace(
  inv: { key: string; server: string; space: string },
  member: string,
  store: Store,
  setCfg: (c: SyncConfig | null, initialMode?: 'merge' | 'replace') => void,
  setBusy: (b: boolean) => void,
) {
  setBusy(true);
  try {
    const s = await getSpace(inv.server, inv.key);
    let mode: 'merge' | 'replace' = 'merge';
    if (s.trips > 0 && store.trips.length > 0) {
      mode = confirm(
        `「${s.name}」里已有 ${s.trips} 个行程。\n\n` +
          `点「确定」：把本机的 ${store.trips.length} 个行程也上传，合在一起。\n` +
          '点「取消」：只使用家庭空间里的行程（本机原有行程会被替换，如需保留请先在设置里导出）。',
      )
        ? 'merge'
        : 'replace';
    }
    setCfg(newCfg(inv.server, inv.key, s.spaceId, s.name, member), mode); // 首轮同步按所选方式进行
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  } finally {
    setBusy(false);
  }
}

/** 打开邀请链接时弹出的加入提示 */
export function JoinPrompt({
  invite,
  store,
  setCfg,
  onDone,
}: {
  invite: { key: string; server: string; space: string };
  store: Store;
  setCfg: (c: SyncConfig | null, initialMode?: 'merge' | 'replace') => void;
  onDone: () => void;
}) {
  const [member, setMember] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="card form join">
      <h2>加入「{invite.space || '家庭空间'}」</h2>
      <p className="muted small">家人邀请你一起规划行程。加入后，这台设备上的行程会和大家保持同步。</p>
      <Field label="你的称呼">
        <input autoFocus placeholder="如：妈妈" value={member} onChange={(e) => setMember(e.target.value)} />
      </Field>
      <div className="row">
        <button
          className="primary"
          disabled={busy || !member.trim()}
          onClick={async () => {
            await joinSpace(invite, member.trim(), store, setCfg, setBusy);
            onDone();
          }}
        >
          {busy ? '加入中…' : '加入'}
        </button>
        <button onClick={onDone}>暂不加入</button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="muted small">{label}</span>
      {children}
    </label>
  );
}
