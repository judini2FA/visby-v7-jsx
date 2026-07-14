'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { trpc } from '@/lib/trpc/client';
import { t, S, T, btn, input, sectionLabel, surface, avatar } from '@/lib/ui';

// Required step — mirrors src/app/profile/page.tsx's EditProfileForm (same upsertProfile /
// usernameAvailable / upload-image calls) so behavior stays identical between onboarding and
// later profile edits. Username is required here because it's the field OnboardingGate checks
// to decide whether a returning signed-in user still needs this wizard.
export function StepProfile({ wallet, onNext }: { wallet: string; onNext: () => void }) {
  const { getAccessToken } = usePrivy();
  const { data: existing } = trpc.profiles.getProfile.useQuery({ wallet }, { enabled: !!wallet });
  const utils = trpc.useUtils();
  const upsert = trpc.profiles.upsertProfile.useMutation({ onSuccess: () => utils.profiles.getProfile.invalidate() });

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  // Hydrate once — a later refetch (e.g. after saving) must not clobber in-progress edits.
  const hydrated = useRef(false);
  useEffect(() => {
    if (existing && !hydrated.current) {
      hydrated.current = true;
      setName(existing.display_name ?? '');
      setUsername((existing as any).username ?? '');
      setBio(existing.bio ?? '');
      setAvatarUrl(existing.avatar_url ?? '');
    }
  }, [existing]);

  const [debouncedUsername, setDebouncedUsername] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedUsername(username.trim().toLowerCase()), 400);
    return () => clearTimeout(id);
  }, [username]);
  const existingUsername = ((existing as any)?.username ?? '') as string;
  const usernameFormatOk = /^[a-z0-9_]{3,20}$/.test(debouncedUsername);
  const usernameUnchanged = debouncedUsername === existingUsername.toLowerCase();
  const checkUsername = trpc.profiles.usernameAvailable.useQuery(
    { username: debouncedUsername, wallet },
    { enabled: debouncedUsername.length > 0 && usernameFormatOk && !usernameUnchanged, retry: false },
  );

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setUploadErr('Image must be under 8MB.'); return; }
    setUploading(true); setUploadErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = await getAccessToken();
      const res = await fetch('/api/upload-image', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
      const json = await res.json();
      if (res.ok && json.url) setAvatarUrl(json.url);
      else setUploadErr(json.error || 'Upload failed — try again.');
    } catch {
      setUploadErr('Upload failed — check your connection.');
    } finally {
      setUploading(false);
    }
  }

  const usernameInput = username.trim().toLowerCase();
  const usernameTouched = usernameInput !== existingUsername.toLowerCase();
  const usernameBlocksSave =
    usernameInput.length === 0 ||
    !usernameFormatOk ||
    (usernameTouched && !usernameUnchanged && checkUsername.data != null && !checkUsername.data.available);
  const nameBlocksSave = name.trim().length === 0;
  const canContinue = !!wallet && !nameBlocksSave && !usernameBlocksSave && !upsert.isPending;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue) return;
    try {
      await upsert.mutateAsync({
        wallet,
        display_name: name.trim(),
        username: usernameInput,
        bio: bio.trim() || undefined,
        avatar_url: avatarUrl || undefined,
      });
      onNext();
    } catch {
      // upsert.isError renders below
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div>
        <div style={{ ...t('title'), color: T.textStrong }}>Set up your profile</div>
        <div style={{ ...t('body'), color: T.textMuted, marginTop: S[2] }}>
          This is how buyers and sellers will see you on Visby.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
        <label title="Upload a profile picture" style={{ ...avatar('lg'), position: 'relative', cursor: uploading ? 'wait' : 'pointer', background: avatarUrl ? 'var(--surface-bg)' : T.gradBrand }}>
          {avatarUrl
            ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 22 }}>{(name || wallet).slice(0, 2).toUpperCase()}</span>}
          <span aria-hidden style={{ position: 'absolute', right: -1, bottom: -1, width: 20, height: 20, borderRadius: '50%', background: 'var(--text-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px var(--glass-bg)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--bg-0)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
            </svg>
          </span>
          <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'inherit' }} />
        </label>
        <div style={{ ...t('meta'), color: T.textMuted }}>
          {uploading ? 'Uploading photo…' : 'Optional — tap to add a photo'}
        </div>
      </div>
      {uploadErr && (
        <div style={{ ...surface({ pad: '10px 14px' }), ...t('meta'), color: 'var(--danger)', borderColor: 'var(--danger-soft)' }}>{uploadErr}</div>
      )}

      <div>
        <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Display Name</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. sneaker.vault" maxLength={40} style={input()} />
      </div>

      <div>
        <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Username</div>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 15, pointerEvents: 'none' }}>@</span>
          <input
            value={username}
            onChange={e => setUsername(e.target.value.replace(/\s/g, '').slice(0, 20))}
            placeholder="e.g. sneaker_vault"
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={{ ...input(), paddingLeft: 28 }}
          />
        </div>
        <div style={{ ...t('meta'), marginTop: S[1], color: usernameBlocksSave && usernameInput.length > 0 ? 'var(--danger)' : (usernameTouched && checkUsername.data?.available ? 'var(--ok)' : 'var(--text-muted)') }}>
          {usernameInput.length === 0
            ? '3-20 characters: letters, numbers, underscore'
            : !usernameFormatOk
              ? '3-20 characters: letters, numbers, underscore'
              : usernameUnchanged
                ? 'This is your current username'
                : checkUsername.isFetching
                  ? 'Checking availability…'
                  : checkUsername.data
                    ? (checkUsername.data.available ? 'Available' : (checkUsername.data.reason ?? 'That username is taken.'))
                    : 'Lets people find and pay you by @handle'}
        </div>
      </div>

      <div>
        <div style={{ ...sectionLabel(), marginBottom: S[2] }}>Bio (optional)</div>
        <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="What do you sell?" maxLength={200} rows={2}
          style={{ ...input(), resize: 'vertical', lineHeight: 1.6 }} />
      </div>

      {upsert.isError && (
        <div style={{ ...surface({ pad: '10px 14px' }), ...t('meta'), color: 'var(--danger)', borderColor: 'var(--danger-soft)' }}>
          {upsert.error?.data?.code === 'CONFLICT' ? upsert.error.message : 'Could not save — check your connection and try again.'}
        </div>
      )}

      <button type="submit" disabled={!canContinue} style={{ ...btn('primary', { full: true }), opacity: canContinue ? 1 : 0.5, cursor: canContinue ? 'pointer' : 'not-allowed' }}>
        {upsert.isPending ? 'Saving…' : 'Continue'}
      </button>
    </form>
  );
}
