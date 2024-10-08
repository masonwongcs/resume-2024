import styles from './Contact.module.scss';

import cx from 'classnames';

import { Sticker } from '@/components/Sticker';

import QR from './qr.svg';

const frontEndStickers = [
  {
    src: '/images/sticker/react.svg',
    alt: 'React Sticker',
    startX: '65vw',
    startY: '10vh',
    transformEndX: 300,
    transformEndY: 0
    // startX: '2vw',
    // startY: '1vh',
    // transformEndX: -300,
    // transformEndY: -300
  },
  {
    src: '/images/sticker/css.svg',
    alt: 'CSS Sticker',
    startX: '88vw',
    startY: '5vh',
    transformEndX: 300,
    transformEndY: 0
  },
  {
    src: '/images/sticker/html.svg',
    alt: 'HTML Sticker',
    startX: '78vw',
    startY: '50vh',
    transformEndX: 300,
    transformEndY: 100
  },
  {
    src: '/images/sticker/javascript.svg',
    alt: 'JavaScript Sticker',
    startX: '65vw',
    startY: '70vh',
    transformEndX: -300,
    transformEndY: 300
  },
  {
    src: '/images/sticker/typescript.svg',
    alt: 'TypeScript Sticker',
    startX: '85vw',
    startY: '75vh',
    transformEndX: 300,
    transformEndY: 300
  },
  {
    src: '/images/sticker/nextjs.svg',
    alt: 'Next.js Sticker',
    startX: '75vw',
    startY: '-5vh',
    transformEndX: -200,
    transformEndY: -400
  },
  {
    src: '/images/sticker/figma.svg',
    alt: 'Figma Sticker',
    startX: '75vw',
    startY: '30vh',
    transformEndX: 200,
    transformEndY: -300
  }
  // { src: '/images/sticker/nextjs.svg', alt: 'React Sticker' },
  // { src: '/images/sticker/figma.svg', alt: 'React Sticker' }
];

const backendStickers = [
  {
    src: '/images/sticker/nodejs.svg',
    alt: 'Node.js Sticker',
    startX: '70vw',
    startY: '5vh',
    transformEndX: 300,
    transformEndY: 0
  },
  {
    src: '/images/sticker/graphql.svg',
    alt: 'GraphQL Sticker',
    startX: '80vw',
    startY: '15vh',
    transformEndX: 300,
    transformEndY: 0
  },
  {
    src: '/images/sticker/bunjs.svg',
    alt: 'Bun.js Sticker',
    startX: '75vw',
    startY: '75vh',
    transformEndX: 200,
    transformEndY: 300
  },
  {
    src: '/images/sticker/postgresql.svg',
    alt: 'PostgresQL Sticker',
    startX: '80vw',
    startY: '50vh',
    transformEndX: 200,
    transformEndY: -200
  }
];

const devopsSticker = [
  {
    src: '/images/sticker/aws.svg',
    alt: 'AWS Sticker',
    startX: '70vw',
    startY: '5vh',
    transformEndX: 300,
    transformEndY: 0
  },
  {
    src: '/images/sticker/gcloud.svg',
    alt: 'Google Cloud Sticker',
    startX: '80vw',
    startY: '25vh',
    transformEndX: 300,
    transformEndY: 0
  },
  {
    src: '/images/sticker/git.svg',
    alt: 'Git Sticker',
    startX: '75vw',
    startY: '75vh',
    transformEndX: 200,
    transformEndY: 300
  },
  {
    src: '/images/sticker/docker.svg',
    alt: 'Docker Sticker',
    startX: '80vw',
    startY: '50vh',
    transformEndX: 200,
    transformEndY: -200
  }
];

const softSkillSticker = [
  {
    src: '/images/sticker/atlassian.svg',
    alt: 'Atlassian Sticker',
    startX: '70vw',
    startY: '5vh',
    transformEndX: 300,
    transformEndY: 0
  },
  {
    src: '/images/sticker/miro.svg',
    alt: 'Miro Sticker',
    startX: '80vw',
    startY: '25vh',
    transformEndX: 300,
    transformEndY: 0
  },
  {
    src: '/images/sticker/jira.svg',
    alt: 'Jira Sticker',
    startX: '75vw',
    startY: '75vh',
    transformEndX: 200,
    transformEndY: 300
  },
  {
    src: '/images/sticker/slack.svg',
    alt: 'Slack Sticker',
    startX: '80vw',
    startY: '50vh',
    transformEndX: 200,
    transformEndY: -200
  }
];

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
                  className={styles.contactItemCta}
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

        <Group />
        <Group />
      </div>
    </section>
  );
};

export { Contact };
