import { LandingExperience } from '@/components/LandingExperience';
import { WORK_HISTORY } from '@/fixture/Work.fixture';

/**
 * Shared canvas shell for `/`, `/work`, and `/work/[slug]` (KTD1). Mounting
 * `LandingExperience` here — once, above all three routes — means soft navigation between
 * a slug and the shell never remounts the canvas (camera/focus state survives).
 */
export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LandingExperience works={WORK_HISTORY} />
      {children}
    </>
  );
}
