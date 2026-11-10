// Every sentence on the demo page lives here so one test can check the wording. Aimed at a 15-year-old who
// knows nothing about this: short sentences, everyday words, no tech detail beyond "NFT" and "blockchain".

export const HEADER = {
  title: 'How Visby works',
  subtitle: "Buy and sell things that can prove they're real.",
};

export const WALKTHROUGH_INTRO = {
  eyebrow: 'Start to finish',
  title: 'Follow one item from first look to resale',
  hint: 'Tap Next to move through the steps.',
};

export const WALKTHROUGH: { title: string; caption: string }[] = [
  { title: 'Find something you like', caption: 'Browse items from real people and brands. Every item comes with its own history.' },
  { title: 'Check its history', caption: 'Open an item to see its Tally: a list of every owner it has ever had. Badges show if it has been checked.' },
  { title: 'Pay your way', caption: "Pay with a card like in any online store. Shipping is free. You don't need to know anything about crypto." },
  { title: 'Visby holds your payment', caption: "While your item is on its way, Visby holds your money. The seller doesn't get it yet." },
  { title: 'Say it arrived', caption: 'Tap Confirm delivery. The seller gets paid, and the Tally moves to you, so you are the new owner on record.' },
  { title: 'Sell it later', caption: 'Done with it? List it on Visby. The next buyer sees the whole history, including you.' },
];

export type SectionStep = { title: string; body: string };
export type Section = { id: string; nav: string; eyebrow: string; title: string; intro: string; steps: SectionStep[]; curious: string };

export const SECTIONS: Section[] = [
  {
    id: 'tally',
    nav: 'Tally',
    eyebrow: 'Tally',
    title: "A Tally is your item's history",
    intro: 'Think of it as a receipt that never gets lost and travels with the item wherever it goes.',
    steps: [
      { title: 'Every item gets one', body: "A Tally is created for each item. It holds the item's name and serial number. Only the owner can see the serial number." },
      { title: 'It remembers every owner', body: 'Each time the item is sold, the new owner is added to the list. Old owners stay on it, so the history only grows.' },
      { title: 'Badges show who checked it', body: 'Authenticated means a Visby reviewer checked the item. Brand verified means the serial number matches the numbers the brand registered with Visby.' },
    ],
    curious: 'Each Tally is an NFT, a digital record built with blockchain technology. That is what lets it move from one owner to the next.',
  },
  {
    id: 'money',
    nav: 'Money',
    eyebrow: 'The money',
    title: 'How the money works',
    intro: 'You can buy and sell on Visby without ever touching crypto.',
    steps: [
      { title: 'Buyers pay with a card', body: 'You pay the listed price. Shipping is free. If you like crypto, you can pay with that instead.' },
      { title: 'Visby holds it until delivery', body: 'Your payment is held while the item is on its way. The seller only gets paid after you confirm it arrived.' },
      { title: 'Sellers choose how to get paid', body: 'Sellers pick a bank account or digital dollars. Visby takes a 9% fee from the sale. The buyer never pays extra.' },
    ],
    curious: 'Crypto is digital money that runs on blockchain technology. Visby handles the technical parts, so you never have to.',
  },
  {
    id: 'resale',
    nav: 'Resale',
    eyebrow: 'Resale',
    title: 'How resale works',
    intro: 'Bought something? You can sell it again.',
    steps: [
      { title: 'List it in a few taps', body: "Pick the item you own and set a price. You see the fee and what you'll receive before you post it." },
      { title: 'The history stays with it', body: 'Buyers see every earlier owner. When it sells, you are on the list too.' },
      { title: 'Paid after delivery', body: 'When the buyer confirms it arrived, you get your money minus the 9% fee. The Tally moves to the buyer.' },
    ],
    curious: "When an item sells, its NFT moves to the buyer's Visby account. Nobody has to send anything by hand.",
  },
  {
    id: 'pay',
    nav: 'Visby Pay',
    eyebrow: 'Visby Pay',
    title: 'How Visby Pay works',
    intro: "A checkout button any online store can add to its own website. Shoppers get the item and its Tally.",
    steps: [
      { title: 'A store adds the button', body: "The store puts Pay with Visby next to its normal buy button. It doesn't have to build anything itself." },
      { title: 'You pay on a Visby page', body: 'A secure Visby checkout opens. Sign in with an email code, pay with your card, and you are done. No password to remember.' },
      { title: 'You get the item and its Tally', body: 'The store ships your item, and your Tally is created at the same moment. The store is told the sale went through. It pays Visby 3.5% per sale.' },
    ],
    curious: 'Visby Pay uses the same NFT and blockchain technology as the Visby marketplace, so items sold in any store get the same kind of history.',
  },
];

export const FOOTER = {
  note: 'Screens show example items and prices.',
  cta: 'Join the Prelaunch',
  back: 'Back to all links',
  curiousLabel: 'Curious how it works underneath?',
};
