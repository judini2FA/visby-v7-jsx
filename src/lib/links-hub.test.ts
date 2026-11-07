import { describe, expect, it } from 'vitest';
import { classifyUa, cleanEmail, isCampaign, isInviteToken, nextVisitorState } from './links-hub';
import { GATED_LINKS, HUB_LINK_IDS, visibleSections } from './links-config';

describe('nextVisitorState', () => {
  it('links an anonymous visitor', () => {
    expect(nextVisitorState({ contactId: null, status: 'returning' }, { contactId: 'a', status: 'self_reported' })).toEqual({ contactId: 'a', status: 'self_reported' });
  });
  it('upgrades but never downgrades evidence for the same contact', () => {
    expect(nextVisitorState({ contactId: 'a', status: 'known_contact' }, { contactId: 'a', status: 'self_reported' }).status).toBe('known_contact');
    expect(nextVisitorState({ contactId: 'a', status: 'self_reported' }, { contactId: 'a', status: 'known_contact' }).status).toBe('known_contact');
  });
  it('flags conflicts instead of re-pointing', () => {
    expect(nextVisitorState({ contactId: 'a', status: 'self_reported' }, { contactId: 'b', status: 'self_reported' })).toEqual({ contactId: 'a', status: 'conflict' });
  });
});

describe('inputs', () => {
  it('validates email, campaign and invite token', () => {
    expect(cleanEmail(' Jo@Acme.com ')).toBe('jo@acme.com');
    expect(cleanEmail('nope')).toBeNull();
    expect(isCampaign('demo-day')).toBe(true);
    expect(isCampaign('Demo Day')).toBe(false);
    expect(isInviteToken('AAAAAAAAAAAAAAAAAAAAAA')).toBe(true);
    expect(isInviteToken('short')).toBe(false);
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
  it('gates exactly the three documents', () => {
    expect([...GATED_LINKS.keys()].sort()).toEqual(['business-plan', 'financial-projections', 'pitch-deck']);
  });
});
