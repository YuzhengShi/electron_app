const assert = require('assert');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

jest.setTimeout(60000);

dotenv.config();
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helper function to run python script
async function runPythonScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', [scriptPath, ...args]);
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

// Mock of the generate_answer function from polish_bot.py
async function generate_answer(context, question) {
  try {
    const prompt = `
    You are a student helper answering questions about a transcript of a educational video.
    
    CONTEXT INFORMATION:
    ${context}
    
    QUESTION:
    ${question}
    
    INSTRUCTIONS:
    1. Use the provided context information as your primary source
    2. If the exact answer isn't in the context, say "While not explicitly covered in the video..." and provide your best answer using your general knowledge
    3. ALWAYS provide an answer, even when the context has limited information
    4. Use specific quotes or examples from the context when available
    5. Keep your answer concise and direct - focus on addressing the question
    6. Organize complex information into short paragraphs for readability
    7. If the context contains relevant numbers, dates, or specific facts, include them in your answer
    8. Use bullet points for multi-part answers
    
    Your response:
    `;
    
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful educational assistant who always provides answers based on available context or general knowledge when needed." },
        { role: "user", content: prompt }
      ],
      max_tokens: 300
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    return `Error generating answer: ${error.message}`;
  }
}

describe('Answer Accuracy Benchmarks', () => {
  // This test evaluates the quality of answers against known ground truth
  it('should evaluate answer accuracy against ground truth', async function() {
    this.timeout(30000);
    
    const testCases = [
      {
        context: `The AI winter was a period of reduced funding and interest in artificial intelligence research. 
        It began in the early 1970s when the field failed to fulfill the lofty expectations that had been set by early pioneers. 
        The term "AI winter" was coined in 1984 as an analogy to the idea of a nuclear winter. 
        There were several factors that contributed to the AI winter, including limitations of the technologies being used, 
        such as the limits of perceptrons highlighted by Minsky and Papert. 
        The field recovered in the 1990s with new approaches like neural networks and machine learning.`,
        question: "When did the AI winter begin?",
        groundTruth: "early 1970s"
      },
      {
        context: `Machine learning algorithms can be categorized into three main types:
        1. Supervised learning: The algorithm learns from labeled training data, trying to predict outcomes for unseen data.
        2. Unsupervised learning: The algorithm finds patterns in unlabeled data.
        3. Reinforcement learning: The algorithm learns by interacting with an environment and receiving rewards or penalties.
        Deep learning is a subset of machine learning that uses neural networks with many layers.`,
        question: "What are the three main types of machine learning?",
        groundTruth: "supervised learning, unsupervised learning, reinforcement learning"
      },
      {
        context: `The transformer architecture was introduced in the paper "Attention Is All You Need" by Vaswani et al. in 2017.
        It revolutionized natural language processing by replacing recurrent neural networks with self-attention mechanisms.
        The original transformer had an encoder-decoder structure and was designed for machine translation tasks.
        Modern language models like BERT, GPT, and T5 are all based on the transformer architecture.`,
        question: "What paper introduced the transformer architecture?",
        groundTruth: "Attention Is All You Need"
      }
    ];
    
    const results = [];
    
    for (const { context, question, groundTruth } of testCases) {
      const answer = await generate_answer(context, question);
      
      // Test if the answer contains the ground truth
      const containsGroundTruth = answer.toLowerCase().includes(groundTruth.toLowerCase());
      
      // For more rigorous evaluation, we could use the OpenAI API to judge correctness
      const evaluationPrompt = `
      Question: ${question}
      
      Ground Truth Answer: ${groundTruth}
      
      Generated Answer: ${answer}
      
      Evaluate if the generated answer correctly answers the question based on the ground truth.
      Consider factors like:
      1. Factual correctness
      2. Completeness
      3. Relevance
      
      Output format: 
      Score: [0-100]
      Reason: [brief explanation]
      `;
      
      const evaluation = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an objective evaluator of answer quality." },
          { role: "user", content: evaluationPrompt }
        ],
        temperature: 0.1
      });
      
      const evaluationText = evaluation.choices[0].message.content;
      const scoreMatch = evaluationText.match(/Score:\s*(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
      
      results.push({
        question,
        containsGroundTruth,
        score,
        evaluation: evaluationText
      });
    }
    
    // Calculate overall accuracy
    const averageScore = results.reduce((sum, result) => sum + result.score, 0) / results.length;
    const groundTruthMatches = results.filter(result => result.containsGroundTruth).length;
    const groundTruthAccuracy = (groundTruthMatches / results.length) * 100;
    
    console.log(`Average evaluation score: ${averageScore}`);
    console.log(`Ground truth match accuracy: ${groundTruthAccuracy}%`);
    
    // Assert that the average score is acceptable
    assert.ok(averageScore >= 70, `Average score (${averageScore}) is below threshold of 70`);
    
    // Assert that ground truth accuracy is acceptable
    assert.ok(groundTruthAccuracy >= 66, `Ground truth accuracy (${groundTruthAccuracy}%) is below threshold of 66%`);
  });
  
  // Test retrieval quality with a processed video
  it('should retrieve relevant context for questions', async function() {
    this.timeout(120000);
    
    // Create a temporary test script
    const testScriptPath = path.join(__dirname, 'temp_retriever_test.py');
    const testScript = `
import sys
import json
from rag_processor import process_video
from llama_index.core import QueryBundle

# Process a short educational video - using a Khan Academy video as an example
video_url = "https://www.youtube.com/watch?v=kVl6jG8ytcI"  # Short Khan Academy math video
result = process_video(video_url)

# Test retrieval with various questions
questions = [
    "What is the main topic of this video?",
    "What are the key concepts explained?",
    "Can you give an example from the video?"
]

retrieval_results = []
for question in questions:
    # Get results from both retrievers
    bm25_nodes = result["retrievers"]["bm25"].retrieve(question)
    fusion_nodes = result["retrievers"]["auto_merging"].retrieve(question)
    
    # Check if retrievers found content
    retrieval_results.append({
        "question": question,
        "bm25_found": len(bm25_nodes) > 0,
        "fusion_found": len(fusion_nodes) > 0,
        "bm25_sample": bm25_nodes[0].text[:100] if bm25_nodes else "",
        "fusion_sample": fusion_nodes[0].text[:100] if fusion_nodes else ""
    })

print(json.dumps(retrieval_results))
`;
    
    try {
      await fs.writeFile(testScriptPath, testScript);
      const output = await runPythonScript(testScriptPath);
      const results = JSON.parse(output);
      
      // Verify that retrievers found content for each question
      results.forEach(result => {
        assert.ok(result.bm25_found, `BM25 retriever found no content for: ${result.question}`);
        assert.ok(result.fusion_found, `Fusion retriever found no content for: ${result.question}`);
        assert.ok(result.bm25_sample, `BM25 retriever returned empty content for: ${result.question}`);
        assert.ok(result.fusion_sample, `Fusion retriever returned empty content for: ${result.question}`);
      });
      
      console.log('Retrieval test passed for all questions');
    } finally {
      // Clean up
      await fs.unlink(testScriptPath).catch(() => {});
    }
  });
  
  // Test end-to-end QA pipeline
  it('should generate accurate answers from video content', async function() {
    this.timeout(180000);
    
    // Create a temporary test script
    const testScriptPath = path.join(__dirname, 'temp_qa_test.py');
    const testScript = `
import sys
import json
import os
from rag_processor import process_video

# Set OpenAI API key from environment variable
os.environ["OPENAI_API_KEY"] = "${process.env.OPENAI_API_KEY}"

from polish_bot import generate_answer

# Process a short educational video
video_url = "https://www.youtube.com/watch?v=kVl6jG8ytcI"  # Short Khan Academy math video
result = process_video(video_url)

# Test questions
questions = [
    "What is the main topic of this video?",
    "Summarize the key points from the video"
]

qa_results = []
for question in questions:
    # Get results from fusion retriever
    nodes = result["retrievers"]["auto_merging"].retrieve(question)
    context = "\\n".join([node.text for node in nodes])
    
    # Generate answer
    answer = generate_answer(context, question)
    
    qa_results.append({
        "question": question,
        "context_length": len(context),
        "answer": answer
    })

print(json.dumps(qa_results))
`;
    
    try {
      await fs.writeFile(testScriptPath, testScript);
      const output = await runPythonScript(testScriptPath);
      const results = JSON.parse(output);
      
      // Verify that meaningful answers were generated
      results.forEach(result => {
        assert.ok(result.context_length > 100, `Insufficient context retrieved for: ${result.question}`);
        assert.ok(result.answer && result.answer.length > 50, `Answer too short for: ${result.question}`);
        assert.ok(!result.answer.includes("Error generating answer"), `Error in answer generation for: ${result.question}`);
      });
      
      console.log('QA pipeline test passed for all questions');
    } finally {
      // Clean up
      await fs.unlink(testScriptPath).catch(() => {});
    }
  });
});