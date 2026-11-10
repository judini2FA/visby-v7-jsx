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
  { title: 'Check its history', caption: 'Open an item to see its Tally: a list of every owner it has ever had. The first name is the original minter, the brand that created it.' },
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
      { title: 'The brand creates it', body: 'If a brand like Nike sold an item through Visby, the brand would create the Tally. That makes it the original minter: the one that first created it, and the first name on the list.' },
      { title: 'It remembers every owner', body: 'Each time the item is sold, the new owner is added to the list. Old owners stay on it, so the history only grows.' },
      { title: 'The list is the proof', body: 'Owners and authenticity are one thing here. If the brand is first and every owner after is on the list in order, the item has a clear path from the brand to you.' },
    ],
    curious: "Underneath, a Tally is an NFT: a digital certificate stored on a blockchain, which is a record book copied across many computers so it is very hard to rewrite. The certificate holds the item's name, serial number and first owner. When the item sells, Visby moves the certificate to the new owner and the move is added to its history. Anyone can look up an item's history, but only the current owner can see its serial number.",
  },
  {
    id: 'pay',
    nav: 'Visby Pay',
    eyebrow: 'Visby Pay',
    title: 'How Visby Pay works',
    intro: 'A checkout button any online store can add to its own website. Shoppers get the item and its Tally.',
    steps: [
      { title: 'A store adds the button', body: 'The store puts VisbyPay right under its Add to Bag button, so shoppers can pick it without leaving the page.' },
      { title: 'It shows up at checkout too', body: 'On the bag page it sits under the Checkout button, next to other ways to pay like PayPal.' },
      { title: 'You pay on a Visby page', body: 'A secure Visby checkout opens. Sign in with an email code, pay with your card, and you are done. No password to remember.' },
      { title: 'You get the item and its Tally', body: 'The store ships your item, and your Tally is created at the same moment with the store as the original minter. The store is told the sale went through and pays Visby 3.5% per sale.' },
    ],
    curious: "The store's website asks Visby to open a checkout for one order and gets back a secure link. The shopper pays on that Visby page. When the payment clears, Visby creates the Tally in the shopper's name and sends the store a secure confirmation of the sale, so the store knows it is real. The store never has to handle crypto or build its own Tally system.",
  },
  {
    id: 'money',
    nav: 'Money',
    eyebrow: 'The money',
    title: 'How the money works',
    intro: 'You can buy and sell on Visby without ever touching crypto.',
    steps: [
      { title: 'Buyers pay with a card', body: 'You pay the listed price. Shipping is free. If you like crypto, you can pay with that instead.' },
      { title: 'Visby holds it until delivery', body: 'Your payment is held while the item is on its way. The seller is paid once the item is confirmed delivered, usually when you tap Confirm delivery.' },
      { title: 'Sellers choose how to get paid', body: 'Sellers pick a bank account or digital dollars. Visby takes a 9% fee from the sale. The buyer never pays extra.' },
    ],
    curious: "A payment company handles your card the way any online store does. Visby holds the money until delivery is confirmed, either when the buyer taps Confirm delivery or when the carrier's tracking says it arrived. Then Visby sends the seller their share. Sellers can be paid into a bank account or in USDC, a digital dollar designed to stay worth one US dollar. Payouts are also checked against government lists of people and groups that money cannot be sent to.",
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
    curious: "Reselling uses the same Tally, so nothing is created twice. When the sale finishes, the certificate moves to the buyer's Visby account and a new line is added to the history. The buyer's account is created for them automatically when they sign up, so there is nothing to set up.",
  },
];

export const FOOTER = {
  note: 'Screens show example items and prices.',
  noPartner: "The store pages above are real websites with a Pay with Visby button added by us to show how it could look. Nike, Rolex, Apple, Kay and the other brands shown are not Visby partners. Their names, logos and photos belong to them.",
  cta: 'Join the Prelaunch',
  back: 'Back to all links',
  curiousLabel: 'Curious how it works underneath?',
};
