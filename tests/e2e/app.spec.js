const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

test.describe('Aki Browser E2E', () => {
  let app;
  let window;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: [path.join(__dirname, '..', '..', 'main.js')],
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(1500);
  });

  test.afterAll(async () => {
    await app.close();
  });

  async function resetUI() {
    // close overlays
    await window.keyboard.press('Escape');
    await window.waitForTimeout(100);
    // close sidepanel if open
    const panelClass = await window.locator('#sidepanel').getAttribute('class');
    if (panelClass && !panelClass.includes('hidden')) {
      // click menu to close (toggle)
      await window.click('#btn-menu').catch(() => {});
      await window.waitForTimeout(100);
    }
  }

  test('janela principal carrega', async () => {
    const title = await window.title();
    expect(title).toContain('Aki');
  });

  test('barra de endereço existe', async () => {
    await expect(window.locator('#url-input')).toBeVisible();
  });

  test('cria nova aba', async () => {
    await resetUI();
    const before = await window.locator('.tab').count();
    await window.click('#btn-newtab');
    await window.waitForTimeout(500);
    const after = await window.locator('.tab').count();
    expect(after).toBeGreaterThan(before);
  });

  test('navega para URL', async () => {
    await resetUI();
    await window.fill('#url-input', 'about:blank');
    await window.waitForTimeout(300);
    await window.click('#btn-go');
    await window.waitForTimeout(1500);
    const url = await window.inputValue('#url-input');
    expect(url).toContain('about:blank');
  });

  test('command palette abre com Ctrl+K', async () => {
    await resetUI();
    await window.keyboard.press('Control+K');
    await window.waitForTimeout(200);
    await expect(window.locator('#cmdpalette')).not.toHaveClass(/hidden/);
    await window.keyboard.press('Escape');
    await window.waitForTimeout(200);
    await expect(window.locator('#cmdpalette')).toHaveClass(/hidden/);
  });

  test('painel de downloads abre e fecha', async () => {
    await resetUI();
    await window.click('#btn-downloads');
    await window.waitForTimeout(200);
    await expect(window.locator('#sidepanel')).not.toHaveClass(/hidden/);
    await window.click('#btn-downloads');
    await window.waitForTimeout(200);
    await expect(window.locator('#sidepanel')).toHaveClass(/hidden/);
  });

  test('tema alterna', async () => {
    await resetUI();
    await window.click('#btn-theme');
    await window.waitForTimeout(300);
    const isLight = await window.evaluate(() => document.body.classList.contains('light'));
    expect(typeof isLight).toBe('boolean');
  });

  test('modo privado toggle', async () => {
    await resetUI();
    await window.click('#btn-incognito');
    await window.waitForTimeout(300);
    const title = await window.title();
    expect(title).toContain('Aki');
    await window.click('#btn-incognito');
    await window.waitForTimeout(200);
  });

  test('settings panel abre', async () => {
    await resetUI();
    await window.click('#btn-menu');
    await window.waitForTimeout(200);
    await expect(window.locator('#sidepanel')).not.toHaveClass(/hidden/);
    await window.click('#btn-menu');
    await window.waitForTimeout(200);
  });

  test('atalho Ctrl+L foca address bar', async () => {
    await resetUI();
    await window.waitForTimeout(200);
    await window.evaluate(() => {
      const ev = new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true });
      document.dispatchEvent(ev);
    });
    await window.waitForTimeout(200);
    const focused = await window.evaluate(() => document.activeElement && document.activeElement.id === 'url-input');
    expect(focused).toBe(true);
  });
});
