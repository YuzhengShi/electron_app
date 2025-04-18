const puppeteer = require('puppeteer');
const assert = require('assert');

jest.setTimeout(60000);

describe('Message Polisher Form Tests', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox']
    });
    page = await browser.newPage();
    await page.goto('http://localhost:8501', { waitUntil: 'networkidle0' });
    
    // Make sure we're on the Polisher tab
    const tabs = await page.$$('button[data-baseweb="tab"]');
    await tabs[0].click();
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should have all required form elements', async () => {
    // Check for the text area
    const textArea = await page.$('textarea');
    assert.ok(textArea, 'Text area not found');
    
    // Check for radio buttons
    const formatRadios = await page.$$('input[type="radio"][name="Format:"]');
    assert.strictEqual(formatRadios.length, 2, 'Format radio buttons not found');
    
    const recipientRadios = await page.$$('input[type="radio"][name="Recipient:"]');
    assert.strictEqual(recipientRadios.length, 2, 'Recipient radio buttons not found');
    
    // Check for slider and button
    const slider = await page.$('input[type="range"]');
    assert.ok(slider, 'Variations slider not found');
    
    const generateButton = await page.$('button:has-text("Generate Messages")');
    assert.ok(generateButton, 'Generate button not found');
  });

  it('should generate messages when form is submitted', async () => {
    // Enter test message
    await page.type('textarea', 'Can I have an extension on my paper?');
    
    // Select Email format
    const emailRadio = await page.$('input[type="radio"][value="Email"]');
    await emailRadio.click();
    
    // Select Professor recipient
    const professorRadio = await page.$('input[type="radio"][value="Professor"]');
    await professorRadio.click();
    
    // Set variations to 2
    await page.evaluate(() => {
      document.querySelector('input[type="range"]').value = '2';
      document.querySelector('input[type="range"]').dispatchEvent(new Event('change'));
    });
    
    // Click generate button
    const generateButton = await page.$('button:has-text("Generate Messages")');
    await generateButton.click();
    
    // Wait for response
    await page.waitForSelector('.stTextArea', { timeout: 15000 });
    
    // Check that responses were generated
    const responses = await page.$$('.stTextArea');
    assert.ok(responses.length >= 1, 'No responses were generated');
    
    // Check for subject line in email format
    const subjectLine = await page.$('text=Subject:');
    assert.ok(subjectLine, 'Subject line not found in email response');
  });

  it('should show copy buttons for each response', async () => {
    const copyButtons = await page.$$('button:has-text("Copy Response")');
    assert.ok(copyButtons.length > 0, 'Copy buttons not found');
  });
});