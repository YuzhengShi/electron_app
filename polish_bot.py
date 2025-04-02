import streamlit as st
from openai import OpenAI
import os
import pyperclip
import streamlit.components.v1 as components

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize session state variables
if "responses" not in st.session_state:
    st.session_state.responses = []
if "analysis" not in st.session_state:
    st.session_state.analysis = None

# Function to add clipboard handler JavaScript
def add_clipboard_handler():
    """Add JavaScript to handle clipboard events from Electron"""
    js_code = """
    <script>
    // Listen for paste-from-clipboard events from Electron
    if (window.electron) {
        window.electron.receive('paste-from-clipboard', async () => {
            try {
                // Request clipboard text from the main process
                const clipboardText = await window.electron.invoke('read-clipboard');
                
                // Find the text areas and update them
                const textareas = document.querySelectorAll('textarea');
                if (textareas.length > 0) {
                    // Focus on the first textarea (it should be our input box)
                    textareas[0].focus();
                    
                    // Update the textarea value
                    textareas[0].value = clipboardText;
                    
                    // Trigger an input event to notify Streamlit
                    const event = new Event('input', { bubbles: true });
                    textareas[0].dispatchEvent(event);
                    
                    // Also trigger a change event
                    const changeEvent = new Event('change', { bubbles: true });
                    textareas[0].dispatchEvent(changeEvent);
                }
            } catch (error) {
                console.error('Error processing clipboard:', error);
            }
        });
    } else {
        console.log('Electron bridge not available');
    }
    </script>
    """
    components.html(js_code, height=0)

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
    
# Message analysis
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
st.title("💬 Communication Assistant")
tab1, tab2 = st.tabs(["✍️ Polisher", "🔍 Analyzer"])

with tab1:
    # Add the clipboard handler to the page
    add_clipboard_handler()
    
    st.header("📩 Message Polisher")

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
    if "responses" in st.session_state and st.session_state["responses"]:
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
            f"Version {i}:\n{subject}\n{body}" 
            for i, (subject, body) in enumerate(st.session_state["responses"], 1)
        ])
        
        st.download_button(
            label="💾 Download All Versions",
            data=all_responses,
            file_name="professional_responses.txt",
            mime="text/plain",
            use_container_width=True
        )

with tab2:
    # Add the clipboard handler to the page
    add_clipboard_handler()
    
    st.header("🤖 Message Analyzer")

    received_message = st.text_area("🏅 Paste a message to analyze:", height=150)

    if st.button("🔮 Analyze Message", use_container_width=True):
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
            
            if st.button("Copy Response", use_container_width=True):
                pyperclip.copy(finalized_response)
                st.success("Response copied to clipboard!")