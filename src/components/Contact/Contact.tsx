import styles from './Contact.module.scss';

import cx from 'classnames';

import { GitHubCard } from '@/components/GitHubCard';
import { Sticker } from '@/components/Sticker';
import { backendStickers, devopsSticker, frontEndStickers, softSkillSticker } from '@/fixture/Info.fixture';

import QR from './qr.svg';

const Group = () => {
  return (
    <>
      <div className={styles.gridItem} />
      <div className={styles.gridItem} />
      <div className={styles.gridItem} />
      <div className={styles.gridItem} />
    </>
  );
};

const Contact = () => {
  return (
    <section className={styles.contact}>
      <div className={styles.gridWrapper}>
        <Group />
        <Group />

        <div className={styles.gridItem} />
        <div className={cx(styles.gridItem, styles.transparent)}>
          <div className={styles.innerGrid}>
            <div className={styles.innerGridItem}>
              <h2 className={styles.title}>skills</h2>
            </div>

            <div className={styles.innerGridItem}>
              <h3 className={styles.subtitle}>Front-end</h3>
              <p className={styles.description}>
                HTML, CSS, SCSS, JavaScript, Next.js, React.js, Three.js, PIXI.js, TypeScript, Responsive Design, State
                Management
              </p>
              <div className={styles.stickerWrapper}>
                {frontEndStickers.map(({ src, alt, startX, startY, transformEndX, transformEndY }, index) => (
                  <Sticker
                    key={src}
                    src={src}
                    alt={alt}
                    startX={startX}
                    startY={startY}
                    transformEndX={transformEndX}
                    transformEndY={transformEndY}
                  />
                ))}
              </div>
            </div>

            <div className={styles.innerGridItem}>
              <h3 className={styles.subtitle}>Back-end</h3>
              <p className={styles.description}>
                Node.js, Express.js, Bun.js, Deno.js, RESTful APIs, GraphQL, SQL, PostgreSQL
              </p>
              <div className={styles.stickerWrapper}>
                {backendStickers.map(({ src, alt, startX, startY, transformEndX, transformEndY }, index) => (
                  <Sticker
                    key={src}
                    src={src}
                    alt={alt}
                    startX={startX}
                    startY={startY}
                    transformEndX={transformEndX}
                    transformEndY={transformEndY}
                  />
                ))}
              </div>
            </div>

            <div className={styles.innerGridItem}>
              <h3 className={styles.subtitle}>DevOps</h3>
              <p className={styles.description}>
                CI/CD (Jenkins, GitHub Actions), Docker, Kubernetes, Cloud Platform, AWS, Google Cloud Platform
              </p>
              <div className={styles.stickerWrapper}>
                {devopsSticker.map(({ src, alt, startX, startY, transformEndX, transformEndY }, index) => (
                  <Sticker
                    key={src}
                    src={src}
                    alt={alt}
                    startX={startX}
                    startY={startY}
                    transformEndX={transformEndX}
                    transformEndY={transformEndY}
                  />
                ))}
              </div>
            </div>

            <div className={styles.innerGridItem}>
              <h3 className={styles.subtitle}>Soft Skills</h3>
              <p className={styles.description}>
                Team Collaboration, Agile Methodologies, Scrum, Problem-solving, Mentorship and Leadership, Project
                Management
              </p>
              <div className={styles.stickerWrapper}>
                {softSkillSticker.map(({ src, alt, startX, startY, transformEndX, transformEndY }, index) => (
                  <Sticker
                    key={src}
                    src={src}
                    alt={alt}
                    startX={startX}
                    startY={startY}
                    transformEndX={transformEndX}
                    transformEndY={transformEndY}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />

        <Group />
        <Group />
      </div>

      <div className={styles.gridWrapper}>
        <Group />
        <Group />

        <div className={styles.gridItem} />
        <div className={cx(styles.gridItem, styles.transparent)}>
          <div className={styles.innerGrid}>
            <div className={styles.innerGridItem}>
              <h2 className={styles.title}>contact</h2>

              <div className={styles.contactItem}>
                <a
                  className={styles.contactItemCta}
                  href="https://www.linkedin.com/in/masonwongcs/"
                  target="_blank"
                  rel="noreferrer"
                >
                  LinkedIn
                  <img src="/images/icon/arrow-right.svg" alt={`Open LinkedIn url in new tab`} />
                </a>
              </div>
              <div className={styles.contactItem}>
                <a
                  className={cx(styles.contactItemCta, 'githubCta')}
                  href="https://github.com/masonwongcs"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                  <img src="/images/icon/arrow-right.svg" alt={`Open GitHub url in new tab`} />
                </a>
              </div>

              <div className={styles.contactItem}>
                <a
                  className={styles.contactItemCta}
                  href="https://masonwongcs.com/resume.pdf"
                  target="_blank"
                  rel="noreferrer"
                >
                  Resume
                  <img src="/images/icon/arrow-right.svg" alt={`Open resume url in new tab`} />
                </a>
              </div>

              <h2 className={styles.subtitle}>or scan</h2>
              <QR />
            </div>
          </div>
        </div>
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />

        <div className={styles.gridItem} />
        <div className={cx(styles.gridItem, styles.githubCard)}>
          <GitHubCard />
        </div>
        <div className={styles.gridItem} />
        <div className={styles.gridItem} />

        <Group />
      </div>
    </section>
  );
};

export { Contact };
