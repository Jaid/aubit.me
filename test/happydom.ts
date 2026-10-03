import {GlobalRegistrator} from '@happy-dom/global-registrator'

// The app only targets Chromium. Happy-dom’s default user agent looks like WebKit, which makes Monaco install a Safari-only clipboard workaround that throws “Canceled” rejections on every click.
GlobalRegistrator.register({
  url: 'http://localhost/',
  settings: {navigator: {userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'}},
})
// happy-dom does not implement the CSS Font Loading API, which Monacozen uses to wait for Antimono.
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      load: async () => [],
      ready: Promise.resolve(),
      check: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  })
}
