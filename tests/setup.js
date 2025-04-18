const { spawn } = require('child_process');
const waitOn = require('wait-on');
const path = require('path');

jest.setTimeout(60000);

// Global variables
global.STREAMLIT_URL = 'http://localhost:8501';
global.TIMEOUT = 30000; // 30 seconds timeout
global.streamlitProcess = null;

// Start Streamlit server before tests
beforeAll(async () => {
  console.log('Starting Streamlit server...');
  const pythonPath = 'python';
  const streamlitScriptPath = path.join(__dirname, '..', 'polish_bot.py');

  global.streamlitProcess = spawn(pythonPath, [
    '-m', 'streamlit', 'run', streamlitScriptPath,
    '--server.headless=true', '--server.port=8501'
  ], {
    shell: true,
  });

  // Wait for Streamlit server to be ready
  try {
    await waitOn({
      resources: [global.STREAMLIT_URL],
      timeout: global.TIMEOUT,
    });
    console.log('Streamlit server is ready');
  } catch (error) {
    console.error('Timeout waiting for Streamlit server:', error);
    throw error;
  }
});

// Kill Streamlit server after tests
afterAll(() => {
  if (global.streamlitProcess) {
    global.streamlitProcess.kill();
    console.log('Streamlit server stopped');
  }
});