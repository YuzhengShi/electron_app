const { OpenAI } = require('openai');
const assert = require('assert');
const dotenv = require('dotenv');

jest.setTimeout(60000);

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

describe('Message Polisher API Response Validation', () => {
  it('should generate appropriate professor email format', async function() {
    this.timeout(20000); // Allow time for API response
    
    const prompt = `
    You are a communication assistant helping craft messages for a student to his Professor.
    Create 1 variation that follows these rules:
    Outlook Email Rules (Professor):
    1. Subject line matching message intent
    2. Formal salutation (Dear Professor LastName)
    3. Mirror the user's original request style
    4. Professional closing (Sincerely/Respectfully)
    5. Signature: [Full Name]
    
    KEY REQUIREMENTS:
    1. PRESERVE the original message's intent exactly
    2. MIRROR the user's writing style (formal/casual)
    3. USE APPROPRIATE PLACEHOLDERS
    
    Original message: "Hey prof, can I get an extension on my paper?"
    `;
    
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "Generate EXACT variations matching my message" }
      ],
      temperature: 0.3,
      max_tokens: 300
    });
    
    const result = response.choices[0].message.content;
    
    // Verify email format requirements
    assert.ok(result.includes('Subject:'), 'Response missing subject line');
    assert.ok(/Dear Professor/i.test(result), 'Response missing proper salutation');
    assert.ok(/Sincerely|Respectfully|Regards/i.test(result), 'Response missing formal closing');
    assert.ok(result.includes('[Full Name]'), 'Response missing signature placeholder');
    
    // Verify intent preservation
    assert.ok(/extension|extend|additional time/i.test(result), 'Response does not preserve original intent');
    assert.ok(/paper|assignment|essay/i.test(result), 'Response does not mention the paper');
  });
  
  it('should generate appropriate classmate text format', async function() {
    this.timeout(20000);
    
    const prompt = `
    You are a communication assistant helping craft messages for a student to his Classmate.
    Create 1 variation that follows these rules:
    Microsoft Teams Message Rules (Classmate):
    1. Casual friendly tone
    2. Use first names only ([Name])
    3. Match the user's message length/style
    4. Can include emojis
    5. 10-20 words maximum
    
    KEY REQUIREMENTS:
    1. PRESERVE the original message's intent exactly
    2. MIRROR the user's writing style (formal/casual)
    3. USE APPROPRIATE PLACEHOLDERS
    
    Original message: "do you have the notes from yesterday's class? I missed it"
    `;
    
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "Generate EXACT variations matching my message" }
      ],
      temperature: 0.3,
      max_tokens: 300
    });
    
    const result = response.choices[0].message.content;
    
    // Verify text format requirements
    assert.ok(result.includes('[Name]'), 'Response missing name placeholder');
    
    // Count words to verify length constraint
    const wordCount = result.split(/\s+/).filter(Boolean).length;
    assert.ok(wordCount <= 25, `Response too long: ${wordCount} words`);
    
    // Verify informal tone
    assert.ok(!/Dear|Sincerely|Respectfully/i.test(result), 'Response too formal for classmate text');
    
    // Verify intent preservation
    assert.ok(/notes|class|missed/i.test(result), 'Response does not preserve original intent');
  });
});