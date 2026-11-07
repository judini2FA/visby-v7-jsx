import { describe, expect, it } from 'vitest';
import { classifyUa, cleanLinkedIn, inviteTokenFromUrl, isCampaign, nextVisitorState, normalizeProvider, vendorAllowed } from './links-hub';
import { HUB_LINK_IDS, visibleSections } from './links-config';

describe('nextVisitorState', () => {
  it('links an anonymous visitor', () => {
    expect(nextVisitorState({ contactId: null, status: 'returning' }, { contactId: 'a', status: 'provider_match' })).toEqual({ contactId: 'a', status: 'provider_match' });
  });
  it('upgrades but never downgrades evidence for the same contact', () => {
    expect(nextVisitorState({ contactId: 'a', status: 'authenticated' }, { contactId: 'a', status: 'known_contact' }).status).toBe('authenticated');
    expect(nextVisitorState({ contactId: 'a', status: 'known_contact' }, { contactId: 'a', status: 'authenticated' }).status).toBe('authenticated');
  });
  it('flags conflicts instead of re-pointing', () => {
    expect(nextVisitorState({ contactId: 'a', status: 'authenticated' }, { contactId: 'b', status: 'authenticated' })).toEqual({ contactId: 'a', status: 'conflict' });
  });
});

describe('normalizeProvider', () => {
  it('maps RB2B/Warmly documented keys', () => {
    const id = normalizeProvider({ 'Business Email': ' Jo@Acme.com ', 'First Name': 'Jo', 'Last Name': 'Lee', 'Company Name': 'Acme', 'LinkedIn URL': 'linkedin.com/in/jolee/', 'Captured URL': 'https://visby.me/links' });
    expect(id).toMatchObject({ email: 'jo@acme.com', name: 'Jo Lee', company: 'Acme', linkedin: 'https://www.linkedin.com/in/jolee', capturedUrl: 'https://visby.me/links' });
  });
  it('rejects junk', () => {
    expect(normalizeProvider({ 'Business Email': 'nope' }).email).toBeNull();
    expect(cleanLinkedIn('https://evil.com/in/x')).toBeNull();
  });
});

describe('inputs and consent', () => {
  it('validates campaign + invite token', () => {
    expect(isCampaign('demo-day')).toBe(true);
    expect(isCampaign('Demo Day')).toBe(false);
    expect(inviteTokenFromUrl('https://visby.me/links?i=AAAAAAAAAAAAAAAAAAAAAA')).toBe('AAAAAAAAAAAAAAAAAAAAAA');
    expect(inviteTokenFromUrl('https://visby.me/links?i=short')).toBeNull();
  });
  it('honors GPC, DNT and opt-in', () => {
    expect(vendorAllowed({ gpc: true, dnt: false, choice: 'accepted', mode: 'notice' })).toBe(false);
    expect(vendorAllowed({ gpc: false, dnt: true, choice: null, mode: 'notice' })).toBe(false);
    expect(vendorAllowed({ gpc: false, dnt: false, choice: null, mode: 'notice' })).toBe(true);
    expect(vendorAllowed({ gpc: false, dnt: false, choice: null, mode: 'opt_in' })).toBe(false);
    expect(vendorAllowed({ gpc: false, dnt: false, choice: 'accepted', mode: 'opt_in' })).toBe(true);
  });
  it('classifies UA', () => {
    expect(classifyUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile Safari/604.1')).toEqual({ device: 'mobile', browser: 'safari' });
    expect(classifyUa('Googlebot/2.1').browser).toBe('bot');
  });
});

describe('links config', () => {
  it('points at the existing prelaunch routes', () => {
    const all = visibleSections().flatMap(s => s.links);
    expect(all.find(l => l.id === 'prelaunch')?.href).toBe('/prelaunch');
    expect(all.find(l => l.id === 'investor-inquiry')?.href).toBe('/prelaunch/investors');
    expect(HUB_LINK_IDS.has('business-plan')).toBe(true);
  });
});
