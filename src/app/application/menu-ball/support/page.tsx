import styles from './page.module.scss';

export default function Page() {
  return (
    <main className={styles.main}>
      <div className={styles.wrapper}>
        <img className={styles.logo} src="/images/application/menu-ball/logo.png" alt="Menu Ball" />
        <h1>Menu Ball</h1>
        <p>
          Menu Ball is a tiny macOS companion that adds a touch of fun to your workflow. With a single click, a ball
          drops from your menu bar and becomes your personal desktop fidget toy. Drag it, bounce it, or just watch it
          roll around while you think. It’s simple, satisfying, and designed to give your brain a quick refresh without
          leaving your screen.
        </p>

        <div className={styles.carouselWrapper}>
          <div className={styles.carousel}>
            <img src="/images/application/menu-ball/screen-1.jpg" alt="Screen 1" />
            <img src="/images/application/menu-ball/screen-2.jpg" alt="Screen 2" />
            <img src="/images/application/menu-ball/screen-3.jpg" alt="Screen 3" />
          </div>
        </div>

        <p>
          Feel free to contact us at{' '}
          <a className={styles.contactItemCta} href="mailto:hello@masonwongcs.com" target="_blank" rel="noreferrer">
            hello@masonwongcs.com
          </a>{' '}
          if you have any questions, feedback, or need support. We’d love to hear from you.
        </p>
      </div>
    </main>
  );
}
