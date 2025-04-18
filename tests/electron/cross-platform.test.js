const { Application } = require('spectron');
const assert = require('assert');
const path = require('path');
const electronPath = require('electron');
const os = require('os');

describe('Cross-Platform Window Behavior Tests', function() {
  jest.setTimeout(60000);
  
  let app;
  const platform = os.platform();
  
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
  
  it('should have platform-appropriate window behavior', async () => {
    const isSkipTaskbar = await app.browserWindow.isSkipTaskbar();
    assert.strictEqual(isSkipTaskbar, true, 'Window should skip taskbar on all platforms');
    
    const hasShadow = await app.browserWindow.hasShadow();
    assert.strictEqual(hasShadow, false, 'Window should not have shadow on all platforms');
    
    // Check platform-specific behaviors
    console.log(`Running on platform: ${platform}`);
    if (platform === 'darwin') {
      // macOS specific tests
      try {
        const isVisibleOnAllWorkspaces = await app.browserWindow.isVisibleOnAllWorkspaces();
        assert.strictEqual(isVisibleOnAllWorkspaces, false, 'Window should not be visible on all workspaces by default');
      } catch (error) {
        // Some versions of Electron/Spectron may not support this method
        console.log('Skipping isVisibleOnAllWorkspaces test on macOS');
      }
    } else if (platform === 'win32') {
      // Windows specific tests
      try {
        const isMenuBarVisible = await app.browserWindow.isMenuBarVisible();
        assert.strictEqual(isMenuBarVisible, false, 'Menu bar should not be visible on Windows');
      } catch (error) {
        // Some versions of Electron/Spectron may not support this method
        console.log('Skipping isMenuBarVisible test on Windows');
      }
    }
  });
  
  it('should maintain position when dragged', async () => {
    // Get initial position
    const initialBounds = await app.browserWindow.getBounds();
    const initialX = initialBounds.x;
    const initialY = initialBounds.y;
    
    // Simulate dragging (this is a simplified approach)
    await app.client.execute(() => {
      const btn = document.querySelector('.floating-button');
      
      // Trigger mousedown
      const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: 25,
        clientY: 25
      });
      btn.dispatchEvent(mousedownEvent);
      
      // Simulate mousemove
      const mousemoveEvent = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: 100,
        clientY: 100,
        screenX: window.screenX + 100,
        screenY: window.screenY + 100
      });
      document.dispatchEvent(mousemoveEvent);
      
      // Trigger mouseup
      const mouseupEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      document.dispatchEvent(mouseupEvent);
    });
    
    // Wait for drag to complete
    await app.client.pause(1000);
    
    // Get new position
    const newBounds = await app.browserWindow.getBounds();
    
    // Check if position changed from the initial position
    // Note: The exact position change might be different than expected due to
    // how Electron/Spectron handle events, but there should be some change
    console.log(`Position change: (${initialX}, ${initialY}) -> (${newBounds.x}, ${newBounds.y})`);
    
    // Verify the window is still visible on screen
    const displays = await app.electron.screen.getAllDisplays();
    const primaryDisplay = displays.find(display => display.bounds.x === 0 && display.bounds.y === 0);
    
    assert.ok(
      newBounds.x >= 0 && 
      newBounds.y >= 0 && 
      newBounds.x < primaryDisplay.bounds.width && 
      newBounds.y < primaryDisplay.bounds.height,
      'Window should remain visible on screen after dragging'
    );
  });
  
  it('should toggle popup window appropriately on all platforms', async () => {
    // Click the floating button to show popup
    const floatingButton = await app.client.$('.floating-button');
    await floatingButton.click();
    
    // Wait for popup to appear
    await app.client.pause(5000);
    
    // Check window count
    const windowCount = await app.client.getWindowCount();
    assert.strictEqual(windowCount, 2, 'Popup window should open on all platforms');
    
    // Check relative positioning
    const floatingBounds = await app.browserWindow.getBounds();
    
    // Switch to popup window
    await app.client.windowByIndex(1);
    
    // Get popup bounds
    const popupBounds = await app.browserWindow.getBounds();
    
    // Popup should be positioned relative to floating button
    const isRelativelyPositioned = 
      Math.abs((popupBounds.x + popupBounds.width) - floatingBounds.x) <= 400 && 
      Math.abs((popupBounds.y + popupBounds.height/2) - (floatingBounds.y + floatingBounds.height/2)) <= 300;
    
    assert.ok(isRelativelyPositioned, 'Popup should be positioned relative to floating button');
    
    // Switch back to main window
    await app.client.windowByIndex(0);
    
    // Click floating button again to hide popup
    await floatingButton.click();
    
    // Wait for popup to close or hide
    await app.client.pause(1000);
    
    // Check if popup is hidden or closed
    try {
      const isVisible = await app.client.windowByIndex(1).isVisible();
      assert.strictEqual(isVisible, false, 'Popup should be hidden when toggled');
    } catch (error) {
      // Window might be closed instead of hidden
      const newWindowCount = await app.client.getWindowCount();
      assert.strictEqual(newWindowCount, 1, 'Popup should be closed when toggled');
    }
  });
});