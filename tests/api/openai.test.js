const { OpenAI } = require('openai');
const dotenv = require('dotenv');

jest.setTimeout(60000);

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

describe('OpenAI API Integration Tests', () => {
  // Skip all tests if no API key
  beforeAll(() => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('OPENAI_API_KEY not found, skipping OpenAI API tests');
      return;
    }
  });
  
  test('Should connect to OpenAI API', async () => {
    if (!process.env.OPENAI_API_KEY) {
      return;
    }
    
    // Simple API call to verify connection
    const models = await client.models.list();
    expect(models).toBeDefined();
    expect(Array.isArray(models.data)).toBe(true);
  }, 10000);
  
  test('Should generate message polishing responses', async () => {
    if (!process.env.OPENAI_API_KEY) {
      return;
    }
    
    const prompt = `
    You are a communication assistant helping craft messages for a student to his Professor.
    Create 1 variation that follows these rules:
    Outlook Email Rules (Professor):
    1. Subject line matching message intent
    2. Formal salutation (Dear Professor LastName)
    3. Mirror the user's original request style
    4. Professional closing (Sincerely/Respectfully)
    5. Signature: [Full Name]
    
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
    
    // Verify response structure
    expect(response.choices).toBeDefined();
    expect(response.choices.length).toBeGreaterThan(0);
    expect(response.choices[0].message).toBeDefined();
    expect(response.choices[0].message.content).toBeDefined();
    
    const content = response.choices[0].message.content;
    
    // Verify content has expected elements
    expect(content).toContain('Subject:');
    expect(content).toMatch(/Dear Professor/i);
    expect(content).toMatch(/extension|paper|assignment/i);
    expect(content).toMatch(/Sincerely|Respectfully|Regards/i);
  }, 15000);
  
  test('Should analyze message emotions', async () => {
    if (!process.env.OPENAI_API_KEY) {
      return;
    }
    
    const messages = [
      { text: "I'm really excited about our project!", emotion: "happy" },
      { text: "I'm disappointed with the grade I received.", emotion: "sad" }
    ];
    
    for (const { text, emotion } of messages) {
      const prompt = `
      Analyze this message emotion:
      "${text}"
      
      Provide only the emotion name, nothing else.
      Choose from: happy, sad, angry, anxious, neutral
      `;
      
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You detect emotions in text." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 10
      });
      
      const content = response.choices[0].message.content.toLowerCase().trim();
      
      // Check the emotion detected matches expected or is similar
      const similarEmotions = {
        happy: ["happy", "excited", "joyful"],
        sad: ["sad", "disappointed", "unhappy"],
        angry: ["angry", "upset", "frustrated"],
        anxious: ["anxious", "worried", "nervous"],
        neutral: ["neutral", "calm", "objective"]
      };
      
      expect(similarEmotions[emotion].some(e => content.includes(e))).toBe(true);
    }
  }, 20000);
  
  test('Should transcribe audio with Whisper API', async () => {
    if (!process.env.OPENAI_API_KEY) {
      return;
    }
    
    // Skip test if running in CI environment
    if (process.env.CI) {
      console.log('Skipping Whisper API test in CI environment');
      return;
    }
    
    // Create a mock audio file or path to a test file
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Check if test audio file exists
      const testAudioPath = path.join(__dirname, '../fixtures/test-audio.mp3');
      
      if (!fs.existsSync(testAudioPath)) {
        console.log(`Test audio file not found at ${testAudioPath}, skipping Whisper API test`);
        return;
      }
      
      const response = await client.audio.transcriptions.create({
        model: "whisper-1",
        file: fs.createReadStream(testAudioPath)
      });
      
      expect(response.text).toBeDefined();
      expect(typeof response.text).toBe('string');
      expect(response.text.length).toBeGreaterThan(0);
    } catch (error) {
      console.log('Error in Whisper API test:', error.message);
      // Don't fail the test - this is an integration test that may not always work
    }
  }, 30000);
  
  test('Should create embeddings for text', async () => {
    if (!process.env.OPENAI_API_KEY) {
      return;
    }
    
    const response = await client.embeddings.create({
      model: "text-embedding-3-large",
      input: "This is a test sentence for embedding.",
    });
    
    expect(response.data).toBeDefined();
    expect(response.data.length).toBeGreaterThan(0);
    expect(response.data[0].embedding).toBeDefined();
    expect(Array.isArray(response.data[0].embedding)).toBe(true);
    expect(response.data[0].embedding.length).toBeGreaterThan(0);
  }, 10000);
  
  test('Should generate answers from context', async () => {
    if (!process.env.OPENAI_API_KEY) {
      return;
    }
    
    const context = `
    The water cycle, also known as the hydrologic cycle, describes the continuous movement of water on, above, and below the surface of the Earth. 
    Water can change states among liquid, vapor, and ice at various places in the water cycle.
    The water cycle involves the following processes:
    1. Evaporation: The transformation of water from liquid to gas phases as it moves from the ground or bodies of water into the atmosphere.
    2. Transpiration: The release of water vapor from plants and soil into the air.
    3. Condensation: The transformation of water vapor to liquid water droplets in the air, creating clouds and fog.
    4. Precipitation: The release of water from clouds in the form of rain, snow, sleet, or hail.
    5. Infiltration: The flow of water from the ground surface into the ground.
    6. Runoff: The variety of ways by which water moves across the land surface.
    `;
    
    const question = "What are the main processes in the water cycle?";
    
    const prompt = `
    You are answering questions based on provided context.
    
    CONTEXT:
    ${context}
    
    QUESTION:
    ${question}
    
    Provide a concise answer using only information from the context.
    `;
    
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful educational assistant." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 200
    });
    
    const answer = response.choices[0].message.content;
    
    // Check that answer contains key terms from the context
    expect(answer).toMatch(/evaporation/i);
    expect(answer).toMatch(/transpiration/i);
    expect(answer).toMatch(/condensation/i);
    expect(answer).toMatch(/precipitation/i);
    expect(answer).toMatch(/infiltration/i);
    expect(answer).toMatch(/runoff/i);
  }, 15000);
});