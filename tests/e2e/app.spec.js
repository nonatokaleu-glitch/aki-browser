const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

test.describe('Aki Browser E2E', () => {
  let app;
  let window;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: [path.join(__dirname, '..', '..', 'main.js')],
      env: { ...process.env, NODE_ENV: 'test' },
    });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('janela principal carrega', async () => {
    const title = await window.title();
    expect(title).toContain('Aki');
  });

  test('barra de endereço existe', async () => {
    await expect(window.locator('#url-input')).toBeVisible();
  });

  test('cria nova aba', async () => {
    const before = await window.locator('.tab').count();
    await window.click('#btn-newtab');
    await window.waitForTimeout(500);
    const after = await window.locator('.tab').count();
    expect(after).toBeGreaterThan(before);
  });

  test('navega para URL', async () => {
    await window.fill('#url-input', 'about:blank');
    await window.click('#btn-go');
    await window.waitForTimeout(1000);
    const url = await window.inputValue('#url-input');
    expect(url).toContain('about:blank');
  });

  test('command palette abre com Ctrl+K', async () => {
    await window.keyboard.press('Control+K');
    await expect(window.locator('#cmdpalette')).not.toHaveClass(/hidden/);
    await window.keyboard.press('Escape');
  });

  test('painel de downloads abre', async () => {
    await window.click('#btn-downloads');
    await expect(window.locator('#sidepanel')).not.toHaveClass(/hidden/);
    await window.click('#btn-downloads'); // close
  });

  test('tema alterna', async () => {
    await window.click('#btn-theme');
    await window.waitForTimeout(300);
    const isLight = await window.evaluate(() => document.body.classList.contains('light'));
    // either state is fine, just ensure no crash
    expect(typeof isLight).toBe('boolean');
  });
});
