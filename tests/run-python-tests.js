// tests/run-python-tests.js
const { spawn } = require('child_process');
const path = require('path');

// Run Python tests
const pythonTests = spawn('python', ['-m', 'unittest', 'discover', '-s', 'tests/python'], {
  stdio: 'inherit'
});

pythonTests.on('close', (code) => {
  process.exit(code);
});