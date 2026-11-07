// Destinations shown on visby.me/links (the QR hub). Edit this file to change what the QR code opens —
// the QR always encodes https://visby.me/links, so nothing here requires a new code.
//
// href: absolute URL (Google Drive / DocSend / Dropbox share link) or a path. Files dropped in
// public/docs/ are served at /docs/<name> and are PUBLIC to anyone with the link. href: null renders the
// row as "Coming soon" instead of a dead link. id is what click analytics are keyed on: keep it stable.

export type HubLink = {
  id: string;
  label: string;
  description?: string;
  href: string | null;
  visible: boolean;
};

export type HubSection = { id: string; title?: string; links: HubLink[] };

export const HUB_SECTIONS: HubSection[] = [
  {
    id: 'primary',
    links: [
      { id: 'demo', label: 'Visby Demo', description: 'See how Visby works, start to finish', href: '/links/demo', visible: true },
      { id: 'prelaunch', label: 'Join the Prelaunch', description: 'Early access to exclusive product drops', href: '/prelaunch', visible: true },
      { id: 'investor-inquiry', label: 'Questions about investing?', description: 'Send a message to the Visby team', href: '/prelaunch/investors', visible: true },
    ],
  },
  {
    id: 'investor-docs',
    title: 'Investor Documents',
    links: [
      { id: 'business-plan', label: 'Get free copy of Business Plan', href: null, visible: true },
      { id: 'financial-projections', label: 'Get free copy of Financial Projections', href: null, visible: true },
      { id: 'pitch-deck', label: 'Get free copy of Pitch Deck', href: null, visible: true },
    ],
  },
];

export function visibleSections(sections: HubSection[] = HUB_SECTIONS): HubSection[] {
  return sections
    .map(s => ({ ...s, links: s.links.filter(l => l.visible) }))
    .filter(s => s.links.length > 0);
}

export const HUB_LINK_IDS: ReadonlySet<string> = new Set(HUB_SECTIONS.flatMap(s => s.links.map(l => l.id)));

export const HUB_URL = 'https://visby.me/links';
