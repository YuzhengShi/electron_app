const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');

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

describe('Video Processing Integration Tests', () => {
  // This test calls the actual Python function from rag_processor.py
  it('should extract audio from a video URL', async function() {
    this.timeout(60000); // Allow time for video download
    
    // Create a temporary test script that imports and calls extract_audio
    const testScriptPath = path.join(__dirname, 'temp_extract_audio_test.py');
    const testScript = `
import sys
import json
from rag_processor import extract_audio

result = extract_audio("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
print(json.dumps({"path": result}))
`;
    
    try {
      await fs.writeFile(testScriptPath, testScript);
      const output = await runPythonScript(testScriptPath);
      const result = JSON.parse(output);
      
      assert.ok(result.path, 'No audio file path returned');
      const fileExists = await fs.stat(result.path).catch(() => false);
      assert.ok(fileExists, 'Audio file does not exist');
    } finally {
      // Clean up
      await fs.unlink(testScriptPath).catch(() => {});
    }
  });
  
  it('should split audio with overlap', async function() {
    this.timeout(60000);
    
    // Create a temporary test script
    const testScriptPath = path.join(__dirname, 'temp_split_audio_test.py');
    const testScript = `
import sys
import json
import tempfile
import os
from rag_processor import extract_audio, split_audio_with_overlap

# Extract a short video for testing
audio_path = extract_audio("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

# Create a temporary directory for chunks
with tempfile.TemporaryDirectory() as temp_dir:
    # Split the audio
    chunks = split_audio_with_overlap(audio_path, temp_dir)
    
    # Get information about the chunks
    chunk_info = []
    for chunk_path in chunks:
        chunk_info.append({
            "path": chunk_path,
            "exists": os.path.exists(chunk_path),
            "size": os.path.getsize(chunk_path) if os.path.exists(chunk_path) else 0
        })
    
    print(json.dumps({
        "num_chunks": len(chunks),
        "chunks": chunk_info
    }))
`;
    
    try {
      await fs.writeFile(testScriptPath, testScript);
      const output = await runPythonScript(testScriptPath);
      const result = JSON.parse(output);
      
      assert.ok(result.num_chunks > 0, 'No audio chunks created');
      assert.ok(result.chunks.every(chunk => chunk.exists), 'Some audio chunks do not exist');
      assert.ok(result.chunks.every(chunk => chunk.size > 0), 'Some audio chunks are empty');
    } finally {
      // Clean up
      await fs.unlink(testScriptPath).catch(() => {});
    }
  });
  
  it('should transcribe audio chunks', async function() {
    this.timeout(120000);
    
    // Create a temporary test script
    const testScriptPath = path.join(__dirname, 'temp_transcribe_test.py');
    const testScript = `
import sys
import json
import tempfile
import os
from rag_processor import extract_audio, split_audio_with_overlap, transcribe_chunk

# Extract a short video for testing
audio_path = extract_audio("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

# Create a temporary directory for chunks
with tempfile.TemporaryDirectory() as temp_dir:
    # Split the audio
    chunks = split_audio_with_overlap(audio_path, temp_dir)
    
    # Transcribe first chunk only (to save time)
    if chunks:
        transcript = transcribe_chunk(chunks[0])
        
        print(json.dumps({
            "success": bool(transcript),
            "transcript_length": len(transcript),
            "sample": transcript[:100] if transcript else ""
        }))
    else:
        print(json.dumps({
            "success": False,
            "error": "No chunks created"
        }))
`;
    
    try {
      await fs.writeFile(testScriptPath, testScript);
      const output = await runPythonScript(testScriptPath);
      const result = JSON.parse(output);
      
      assert.ok(result.success, 'Transcription failed');
      assert.ok(result.transcript_length > 0, 'Transcription is empty');
      assert.ok(result.sample, 'No sample transcript available');
    } finally {
      // Clean up
      await fs.unlink(testScriptPath).catch(() => {});
    }
  });
  
  it('should build RAG pipeline from transcript', async function() {
    this.timeout(30000);
    
    // Create a temporary test script
    const testScriptPath = path.join(__dirname, 'temp_rag_build_test.py');
    const testScript = `
import sys
import json
from rag_processor import build_rag_pipeline

# Sample transcript for testing
transcript = """
In this lecture, we're discussing artificial intelligence and its applications.
Machine learning is a subset of AI that involves training models on data.
Deep learning is a subset of machine learning that uses neural networks with multiple layers.
Natural language processing is another important application of AI.
"""

# Build RAG pipeline
result = build_rag_pipeline(transcript)

# Check if pipeline components were created successfully
print(json.dumps({
    "index_created": bool(result["index"]),
    "bm25_retriever_created": bool(result["retrievers"]["bm25"]),
    "auto_merging_retriever_created": bool(result["retrievers"]["auto_merging"])
}))
`;
    
    try {
      await fs.writeFile(testScriptPath, testScript);
      const output = await runPythonScript(testScriptPath);
      const result = JSON.parse(output);
      
      assert.ok(result.index_created, 'Index not created successfully');
      assert.ok(result.bm25_retriever_created, 'BM25 retriever not created successfully');
      assert.ok(result.auto_merging_retriever_created, 'Auto-merging retriever not created successfully');
    } finally {
      // Clean up
      await fs.unlink(testScriptPath).catch(() => {});
    }
  });
  
  it('should process a video end-to-end', async function() {
    this.timeout(180000); // Allow up to 3 minutes for full processing
    
    // Create a temporary test script
    const testScriptPath = path.join(__dirname, 'temp_process_video_test.py');
    const testScript = `
import sys
import json
from rag_processor import process_video

# Process a short video
result = process_video("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

# Return information about the processing result
print(json.dumps({
    "transcript_length": len(result["transcript"]),
    "has_index": bool(result["index"]),
    "has_retrievers": bool(result["retrievers"]),
    "transcript_sample": result["transcript"][:100] if result["transcript"] else ""
}))
`;
    
    try {
      await fs.writeFile(testScriptPath, testScript);
      const output = await runPythonScript(testScriptPath);
      const result = JSON.parse(output);
      
      assert.ok(result.transcript_length > 0, 'No transcript generated');
      assert.ok(result.has_index, 'No index created');
      assert.ok(result.has_retrievers, 'No retrievers created');
      assert.ok(result.transcript_sample, 'No transcript sample available');
    } finally {
      // Clean up
      await fs.unlink(testScriptPath).catch(() => {});
    }
  });
});