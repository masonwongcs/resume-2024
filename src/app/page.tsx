import styles from './page.module.scss';

import { Background, Blob } from '@/components/Background';
import { FlyoutCSR, InfiniteCanvasCSR } from '@/components/ClientDynamicComponent';
import { Header } from '@/components/Header';
import { Loader } from '@/components/Loader';
import { WORK_HISTORY } from '@/fixture/Work.fixture';
import { calculateYearDifference } from '@/utils/calculateYearDifference';

const years = calculateYearDifference('2017-01-01');

export default function Work() {
  return (
    <>
      <Loader />
      <Background />
      <Header />
      <main className={styles.main}>
        <section className="sr-only">
          <h1>Mason Wong — Front-End Engineer in Singapore</h1>
          <p>
            I&apos;m Mason Wong (masonwongcs), a front-end engineer based in Singapore with over {years} years of
            experience specializing in UI and UX design for web and mobile applications, with a background as a
            self-taught graphic and UI designer.
          </p>
          <p>
            I build interfaces with React, Next.js, TypeScript and modern web technologies, and care deeply about
            motion, interaction and visual polish.
          </p>
          <ul>
            <li>
              <a href="https://github.com/masonwongcs" rel="me">
                GitHub
              </a>
            </li>
            <li>
              <a href="https://www.linkedin.com/in/masonwongcs/" rel="me">
                LinkedIn
              </a>
            </li>
            <li>
              <a href="mailto:hello@masonwongcs.com">Email</a>
            </li>
          </ul>
        </section>
        {/*<InfiniteCanvas works={WORK_HISTORY}/>*/}
        {/*<Flyout/>*/}
        <InfiniteCanvasCSR works={WORK_HISTORY} />
        <FlyoutCSR />
        <Blob />
      </main>
    </>
  );
}
