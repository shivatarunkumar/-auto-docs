// Renders a diagram page to a PNG of just the diagram, in the light theme with
// motion paused, using the same headless Chrome the engine's browser checks use.
// The PNG is for places that cannot run the interactive HTML, such as a GitHub
// README or a Confluence page without the draw.io app.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../bin/visual-check.mjs';

const SETTLE_SCRIPT = `(function () {
  document.documentElement.setAttribute('data-motion', 'still');
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready.catch(function () {}) : Promise.resolve();
  var wait = function (name) {
    return function () {
      var api = window.Autodocs && Autodocs[name];
      return api && typeof api.whenStable === 'function' ? api.whenStable() : undefined;
    };
  };
  return fontsReady.then(wait('layoutStability')).then(wait('readerLayout')).then(wait('viewerChromeLayout'))
    .then(function () { return new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); }); });
})()`;

// Hides page chrome that can overlap the diagram and reports where the SVG is.
const MEASURE_SCRIPT = `(function () {
  var svg = document.querySelector('.diagram-container svg');
  if (!svg) return null;
  var style = document.createElement('style');
  style.textContent = '.no-print,.toolbar,.navigation-dock,.diagram-guide,.share-card,.toast{visibility:hidden!important}';
  document.head.appendChild(style);
  var rect = svg.getBoundingClientRect();
  var vb = svg.viewBox && svg.viewBox.baseVal;
  return {
    x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height,
    viewBoxWidth: vb ? vb.width : rect.width,
  };
})()`;

async function evaluate(browser, sessionId, expression, awaitPromise = false) {
  const response = await browser.cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId);
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result?.value;
}

export async function exportPng(htmlPaths, { scale = 2, width = 1600 } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome, Chromium or Edge found. Install one, or set AUTODOCS_CHROME to its executable path.');
  const browser = new ChromeVisualBrowser(chrome);
  const results = [];
  try {
    const sessionId = await browser.sessionPromise;
    for (const htmlPath of htmlPaths) {
      const out = htmlPath.replace(/\.html?$/i, '') + '.png';
      await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
      const url = pathToFileURL(path.resolve(htmlPath));
      url.searchParams.set('theme', 'light');
      const loaded = browser.cdp.waitFor('Page.loadEventFired', sessionId);
      loaded.catch(() => {});
      const navigation = await browser.cdp.send('Page.navigate', { url: url.href }, sessionId);
      if (navigation.errorText) throw new Error(`Chrome could not open ${htmlPath}: ${navigation.errorText}`);
      await loaded;
      await evaluate(browser, sessionId, SETTLE_SCRIPT, true);
      const box = await evaluate(browser, sessionId, MEASURE_SCRIPT);
      if (!box || !box.width || !box.height) throw new Error(`${htmlPath} has no diagram to export.`);
      // Render at `scale` times the diagram's own coordinate size, whatever
      // size the reader layout gave it on screen.
      const captureScale = Math.min(4, scale * (box.viewBoxWidth / box.width));
      const capture = await browser.cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: captureScale },
      }, sessionId, 30000);
      fs.writeFileSync(out, Buffer.from(capture.data, 'base64'));
      results.push({ html: htmlPath, png: out, width: Math.round(box.width * captureScale), height: Math.round(box.height * captureScale) });
    }
  } finally {
    await browser.close();
  }
  return results;
}
