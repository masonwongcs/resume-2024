import { LandingExperience } from '@/components/LandingExperience';
import { WORK_HISTORY } from '@/fixture/Work.fixture';

export default function Work() {
  return <LandingExperience works={WORK_HISTORY} />;
}
