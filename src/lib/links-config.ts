// Destinations shown on visby.me/links (the QR hub). Edit this file to change what the QR code opens —
// the QR always encodes https://visby.me/links, so nothing here requires a new code.
//
// href: absolute URL (Google Drive / DocSend / Dropbox share link) or a path. Files dropped in
// public/docs/ are served at /docs/<name> and are PUBLIC to anyone with the link. id is what analytics are
// keyed on: keep it stable. gated: the visitor must give an email (and say if they're a student) first;
// with href: null the request is still recorded and they're told a copy is on its way.
// storage://<bucket>/<path> points at a PRIVATE Supabase Storage file; each request gets a 1-hour signed
// link, so the file can't be fetched without going through the email gate. To swap a document, upload the
// new file to the same path (or change the path here).

export type HubLink = {
  id: string;
  label: string;
  description?: string;
  href: string | null;
  visible: boolean;
  gated?: boolean;
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
      { id: 'business-plan', label: 'Get free copy of Business Plan', href: 'storage://investor-docs/Visby-Business-Plan.docx', visible: true, gated: true },
      { id: 'financial-projections', label: 'Get free copy of Financial Projections', href: 'storage://investor-docs/Visby-Financial-Projections.xlsx', visible: true, gated: true },
      { id: 'pitch-deck', label: 'Get free copy of Pitch Deck', href: 'storage://investor-docs/Visby-Pitch-Deck.pdf', visible: true, gated: true },
    ],
  },
];

export function visibleSections(sections: HubSection[] = HUB_SECTIONS): HubSection[] {
  return sections
    .map(s => ({ ...s, links: s.links.filter(l => l.visible) }))
    .filter(s => s.links.length > 0);
}

export const HUB_LINK_IDS: ReadonlySet<string> = new Set(HUB_SECTIONS.flatMap(s => s.links.map(l => l.id)));

export const GATED_LINKS: ReadonlyMap<string, HubLink> = new Map(
  HUB_SECTIONS.flatMap(s => s.links).filter(l => l.gated && l.visible).map(l => [l.id, l]),
);

export const HUB_URL = 'https://visby.me/links';
