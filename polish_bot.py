import streamlit as st
from openai import OpenAI
import os
import pyperclip
from llama_index.core import Settings
from rag_processor import process_video
from llama_index.embeddings.openai import OpenAIEmbedding

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-large")

# Initialize each session state variable individually
if "video_processed" not in st.session_state:
    st.session_state.video_processed = False
if "transcript" not in st.session_state:
    st.session_state.transcript = None
if "index" not in st.session_state:
    st.session_state.index = None
if "retriever" not in st.session_state:
    st.session_state.retriever = None
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
if "question_input" not in st.session_state:
    st.session_state.question_input = ""

# Function to update input when suggestion is clicked
def use_suggestion(suggestion_text):
    st.session_state.question_input = suggestion_text

def generate_video_summary(transcript: str) -> str:
    """Generate a concise summary of the video transcript"""
    try:
        # Truncate transcript if too long
        truncated_transcript = transcript[:8000] if len(transcript) > 8000 else transcript
        
        prompt = f"""
        Summarize this video transcript concisely:

        TRANSCRIPT:
        {truncated_transcript}

        INSTRUCTIONS:
        1. Create a brief summary (100-150 words)
        2. Focus on main topics and key points
        3. Use clear, straightforward language
        4. Structure as: brief overview followed by 3-5 main points

        SUMMARY:
        """
        
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You create concise, informative summaries of educational videos."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=250
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error generating summary: {str(e)}"
    
def generate_answer(context: str, question: str) -> str:
    """Generate LLM-based answer from retrieved context"""
    try:
        prompt = f"""
        You are a student helper answering questions about a transcript of a educational video.
        
        CONTEXT INFORMATION:
        {context}
        
        QUESTION:
        {question}
        
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
        """
        
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful educational assistant who always provides answers based on available context or general knowledge when needed."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error generating answer: {str(e)}"

def generate_suggestions(context: str, history: list) -> list:
    """Generate concise follow-up questions using LLM"""
    try:
        prompt = f"""
        You are generating concise follow-up questions for an educational video Q&A system.
        
        CONTEXT INFORMATION:
        {context}
        
        RECENT CONVERSATION HISTORY:
        {history[-3:] if history else "No previous conversation"}
        
        INSTRUCTIONS:
        1. Generate exactly 3 follow-up questions based on the context
        2. Make questions CONCISE
        3. Each question on its own line with no numbering
        4. Questions should be simple but insightful
        5. Use conversational language a student would use
        6. Focus on key concepts from the context
        7. Avoid questions that appear in conversation history
        
        EXAMPLES OF GOOD CONCISE QUESTIONS:
        How does X impact Y specifically?
        Why is concept Z important?
        What's the difference between A and B?
        
        THREE CONCISE FOLLOW-UP QUESTIONS:
        """
        
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You create extremely concise but insightful educational questions."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,  # Slightly higher temperature for creative but concise phrasing
            max_tokens=100    # Reduced token limit to encourage brevity
        )
        
        # Process and clean up questions
        questions = []
        for q in response.choices[0].message.content.split("\n"):
            q = q.strip()
            if q and not q.isspace():
                # Remove any numbering or bullet points
                q = q.lstrip("123.-• ")
                questions.append(q)
                
        return questions
    except Exception as e:
        return []
    
def generate_polite_response(user_input, content_type, recipient_type, num_responses=1):
    """Generate responses based on recipient type and content type"""
    format_rules = {
        "Professor": {
            "Text": """Microsoft Teams Message Rules (Professor):
            1. Formal but friendly tone
            2. Use proper salutations (Professor LastName)
            3. Stay strictly relevant to the original query
            5. 10-35 words maximum
            6. Output FROM STUDENT TO PROFESSOR""",
            
            "Email": """Outlook Email Rules (Professor):
            1. Subject line matching message intent
            2. Formal salutation (Dear Professor LastName)
            3. Mirror the user's original request style
            4. Professional closing (Sincerely/Respectfully)
            5. Signature: [Full Name]"""
        },
        "Classmate": {
            "Text": """Microsoft Teams Message Rules (Classmate):
            1. Casual friendly tone
            2. Use first names only ([Name])
            3. Match the user's message length/style
            4. Can include emojis
            5. 10-20 words maximum
            Example: "Hey [Name], wanna grab coffee before class?""",
            
            "Email": """Email Rules (Classmate):
            1. Simple subject line
            2. Informal greeting (Hi [Name])
            3. Mirror the user's original request
            4. Direct request/question
            5. Friendly sign-off (Cheers/Thanks)"""
        }
    }

    system_prompt = f"""
    You are a communication assistant helping craft messages for a student to his {recipient_type}.
    Create {num_responses} variations that:
    {format_rules[recipient_type][content_type]}
    
    KEY REQUIREMENTS:
    1. PRESERVE the original message's intent exactly
    2. MIRROR the user's writing style (formal/casual)
    3. USE APPROPRIATE PLACEHOLDERS:
       - Professor emails: [Full Name]
       - Classmate texts: [Name]
    
    FORMAT FOR EACH VARIATION:
    Variation [N]:
    Subject: [Subject if email]
    
    [Message body]
    
    ---
    
    Original message: "{user_input}"
    """

    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "Generate EXACT variations matching my message"}
            ],
            temperature=0.3,  # Lower temperature for more focused responses
            max_tokens=500,
            n=1
        )
        
        # Process responses
        clean_responses = []
        raw_response = response.choices[0].message.content
        
        # Split variations using the delimiter
        variations = [v.strip() for v in raw_response.split("---") if v.strip()]
        
        for variation in variations[:num_responses]:
            lines = [line.strip() for line in variation.split("\n") if line.strip()]
            
            subject = ""
            body = []
            found_subject = False
            
            for line in lines:
                if line.startswith("Subject:"):
                    subject = line.replace("Subject:", "").strip()
                    found_subject = True
                elif found_subject or content_type == "Text":
                    body.append(line)
            
            clean_body = "\n".join(body)
            
            # Fix placeholders for classmate texts
            if recipient_type == "Classmate" and content_type == "Text":
                clean_body = clean_body.replace("[Full Name]", "[Name]")
                clean_body = clean_body.replace("Full Name", "Name")
            
            clean_responses.append((subject, clean_body))
            
        return clean_responses

    except Exception as e:
        st.error(f"Error: {str(e)}")
        return []
    
# message analysis
def analyze_message(message):
    """Analyze received messages using LLM"""
    analysis_prompt = f"""
    Analyze this message from someone else:
    "{message}"

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
    """

    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a social communication assistant"},
                {"role": "user", "content": analysis_prompt}
            ],
            temperature=0.2,
            max_tokens=300
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error: {str(e)}"

def parse_analysis(raw_text):
    """Parse LLM response into structured data"""
    sections = {
        "emotion": "",
        "cues": [],
        "summary": "",
        "keywords": [],
        "responses": {}
    }
    
    current_section = None
    for line in raw_text.split('\n'):
        line = line.strip()
        if line.startswith("##EMOTION##"):
            current_section = "emotion"
        elif line.startswith("##SOCIAL CUES##"):
            current_section = "cues"
        elif line.startswith("##SUMMARY##"):
            current_section = "summary"
        elif line.startswith("##KEYWORDS##"):
            current_section = "keywords"
        elif line.startswith("##RESPONSES##"):
            current_section = "responses"
        elif current_section == "emotion" and line:
            sections["emotion"] = line.split(":")[-1].strip().lower()
        elif current_section == "cues" and line.startswith("-"):
            sections["cues"].append(line[1:].strip())
        elif current_section == "summary" and line:
            sections["summary"] = line
        elif current_section == "keywords" and line:
            sections["keywords"] = [kw.strip() for kw in line.split(",")]
        elif current_section == "responses" and ":" in line:
            tone, text = line.split(":", 1)
            sections["responses"][tone.strip().lower()] = text.strip()
    
    return sections

# Streamlit UI
tab1, tab2, tab3 = st.tabs(["Polisher", "Analyzer", "RAG"])

with tab1:
    st.title("📩 Commnucation Assistant")

    # Input Section
    user_input = st.text_area("✏️ Polish Your message:", height=100)
    col1, col2, col3 = st.columns(3)
    with col1:
        content_type = st.radio("📝 Format:", ["Text", "Email"])
    with col2:
        recipient_type = st.radio("👤 Recipient:", ["Professor", "Classmate"])
    with col3:
        num_responses = st.slider("🔢 Variations:", 1, 5, 2)

    # Generate Section
    if st.button("✨ Generate Messages", use_container_width=True) and user_input:
        with st.spinner(f"Creating {recipient_type} messages..."):
            responses = generate_polite_response(user_input, content_type, recipient_type, num_responses)
            st.session_state["responses"] = responses

    # Display Results
    if "responses" in st.session_state:
        st.markdown("---")
        
        for i, (subject, body) in enumerate(st.session_state["responses"], 1):
            st.markdown(f"#### 📄 Variation {i}")
            if content_type == "Email" and subject:
                st.markdown(f"**Subject:** {subject}")
            st.text_area(label="", 
                        value=body,
                        height=200,
                        key=f"response_{i}")
            if st.button(f"Copy Response", key=f"copy_button_{i}"):
                pyperclip.copy(body)
                st.success(f"Response {i} copied to clipboard!")

        # Download functionality
        all_responses = "\n\n".join([
            f"Version {i}:\n{resp}" 
            for i, resp in enumerate(st.session_state["responses"], 1)
        ])
        
        st.download_button(
            label="💾 Download All Versions",
            data=all_responses,
            file_name="professional_responses.txt",
            mime="text/plain",
            use_container_width=True
        )

with tab2:
    st.title("🤖 Analyze Messages")

    if "analysis" not in st.session_state:
        st.session_state.analysis = None

    received_message = st.text_area("🏅 Paste a message:", height=150)

    if st.button("🔮 Analyze Message"):
        if len(received_message) < 10:
            st.warning("Please enter a longer message to analyze")
        else:
            with st.spinner("Analyzing social cues..."):
                raw_analysis = analyze_message(received_message)
                if "Error:" in raw_analysis:
                    st.error(raw_analysis)
                else:
                    st.session_state.analysis = parse_analysis(raw_analysis)

    # Display analysis results
    if st.session_state.analysis:
        col1, col2 = st.columns(2)
        with col1:
            st.markdown("### 🕵️‍♂️ Emotion Detection")
            st.write(f"👁‍🗨 Primary emotion: **{st.session_state.analysis['emotion'].capitalize()}**")
            st.markdown("### 👓 Social Cues")
            for cue in st.session_state.analysis["cues"]:
                st.write(f"- {cue}")
            st.markdown("### 📌 Key Words")
            st.write(", ".join(st.session_state.analysis["keywords"]))

        with col2:
            st.markdown("### 💌 Message Summary")
            st.info(st.session_state.analysis["summary"])
            st.markdown("### 🎉 Response Suggestions")
            selected_tone_with_emoji = st.radio("Choose response tone:", ["😁 Positive", "😐 Neutral", "🙁 Negative"], index=1)

            # Extract just the word part (remove emoji)
            selected_tone = selected_tone_with_emoji.split(" ")[-1].lower()
            response_text = st.session_state.analysis["responses"].get(selected_tone, "")

            finalized_response = st.text_area("Suggestion response:", value=response_text, height=150)
            
            if st.button("Copy Response"):
                pyperclip.copy(finalized_response)
                st.success("Response copied to clipboard!")

# Video chat
with tab3:
    st.title("Ask your videos! 🎥💬")
    col1, col2 = st.columns([3, 1])
    with col1:
        video_url = st.text_input("🧷 Paste an URL here:", key="url_input")
    with col2:
        st.write("")
        st.write("")
        process_button = st.button("Process Video 🚀", use_container_width=True)

    if process_button:
        with st.spinner("Processing video..."):
            try:
                result = process_video(video_url)

                summary = generate_video_summary(result["transcript"])
                
                # Use the simplified retrievers
                vector_retriever = result["retrievers"]["vector"]
                
                st.session_state.update({
                    "video_processed": True,
                    "transcript": result["transcript"],
                    "retriever": vector_retriever,  # Use vector retriever directly
                    "index": result["index"],
                    "video_summary": summary
                })
                st.success("✅ Video processed! Ask away!")
            except Exception as e:
                st.error(f"Error processing video: {str(e)}")

    if st.session_state.video_processed:
        st.markdown("---")

        if "video_summary" in st.session_state:
            st.subheader("📝 Video Summary")
            st.info(st.session_state.video_summary)
            st.markdown("---")

        st.header("🔍 Ask Questions")
        
        # Text input with session state
        user_input = st.text_input("Your question about the video:", 
                                key="question_input")
        
        generate_button = st.button("✨ Get Answer", use_container_width=True)

        # Make sure we have a place to store the current answer
        if "current_answer" not in st.session_state:
            st.session_state.current_answer = None
        if "current_suggestions" not in st.session_state:
            st.session_state.current_suggestions = []
        
        if generate_button and user_input:
            with st.spinner("Finding the best answer..."):
                nodes = st.session_state.retriever.retrieve(user_input)
                context = "\n".join([node.text for node in nodes])
                
                # Generate answer
                answer = generate_answer(context, user_input)
                
                # Generate suggestions
                suggestions = generate_suggestions(context, st.session_state.chat_history)
                
                # Update history
                st.session_state.chat_history.append((user_input, answer))

                # Save current answer and suggestions in session state
                st.session_state.current_answer = answer
                st.session_state.current_suggestions = suggestions

        # Display results
        if st.session_state.current_answer:
            st.subheader("💡 Answer")
            st.write(st.session_state.current_answer)
            
            st.subheader("🤔 Suggested Questions")
            cols = st.columns(3)
            for i, q in enumerate(st.session_state.current_suggestions[:3]):
                with cols[i]:
                    # Pass the suggestion text to the callback function when clicked
                    if st.button(q, key=f"suggestion_{i}", on_click=use_suggestion, args=(q,), use_container_width=True):
                        pass

        # Collapsible chat history
        with st.expander("📚 View Conversation History"):
            if st.session_state.chat_history:
                for q, a in reversed(st.session_state.chat_history):
                    st.markdown(f"**Q:** {q}")
                    st.markdown(f"**A:** {a}")
                    st.markdown("---")
            else:
                st.write("No conversation history yet.")