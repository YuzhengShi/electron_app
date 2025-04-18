const { Application } = require('spectron');
const assert = require('assert');
const path = require('path');
const electronPath = require('electron');

describe('Floating UI Tests', function() {
  jest.setTimeout(20000);
  
  let app;
  
  beforeAll(async () => {
    app = new Application({
      path: electronPath,
      args: [path.join(__dirname, 'main.js')],
      startTimeout: 15000,
      waitTimeout: 15000
    });
    
    return app.start();
  });
  
  afterAll(async () => {
    if (app && app.isRunning()) {
      return app.stop();
    }
  });
  
  it('should launch the app', async () => {
    const isRunning = await app.isRunning();
    assert.strictEqual(isRunning, true);
  });
  
  it('should show the floating button window', async () => {
    const count = await app.client.getWindowCount();
    assert.strictEqual(count, 1);
    
    const title = await app.client.getTitle();
    assert.strictEqual(title, '');
    
    const isVisible = await app.browserWindow.isVisible();
    assert.strictEqual(isVisible, true);
  });
  
  it('should have correct floating button window properties', async () => {
    const bounds = await app.browserWindow.getBounds();
    
    // Check that window size matches expectations
    assert.strictEqual(bounds.width, 50);
    assert.strictEqual(bounds.height, 50);
    
    // Check window attributes
    const isAlwaysOnTop = await app.browserWindow.isAlwaysOnTop();
    assert.strictEqual(isAlwaysOnTop, true);
    
    const isResizable = await app.browserWindow.isResizable();
    assert.strictEqual(isResizable, false);
    
    const isFrameless = !(await app.browserWindow.isFrameDisplayed());
    assert.strictEqual(isFrameless, true);
  });
  
  it('should have floating button UI elements', async () => {
    // Check for floating button element
    const floatingButton = await app.client.$('.floating-button');
    assert.ok(await floatingButton.isExisting());
    
    // Check for close button
    const closeButton = await app.client.$('.close-btn');
    assert.ok(await closeButton.isExisting());
    
    // Check for icon image
    const iconImage = await app.client.$('.icon-image');
    assert.ok(await iconImage.isExisting());
  });
  
  it('should open popup window when floating button is clicked', async () => {
    // Initial window count
    const initialCount = await app.client.getWindowCount();
    
    // Click the floating button
    const floatingButton = await app.client.$('.floating-button');
    await floatingButton.click();
    
    // Wait for popup to open
    await app.client.pause(5000);
    
    // Check window count increased
    const newCount = await app.client.getWindowCount();
    assert.strictEqual(newCount, initialCount + 1);
  });
  
  it('should hide popup when floating button is clicked again', async () => {
    // Current window count
    const initialCount = await app.client.getWindowCount();
    
    // Click the floating button again
    const floatingButton = await app.client.$('.floating-button');
    await floatingButton.click();
    
    // Wait for popup to close
    await app.client.pause(1000);
    
    // Check window count decreased or window is hidden
    try {
      // In some implementations, the window might be hidden rather than closed
      const isVisible = await app.client.isWindowDisplayed();
      if (!isVisible) {
        assert.ok(true, 'Popup window was hidden');
      } else {
        const newCount = await app.client.getWindowCount();
        assert.strictEqual(newCount, initialCount - 1);
      }
    } catch (error) {
      // Window might be closed instead of hidden
      const newCount = await app.client.getWindowCount();
      assert.strictEqual(newCount, initialCount - 1);
    }
  });
  
  it('should close application when close button is clicked', async () => {
    // Click the close button
    const closeButton = await app.client.$('.close-btn');
    await closeButton.click();
    
    // Wait for app to close
    await app.client.pause(1000);
    
    // Check if app is still running
    const isRunning = await app.isRunning().catch(() => false);
    assert.strictEqual(isRunning, false);
  });
});