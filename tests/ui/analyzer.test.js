const assert = require('assert');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');

jest.setTimeout(60000);

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Mock the analyze_message function from polish_bot.py
async function analyze_message(message) {
  const analysis_prompt = `
  Analyze this message from someone else:
  "${message}"

  Provide output in this EXACT format:
  
  ##EMOTION##
  [primary emotion: happy/neutral/sad/angry/anxious]
  
  ##SOCIAL CUES##
  - [cue 1: formality level]
  - [cue 2: urgency level]
  - [cue 3: relationship context]
  
  ##SUMMARY##
  [1-sentence plain language summary]
  
  ##KEYWORDS##
  [comma-separated important words]
  
  ##RESPONSES##
  Positive: [positive response draft]
  Neutral: [neutral response draft]
  Negative: [negative response draft]
  `;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a social communication assistant" },
      { role: "user", content: analysis_prompt }
    ],
    temperature: 0.2,
    max_tokens: 300
  });
  
  return response.choices[0].message.content;
}

// Mock the parse_analysis function from polish_bot.py
function parse_analysis(raw_text) {
  const sections = {
    "emotion": "",
    "cues": [],
    "summary": "",
    "keywords": [],
    "responses": {}
  };
  
  let current_section = null;
  for (const line of raw_text.split('\n')) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("##EMOTION##")) {
      current_section = "emotion";
    } else if (trimmedLine.startsWith("##SOCIAL CUES##")) {
      current_section = "cues";
    } else if (trimmedLine.startsWith("##SUMMARY##")) {
      current_section = "summary";
    } else if (trimmedLine.startsWith("##KEYWORDS##")) {
      current_section = "keywords";
    } else if (trimmedLine.startsWith("##RESPONSES##")) {
      current_section = "responses";
    } else if (current_section === "emotion" && trimmedLine) {
      sections["emotion"] = trimmedLine.split(":")?.pop()?.trim().toLowerCase() || "";
    } else if (current_section === "cues" && trimmedLine.startsWith("-")) {
      sections["cues"].push(trimmedLine.substring(1).trim());
    } else if (current_section === "summary" && trimmedLine) {
      sections["summary"] = trimmedLine;
    } else if (current_section === "keywords" && trimmedLine) {
      sections["keywords"] = trimmedLine.split(",").map(kw => kw.trim());
    } else if (current_section === "responses" && trimmedLine.includes(":")) {
      const [tone, text] = trimmedLine.split(":", 2);
      sections["responses"][tone.trim().toLowerCase()] = text.trim();
    }
  }
  
  return sections;
}

describe('Emotion Detection Unit Tests', () => {
  const testCases = [
    {
      message: "I'm really excited about the project we're working on! Can't wait to see the final results.",
      expectedEmotion: "happy"
    },
    {
      message: "I'm writing to inform you that your assignment is due next Friday. Please submit it on time.",
      expectedEmotion: "neutral"
    },
    {
      message: "I'm disappointed that you didn't submit your assignment on time. This is the third time this semester.",
      expectedEmotion: "angry"
    },
    {
      message: "I'm really worried about the upcoming exam. I don't feel prepared at all.",
      expectedEmotion: "anxious"
    },
    {
      message: "I regret to inform you that we cannot accept your application at this time.",
      expectedEmotion: "sad"
    }
  ];

  testCases.forEach(({ message, expectedEmotion }) => {
    it(`should detect ${expectedEmotion} emotion correctly`, async function() {
      this.timeout(20000); // Allow time for API response
      
      const raw_analysis = await analyze_message(message);
      const analysis = parse_analysis(raw_analysis);
      
      assert.ok(analysis.emotion, 'Emotion not detected');
      assert.ok(analysis.emotion.includes(expectedEmotion) || 
                (expectedEmotion === 'angry' && analysis.emotion.includes('frustrat')) ||
                (expectedEmotion === 'anxious' && analysis.emotion.includes('worry')),
                `Expected emotion "${expectedEmotion}" but got "${analysis.emotion}"`);
    });
  });

  it('should extract social cues correctly', async function() {
    this.timeout(20000);
    
    const message = "Professor Smith, I urgently need your feedback on my thesis draft before the department meeting tomorrow. This is critical for my graduation timeline.";
    
    const raw_analysis = await analyze_message(message);
    const analysis = parse_analysis(raw_analysis);
    
    assert.ok(analysis.cues.length >= 3, 'Did not extract enough social cues');
    
    // Check for formality
    const hasFormality = analysis.cues.some(cue => 
      /formal|informal|casual|professional/i.test(cue));
    assert.ok(hasFormality, 'No formality cue detected');
    
    // Check for urgency
    const hasUrgency = analysis.cues.some(cue => 
      /urgent|immediate|pressing|high priority|low priority/i.test(cue));
    assert.ok(hasUrgency, 'No urgency cue detected');
    
    // Check for relationship context
    const hasRelationship = analysis.cues.some(cue => 
      /professor|student|academic|professional|personal/i.test(cue));
    assert.ok(hasRelationship, 'No relationship context detected');
  });
});

describe('Response Suggestion Validation', () => {
  it('should generate appropriate positive, neutral, and negative responses', async function() {
    this.timeout(20000);
    
    const message = "Could you please review my thesis draft by next week? I'd really appreciate your feedback.";
    
    const raw_analysis = await analyze_message(message);
    const analysis = parse_analysis(raw_analysis);
    
    // Verify response object structure
    assert.ok(analysis.responses, 'No responses generated');
    assert.ok(analysis.responses.positive, 'No positive response generated');
    assert.ok(analysis.responses.neutral, 'No neutral response generated');
    assert.ok(analysis.responses.negative, 'No negative response generated');
    
    // Check positive response
    assert.ok(/yes|certainly|happy|glad|absolutely/i.test(analysis.responses.positive), 
              'Positive response does not affirm the request');
    
    // Check neutral response
    assert.ok(/will see|check|consider|look at|schedule/i.test(analysis.responses.neutral), 
              'Neutral response does not acknowledge the request without commitment');
    
    // Check negative response
    assert.ok(/sorry|unfortunately|unable|cannot|won't be able/i.test(analysis.responses.negative), 
              'Negative response does not properly decline the request');
  });
  
  it('should adapt response style to the original message tone', async function() {
    this.timeout(20000);
    
    const formalMessage = "I would like to request an extension on the assignment due to unforeseen circumstances.";
    const casualMessage = "Hey, can I get more time for the assignment? Something came up.";
    
    const formalAnalysis = parse_analysis(await analyze_message(formalMessage));
    const casualAnalysis = parse_analysis(await analyze_message(casualMessage));
    
    // Formal message should get formal responses
    assert.ok(/would be|certainly|I am|I will/i.test(formalAnalysis.responses.positive), 
              'Formal tone not maintained in response to formal message');
    
    // Casual message should get casual responses
    assert.ok(/sure|yeah|no problem|can/i.test(casualAnalysis.responses.positive), 
              'Casual tone not maintained in response to casual message');
  });
  
  it('should preserve core message context in responses', async function() {
    this.timeout(20000);
    
    const message = "I have a scheduling conflict with the exam on Friday. Is there any possibility of taking it earlier?";
    
    const analysis = parse_analysis(await analyze_message(message));
    
    // Check that all responses mention the exam/scheduling context
    assert.ok(/exam|schedul|friday|earlier|conflict/i.test(analysis.responses.positive), 
              'Positive response does not maintain message context');
    assert.ok(/exam|schedul|friday|earlier|conflict/i.test(analysis.responses.neutral), 
              'Neutral response does not maintain message context');
    assert.ok(/exam|schedul|friday|earlier|conflict/i.test(analysis.responses.negative), 
              'Negative response does not maintain message context');
  });
});