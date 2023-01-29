const YEAR = new Date().getFullYear()

export default {
  darkMode: true,
  readMore: '更多 →',
  footer: (
    <small style={{ display: 'block', marginTop: '8rem', textAlign: 'center' }}>
      ©<time>{YEAR - 1} - {YEAR}</time> | <a href="https://beian.miit.gov.cn" target="_blank">粤ICP备2021174590号</a>
      {/*<a href="/feed.xml">RSS</a>*/}
      <style jsx>{`
        a {
          text-decoration: none;
        }
        @media screen and (max-width: 480px) {
          article {
            padding-top: 2rem;
            padding-bottom: 4rem;
          }
        }
      `}</style>
    </small>
  ),
}
