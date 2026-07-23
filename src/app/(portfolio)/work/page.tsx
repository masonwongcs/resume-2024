import { PortfolioHubSeo } from '@/components/PortfolioSeo/PortfolioSeo';

// Bare `/work` is the same home canvas shell as `/`, unfocused (R10) — the shell
// lives in the `(portfolio)` layout; this page adds the crawlable project index.
export default function WorkIndexPage() {
  return <PortfolioHubSeo />;
}
