import { redirect } from 'next/navigation';

// Search merged into the homepage — /marketplace now lives at /.
export default function MarketplacePage() {
  redirect('/');
}
