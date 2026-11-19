// Plain-language versions of fetch problems (mirrors ERROR_HELP in the app process).
export const ERROR_TEXT = {
  offline: 'Your Mac seemed to be offline.',
  timeout: 'The site took too long to answer.',
  'not-found': 'The page is gone or has moved.',
  blocked: 'The site refused automated access. Open it in the Atelier browser, then Capture.',
  'needs-login': 'Needs you to sign in. Use Sign In on the source.',
  'rate-limited': 'The site asked Atelier to slow down.',
  server: 'The site had an error.',
  'not-html': 'Not a web page.',
  'invalid-url': 'Not a valid web address.',
  'too-large': 'Page too large.',
  empty: 'The page had almost no readable text.',
  'no-links': 'No opportunity links found. The site may have changed; edit or test the source.',
  unknown: 'Something went wrong loading the page.',
  error: 'Something went wrong.',
};
