import { PortfolioHubSeo } from '@/components/PortfolioSeo/PortfolioSeo';

// The home canvas shell itself lives in the `(portfolio)` layout — this page adds
// crawlable intro + project links so soft nav never remounts the shell.
export default function HomePage() {
  return <PortfolioHubSeo />;
}
