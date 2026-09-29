/** Scrolls the page down once (used for lists such as hashtag pages or the ad library): to the bottom, where lists load their next items */
(() => {
  const h = document.documentElement.scrollHeight;
  window.scrollTo({ top: Math.max(window.scrollY + Math.max(600, window.innerHeight * 0.9), h - window.innerHeight - 200), behavior: 'instant' });
  window.dispatchEvent(new Event('scroll'));
  return h;
})();
