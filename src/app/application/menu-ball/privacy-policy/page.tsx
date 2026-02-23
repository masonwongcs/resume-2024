import styles from './page.module.scss';

export default function Page() {
  return (
    <main className={styles.main}>
      <div className={styles.wrapper}>
        <img className={styles.logo} src="/images/application/menu-ball/logo.png" alt="Menu Ball" />
        <h1>Privacy Policy</h1>
        <p className={styles.lastUpdated}>Last updated: February 24, 2026</p>

        <section>
          <h2>Introduction</h2>
          <p>
            Menu Ball (&quot;we,&quot; &quot;our,&quot; or &quot;the app&quot;) is committed to protecting your privacy.
            This Privacy Policy explains how we handle information when you use our macOS menu bar application. Menu
            Ball is designed to be simple and privacy-respecting—we do not collect, store, or share your personal data.
          </p>
        </section>

        <section>
          <h2>Data We Collect</h2>
          <p>
            Menu Ball does not collect any personal data. The app runs entirely on your device. We do not gather
            analytics, usage statistics, or any other information about how you use the app.
          </p>
        </section>

        <section>
          <h2>How We Use Data</h2>
          <p>
            Since we do not collect any data, there is nothing to use, process, or analyze. All app functionality is
            performed locally on your Mac.
          </p>
        </section>

        <section>
          <h2>Data Sharing</h2>
          <p>
            We do not share any data with third parties because we do not collect any data. Menu Ball has no
            advertising, no tracking, and no network requests that transmit user information.
          </p>
        </section>

        <section>
          <h2>Data Storage</h2>
          <p>
            Any preferences or settings you configure in Menu Ball are stored locally on your device. We do not operate
            servers that store your data. Your information never leaves your Mac.
          </p>
        </section>

        <section>
          <h2>Your Rights</h2>
          <p>
            You have full control over the app. You can uninstall Menu Ball at any time, and all local data associated
            with the app will be removed from your device. If you have questions about your privacy, please contact us.
          </p>
        </section>

        <section>
          <h2>Children&apos;s Privacy</h2>
          <p>
            Menu Ball does not knowingly collect any information from children. The app is suitable for all ages and
            does not require an account or any personal information to use.
          </p>
        </section>

        <section>
          <h2>Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
            Privacy Policy on this page and updating the &quot;Last updated&quot; date. We encourage you to review this
            policy periodically.
          </p>
        </section>

        <section>
          <h2>Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy or Menu Ball, please contact us at{' '}
            <a href="mailto:hello@masonwongcs.com" target="_blank" rel="noreferrer">
              hello@masonwongcs.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
